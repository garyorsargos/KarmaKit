import { EventEmitter } from 'events';
import {
  KarmaKitConfig,
  UserAction,
  UserScore,
  KarmaKitEvents,
  TrustLevel,
  TrustLevelConfig,
  ActionConfig,
  KarmaEvent,
  LeaderboardEntry
} from './types';
import { DatabaseService } from './services/DatabaseService';
import { CacheService } from './services/CacheService';

export class KarmaKit extends EventEmitter {
  private config: Required<KarmaKitConfig>;
  private actionCounts: Map<string, number>;
  private db: DatabaseService;
  private cache: CacheService;
  private defaultTrustLevels: TrustLevelConfig[] = [
    { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5, decayRate: 0.5 },
    { name: 'Contributor', minScore: 0, actionWeight: 1, decayRate: 0.2 },
    { name: 'Trusted', minScore: 50, actionWeight: 1.5, decayRate: 0.1 },
    { name: 'Expert', minScore: 100, actionWeight: 2, decayRate: 0 }
  ];

  constructor(config: KarmaKitConfig = {}) {
    super();
    this.config = {
      initialScore: config.initialScore ?? 0,
      maxScore: config.maxScore ?? Infinity,
      minScore: config.minScore ?? -Infinity,
      actionTypes: config.actionTypes ?? {
        upvote: { baseScore: 1 },
        downvote: { baseScore: -1 },
        report: { baseScore: -2 },
        achievement: { baseScore: 5 }
      },
      enableRateLimiting: config.enableRateLimiting ?? true,
      rateLimit: {
        maxActions: config.rateLimit?.maxActions ?? 100,
        timeWindow: config.rateLimit?.timeWindow ?? 3600000 // 1 hour
      },
      trustLevels: config.trustLevels ?? this.defaultTrustLevels,
      scoreDecay: {
        enabled: config.scoreDecay?.enabled ?? false,
        baseRate: config.scoreDecay?.baseRate ?? 0,
        minScore: config.scoreDecay?.minScore ?? 0,
        maxRate: config.scoreDecay?.maxRate ?? Infinity
      },
      leaderboard: {
        size: config.leaderboard?.size ?? 10,
        timeWindow: config.leaderboard?.timeWindow ?? 0,
        includeInactive: config.leaderboard?.includeInactive ?? true,
        minActivity: config.leaderboard?.minActivity ?? 0
      },
      eventLogging: {
        enabled: config.eventLogging?.enabled ?? true,
        maxEvents: config.eventLogging?.maxEvents ?? 1000,
        retentionPeriod: config.eventLogging?.retentionPeriod ?? 0
      }
    };

    this.actionCounts = new Map();
    this.db = new DatabaseService();
    this.cache = new CacheService();

    // Initialize trust levels in database
    this.db.initializeTrustLevels(this.config.trustLevels).catch(console.error);
  }

  /**
   * Track a user action and update their score accordingly
   */
  async trackUserAction(action: UserAction): Promise<UserScore> {
    const { userId, action: actionType } = action;

    // Check rate limiting
    if (this.config.enableRateLimiting) {
      const actionCount = this.actionCounts.get(userId) ?? 0;
      if (actionCount >= (this.config.rateLimit?.maxActions ?? 100)) {
        throw new Error('Rate limit exceeded');
      }
      this.actionCounts.set(userId, actionCount + 1);
    }

    // Get user score from cache or database
    let userScore = await this.cache.getUserScore(userId);
    if (!userScore) {
      userScore = await this.db.getUserScore(userId) ?? this.createInitialUserScore(userId);
    }

    // Get action configuration
    const actionConfig = this.config.actionTypes[actionType];
    if (!actionConfig) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    // Validate action if custom validator exists
    if (actionConfig.validate && !(await actionConfig.validate(action, userScore))) {
      throw new Error('Action validation failed');
    }

    // Calculate score change
    const scoreChange = actionConfig.calculateScore
      ? await actionConfig.calculateScore(action, userScore)
      : this.calculateWeightedScore(actionConfig, userScore, action);

    const newScore = Math.min(
      Math.max(userScore.score + scoreChange, this.config.minScore),
      this.config.maxScore
    );

    // Get new trust level
    const newTrustLevel = this.calculateTrustLevel(newScore);
    const trustLevelChanged = newTrustLevel.name !== userScore.trustLevel.name;

    // Update user score
    const updatedScore: UserScore = {
      ...userScore,
      score: newScore,
      trustLevel: newTrustLevel,
      recentActions: [...userScore.recentActions, action].slice(-10),
      lastUpdated: Date.now(),
      activityHistory: this.updateActivityHistory(userScore.activityHistory, action),
      events: this.updateEvents(userScore.events, {
        type: 'action',
        timestamp: Date.now(),
        data: {
          action,
          scoreChange,
          ...(trustLevelChanged && {
            trustLevelChange: {
              from: userScore.trustLevel.name,
              to: newTrustLevel.name
            }
          })
        }
      })
    };

    // Save to database and cache
    await Promise.all([
      this.db.createOrUpdateUserScore(userId, updatedScore),
      this.cache.setUserScore(userId, updatedScore)
    ]);

    // Invalidate leaderboard cache
    await this.cache.invalidateLeaderboard();

    // Emit events
    this.emit('score:updated', userId, newScore);
    this.emit('action:tracked', action);
    this.emit('trust:updated', userId, updatedScore.trustLevel);
    this.emit('event:logged', updatedScore.events[updatedScore.events.length - 1]);

    return updatedScore;
  }

  /**
   * Get a user's current score and trust level
   */
  async getUserScore(userId: string): Promise<UserScore | undefined> {
    // Try cache first
    const cachedScore = await this.cache.getUserScore(userId);
    if (cachedScore) return cachedScore;

    // Fall back to database
    const dbScore = await this.db.getUserScore(userId);
    if (dbScore) {
      // Cache for future requests
      await this.cache.setUserScore(userId, dbScore);
      return dbScore;
    }

    return undefined;
  }

  /**
   * Get user's event history
   */
  async getUserEvents(userId: string, options: {
    type?: KarmaEvent['type'];
    startTime?: number;
    endTime?: number;
  } = {}): Promise<KarmaEvent[]> {
    return this.db.getUserEvents(userId, options);
  }

  /**
   * Get current leaderboard
   */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    // Try cache first
    const cachedLeaderboard = await this.cache.getLeaderboard();
    if (cachedLeaderboard) return cachedLeaderboard;

    // Fall back to database
    const leaderboard = await this.db.getLeaderboard({
      limit: this.config.leaderboard?.size ?? 10,
      timeWindow: this.config.leaderboard?.timeWindow ?? 0,
      minActivity: this.config.leaderboard?.minActivity ?? 0,
      includeInactive: this.config.leaderboard?.includeInactive ?? true
    });

    // Cache for future requests
    await this.cache.setLeaderboard(leaderboard);

    return leaderboard;
  }

  /**
   * Apply score decay to all users
   * Should be called periodically (e.g., daily)
   */
  async applyScoreDecay(): Promise<void> {
    if (!this.config.scoreDecay?.enabled) return;

    const now = Date.now();
    const userScores = await this.db.getLeaderboard({ includeInactive: true });

    for (const { userId } of userScores) {
      const userScore = await this.getUserScore(userId);
      if (!userScore) continue;

      const daysSinceLastUpdate = (now - userScore.lastUpdated) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUpdate < 1) continue;

      const decayAmount = this.calculateDecayAmount(userScore, daysSinceLastUpdate);
      if (decayAmount === 0) continue;

      const newScore = Math.max(userScore.score - decayAmount, this.config.minScore);
      const updatedScore: UserScore = {
        ...userScore,
        score: newScore,
        trustLevel: this.calculateTrustLevel(newScore),
        lastUpdated: now,
        events: this.updateEvents(userScore.events, {
          type: 'decay',
          timestamp: now,
          data: { decayAmount }
        })
      };

      // Save to database and cache
      await Promise.all([
        this.db.createOrUpdateUserScore(userId, updatedScore),
        this.cache.setUserScore(userId, updatedScore)
      ]);

      // Invalidate leaderboard cache
      await this.cache.invalidateLeaderboard();

      // Emit events
      this.emit('decay:applied', userId, decayAmount);
      this.emit('score:updated', userId, newScore);
      this.emit('trust:updated', userId, updatedScore.trustLevel);
      this.emit('event:logged', updatedScore.events[updatedScore.events.length - 1]);
    }
  }

  /**
   * Reset rate limiting counters
   * Should be called periodically (e.g., every hour)
   */
  resetRateLimits(): void {
    this.actionCounts.clear();
  }

  private createInitialUserScore(userId: string): UserScore {
    return {
      score: this.config.initialScore,
      trustLevel: this.calculateTrustLevel(this.config.initialScore),
      recentActions: [],
      lastUpdated: Date.now(),
      activityHistory: {
        totalActions: 0,
        actionCounts: {},
        lastActivity: Date.now()
      },
      events: []
    };
  }

  private calculateWeightedScore(
    actionConfig: ActionConfig,
    userScore: UserScore,
    action: UserAction
  ): number {
    const weights = actionConfig.weights ?? {};
    const trustLevelWeight = weights.trustLevel ?? 1;
    const activityHistoryWeight = weights.activityHistory ?? 1;
    const contentImportanceWeight = weights.contentImportance ?? 1;

    const contentImportance = action.metadata?.contentImportance ?? 5;
    const normalizedContentImportance = contentImportance / 10; // Normalize to 0-1

    return (
      actionConfig.baseScore *
      userScore.trustLevel.actionWeight *
      trustLevelWeight *
      activityHistoryWeight *
      (1 + normalizedContentImportance * contentImportanceWeight)
    );
  }

  private calculateTrustLevel(score: number): TrustLevel {
    const trustLevel = this.config.trustLevels
      .sort((a, b) => b.minScore - a.minScore)
      .find(level => score >= level.minScore);

    if (!trustLevel) {
      return {
        name: 'Newcomer',
        minScore: -Infinity,
        actionWeight: 0.5,
        decayRate: 0.5,
        badge: '🌱',
        privileges: ['basic_access']
      };
    }

    return {
      name: trustLevel.name,
      minScore: trustLevel.minScore,
      actionWeight: trustLevel.actionWeight,
      decayRate: trustLevel.decayRate,
      badge: trustLevel.badge ?? '⭐',
      privileges: trustLevel.privileges ?? ['basic_access']
    };
  }

  private calculateDecayAmount(userScore: UserScore, daysSinceLastUpdate: number): number {
    if (!this.config.scoreDecay?.enabled) return 0;

    const { baseRate, minScore, maxRate } = this.config.scoreDecay;
    if (userScore.score <= minScore) return 0;

    const decayRate = Math.min(
      userScore.trustLevel.decayRate * baseRate,
      maxRate
    );

    return Math.floor(decayRate * daysSinceLastUpdate);
  }

  private updateActivityHistory(
    currentHistory: UserScore['activityHistory'],
    action: UserAction
  ): UserScore['activityHistory'] {
    const actionCounts = { ...currentHistory.actionCounts };
    actionCounts[action.action] = (actionCounts[action.action] ?? 0) + 1;

    return {
      totalActions: currentHistory.totalActions + 1,
      actionCounts,
      lastActivity: Date.now()
    };
  }

  private updateEvents(currentEvents: KarmaEvent[], newEvent: KarmaEvent): KarmaEvent[] {
    const events = [...currentEvents, newEvent];

    // Apply retention period if configured
    if ((this.config.eventLogging?.retentionPeriod ?? 0) > 0) {
      const cutoffTime = Date.now() - (this.config.eventLogging?.retentionPeriod ?? 0);
      return events.filter(event => event.timestamp > cutoffTime);
    }

    // Apply max events limit
    return events.slice(-(this.config.eventLogging?.maxEvents ?? 1000));
  }

  async close(): Promise<void> {
    await Promise.all([
      this.db.close(),
      this.cache.close()
    ]);
  }

  async updateTrustLevel(userId: string, trustLevel: TrustLevel): Promise<UserScore> {
    const userScore = await this.getUserScore(userId);
    if (!userScore) {
      throw new Error('User not found');
    }

    const updatedScore: UserScore = {
      ...userScore,
      trustLevel,
      events: this.updateEvents(userScore.events, {
        type: 'trust_change',
        timestamp: Date.now(),
        data: {
          trustLevelChange: {
            from: userScore.trustLevel.name,
            to: trustLevel.name
          }
        }
      })
    };

    // Save to database and cache
    await Promise.all([
      this.db.createOrUpdateUserScore(userId, updatedScore),
      this.cache.setUserScore(userId, updatedScore)
    ]);

    // Invalidate leaderboard cache
    await this.cache.invalidateLeaderboard();

    // Emit events
    this.emit('trust:updated', userId, trustLevel);
    this.emit('event:logged', updatedScore.events[updatedScore.events.length - 1]);

    return updatedScore;
  }
} 
import { EventEmitter } from 'events';
import {
  KarmaKitConfig,
  UserAction,
  UserScore,
  KarmaKitEvents,
  TrustLevel,
  TrustLevelConfig,
  ActionConfig,
  KarmaEvent
} from './types';
import { DatabaseService } from './services/DatabaseService';
import { CacheService } from './services/CacheService';

export class KarmaKit extends EventEmitter {
  private config: Required<KarmaKitConfig>;
  private actionCounts: Map<string, number>;
  private db: DatabaseService;
  private cache: CacheService;
  private defaultTrustLevels: TrustLevelConfig[] = [
    { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5 },
    { name: 'Contributor', minScore: 0, actionWeight: 1 },
    { name: 'Trusted', minScore: 50, actionWeight: 1.5 },
    { name: 'Expert', minScore: 100, actionWeight: 2 }
  ];

  constructor(
    config: KarmaKitConfig = {},
    db?: DatabaseService,
    cache?: CacheService
  ) {
    super();
    this.config = {
      initialScore: config.initialScore ?? 0,
      maxScore: config.maxScore ?? Infinity,
      minScore: config.minScore ?? 0,
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
    this.db = db ?? new DatabaseService();
    this.cache = cache ?? new CacheService();

    // Initialize trust levels in database
    this.db.initializeTrustLevels(this.config.trustLevels).catch(console.error);
  }

  /**
   * Track a user action and update their score accordingly
   */
  async trackUserAction(action: UserAction): Promise<UserScore> {
    const { userId, action: actionType } = action;

    // Get current user score or create new one
    let userScore = await this.getUserScore(userId);
    if (!userScore) {
      userScore = this.createInitialUserScore(userId);
    }

    // Check rate limiting
    if (this.config.enableRateLimiting) {
      const actionCount = this.actionCounts.get(userId) || 0;
      if (actionCount >= this.config.rateLimit.maxActions) {
        throw new Error('Rate limit exceeded');
      }
      this.actionCounts.set(userId, actionCount + 1);
    }

    // Calculate score change
    const scoreChange = this.calculateWeightedScore(action, userScore.trustLevel);
    const newScore = Math.min(
      Math.max(userScore.score + scoreChange, this.config.minScore),
      this.config.maxScore
    );

    // Check for trust level change
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

    // Emit events
    this.emit('score:updated', userId, newScore);
    this.emit('action:tracked', action);
    if (trustLevelChanged) {
      this.emit('trust:updated', userId, updatedScore.trustLevel);
    }
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
  async getUserEvents(
    userId: string,
    options: {
      type?: KarmaEvent['type'];
      startTime?: number;
      endTime?: number;
    } = {}
  ): Promise<KarmaEvent[]> {
    const { type, startTime, endTime } = options;
    
    // Get events from database
    const events = await this.db.getUserEvents(userId, {
      type,
      startTime,
      endTime
    });

    // Apply max events limit if configured
    let filteredEvents = events;
    if (this.config.eventLogging?.maxEvents) {
      filteredEvents = events.slice(-this.config.eventLogging.maxEvents);
    }

    // Sort events by timestamp in descending order
    return filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
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

  private calculateWeightedScore(action: UserAction, trustLevel: TrustLevel): number {
    const actionConfig = this.config.actionTypes[action.action];
    if (!actionConfig) return 0;

    let score = actionConfig.baseScore;
    
    // Apply trust level weight
    score *= trustLevel.actionWeight;

    // Apply content importance if specified
    if (action.metadata?.contentImportance) {
      score *= (action.metadata.contentImportance + 1);
    }

    return score;
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
        badge: '🌱',
        privileges: ['basic_access']
      };
    }

    return {
      name: trustLevel.name,
      minScore: trustLevel.minScore,
      actionWeight: trustLevel.actionWeight,
      badge: trustLevel.badge ?? '⭐',
      privileges: trustLevel.privileges ?? ['basic_access']
    };
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

  private updateEvents(events: KarmaEvent[], newEvent: KarmaEvent): KarmaEvent[] {
    const updatedEvents = [...events, newEvent];
    
    // Apply retention period if configured
    if (this.config.eventLogging?.retentionPeriod) {
      const cutoffTime = Date.now() - this.config.eventLogging.retentionPeriod;
      return updatedEvents.filter(event => event.timestamp >= cutoffTime);
    }
    
    // Apply max events limit if configured
    if (this.config.eventLogging?.maxEvents) {
      const maxEvents = this.config.eventLogging.maxEvents;
      return updatedEvents.slice(-maxEvents);
    }
    
    return updatedEvents;
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

    // Emit events
    this.emit('trust:updated', userId, trustLevel);
    this.emit('event:logged', updatedScore.events[updatedScore.events.length - 1]);

    return updatedScore;
  }
} 
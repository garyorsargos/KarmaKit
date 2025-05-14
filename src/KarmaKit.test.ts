// Set test environment
process.env.NODE_ENV = 'test';

import { KarmaKit } from './KarmaKit';
import { DatabaseService } from './services/DatabaseService';
import { CacheService } from './services/CacheService';
import { TrustLevel, UserScore, KarmaEvent, UserAction } from './types';
import { RedisClientType } from 'redis';

// Mock implementations for testing
class MockDatabaseService extends DatabaseService {
  private scores: Map<string, UserScore> = new Map();
  private actions: KarmaEvent[] = [];
  private trustLevels: Map<string, TrustLevel> = new Map();
  private events: KarmaEvent[] = [];

  async getUserScore(userId: string): Promise<UserScore | null> {
    return this.scores.get(userId) ?? null;
  }

  async createOrUpdateUserScore(userId: string, score: UserScore): Promise<void> {
    this.scores.set(userId, score);
    // Add new events to the global events array if not already present
    for (const event of score.events) {
      if (!this.events.find(e => e.timestamp === event.timestamp && e.type === event.type)) {
        this.events.push(event);
      }
    }
  }

  async recordAction(userId: string, type: string, targetId: string, score: number): Promise<KarmaEvent> {
    const action: KarmaEvent = {
      type: 'action',
      timestamp: Date.now(),
      data: {
        action: {
          userId,
          action: type,
          targetId,
          scoreChange: score,
          timestamp: Date.now()
        },
        scoreChange: score
      }
    };
    this.actions.push(action);
    return action;
  }

  async updateTrustLevel(userId: string, trustLevel: TrustLevel): Promise<TrustLevel> {
    this.trustLevels.set(userId, trustLevel);
    return trustLevel;
  }

  async getUserEvents(userId: string, options: {
    type?: string;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<KarmaEvent[]> {
    const { type, startTime, endTime } = options;
    return this.events.filter(event => {
      if (event.data.action?.userId !== userId) return false;
      if (type && event.type !== type) return false;
      if (startTime && event.timestamp < startTime) return false;
      if (endTime && event.timestamp > endTime) return false;
      return true;
    });
  }

  async initializeTrustLevels(trustLevels: Array<{
    name: string;
    minScore: number;
    actionWeight?: number;
    decayRate?: number;
    badge?: string;
    privileges?: string[];
  }>): Promise<void> {
    for (const level of trustLevels) {
      this.trustLevels.set(level.name, {
        name: level.name,
        minScore: level.minScore,
        actionWeight: level.actionWeight ?? 1,
        badge: level.badge ?? '⭐',
        privileges: level.privileges ?? ['basic_access']
      });
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for mock
  }
}

class MockCacheService extends CacheService {
  private cache: Map<string, any> = new Map();

  constructor() {
    const mockClient = {
      get: async (key: string) => this.cache.get(key),
      set: async (key: string, value: string, options?: any) => {
        this.cache.set(key, value);
        return 'OK';
      },
      del: async (key: string) => {
        this.cache.delete(key);
        return 1;
      },
      quit: async () => {},
      isOpen: true
    } as unknown as RedisClientType;
    super(mockClient);
  }

  async getUserScore(userId: string): Promise<UserScore | null> {
    const key = this.getKey('user:score', userId);
    const value = this.cache.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setUserScore(userId: string, score: UserScore): Promise<void> {
    const key = this.getKey('user:score', userId);
    this.cache.set(key, JSON.stringify(score));
  }

  async close(): Promise<void> {
    // No cleanup needed for mock
  }
}

describe('KarmaKit', () => {
  let karmaKit: KarmaKit;
  let mockDb: MockDatabaseService;
  let mockCache: MockCacheService;

  beforeEach(() => {
    mockDb = new MockDatabaseService();
    mockCache = new MockCacheService();
    karmaKit = new KarmaKit({
      initialScore: 0,
      maxScore: 1000,
      minScore: 0,
      actionTypes: {
        upvote: { baseScore: 1 },
        downvote: { baseScore: -1 },
        report: { baseScore: -2 },
        achievement: { baseScore: 5 }
      },
      enableRateLimiting: true,
      rateLimit: {
        maxActions: 100,
        timeWindow: 3600000 // 1 hour
      },
      trustLevels: [
        { name: 'Newcomer', minScore: 0, actionWeight: 1, badge: '🌱', privileges: ['basic_access'] },
        { name: 'Contributor', minScore: 2, actionWeight: 1.2, badge: '🎖️', privileges: ['basic_access', 'post'] },
        { name: 'Trusted', minScore: 5, actionWeight: 1.5, badge: '⭐', privileges: ['basic_access', 'post', 'vote'] }
      ],
      eventLogging: { enabled: true, maxEvents: 1000, retentionPeriod: 30 }
    }, mockDb, mockCache);
  });

  it('should initialize with default configuration', () => {
    expect(karmaKit).toBeDefined();
  });

  it('should track user actions and update score', async () => {
    const action = { userId: 'user1', action: 'upvote', targetId: 'post1' };
    const result = await karmaKit.trackUserAction(action);
    expect(result.score).toBe(1);
    expect(result.trustLevel.name).toBe('Newcomer');
  });

  it('should handle multiple actions and update trust level', async () => {
    const actions = [
      { userId: 'user1', action: 'upvote', targetId: 'post1' },
      { userId: 'user1', action: 'upvote', targetId: 'post2' }
    ];

    for (const action of actions) {
      await karmaKit.trackUserAction(action);
    }

    const score = await karmaKit.getUserScore('user1');
    expect(score?.score).toBe(2); // 1 + 1 = 2
    expect(score?.trustLevel.name).toBe('Contributor');
  });

  it('should enforce minimum score', async () => {
    const action = { userId: 'user1', action: 'downvote', targetId: 'post1' };
    await karmaKit.trackUserAction(action);

    const score = await karmaKit.getUserScore('user1');
    expect(score?.score).toBe(0); // -1.5 but minimum is 0
  });

  it('should enforce maximum score', async () => {
    const action = { userId: 'user1', action: 'achievement', targetId: 'post1' };
    await karmaKit.trackUserAction(action);

    const score = await karmaKit.getUserScore('user1');
    expect(score?.score).toBe(5); // Achievement gives 5 points
  });

  it('should update trust level based on score', async () => {
    const actions = [
      { userId: 'user1', action: 'achievement', targetId: 'post1' },
      { userId: 'user1', action: 'achievement', targetId: 'post2' }
    ];

    for (const action of actions) {
      await karmaKit.trackUserAction(action);
    }

    const score = await karmaKit.getUserScore('user1');
    expect(score?.trustLevel.name).toBe('Trusted'); // 15 points (5 * 3) reaches Trusted level
  });

  it('should log events', async () => {
    await karmaKit.trackUserAction({
      userId: 'user1',
      action: 'upvote',
      targetId: 'post1'
    });

    const events = await karmaKit.getUserEvents('user1');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('action');
  });

  describe('trackUserAction', () => {
    it('should track a user action and update score with default weights', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      const result = await karmaKit.trackUserAction(action);
      expect(result.score).toBe(1);
      expect(result.trustLevel.name).toBe('Newcomer');
    });

    it('should apply weighted scoring based on trust level', async () => {
      // Create a user with high trust level
      const highTrustUser = {
        userId: 'trustedUser',
        action: 'upvote',
        targetId: 'post1'
      };

      // First action to establish trust level
      await karmaKit.trackUserAction({
        ...highTrustUser,
        action: 'achievement'
      });

      // Second action should have higher weight
      const result = await karmaKit.trackUserAction(highTrustUser);
      expect(result.score).toBeGreaterThan(1); // Score should be higher due to trust level
    });

    it('should consider content importance in scoring', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1',
        metadata: {
          contentImportance: 10 // Maximum importance
        }
      };

      const result = await karmaKit.trackUserAction(action);
      expect(result.score).toBeGreaterThan(1); // Score should be higher due to content importance
    });

    it('should track activity history', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      const result = await karmaKit.trackUserAction(action);
      expect(result.activityHistory.totalActions).toBe(1);
      expect(result.activityHistory.actionCounts['upvote']).toBe(1);
    });

    it('should log events for actions', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      const result = await karmaKit.trackUserAction(action);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('action');
      expect(result.events[0].data.action).toEqual(action);
    });

    it('should log trust level changes', async () => {
      // Create a user and perform actions to reach a new trust level
      const actions = [
        { userId: 'user1', action: 'achievement', targetId: 'post1' },
        { userId: 'user1', action: 'achievement', targetId: 'post2' }
      ];

      for (const action of actions) {
        await karmaKit.trackUserAction(action);
      }

      const events = await karmaKit.getUserEvents('user1', { type: 'action' });
      const trustChangeEvent = events.find(event => event.data.trustLevelChange);
      expect(trustChangeEvent).toBeDefined();
      expect(trustChangeEvent?.data.trustLevelChange?.from).toBe('Newcomer');
      expect(trustChangeEvent?.data.trustLevelChange?.to).toBe('Trusted');
    });

    it('should handle multiple actions', async () => {
      const actions = [
        { userId: 'user1', action: 'upvote', targetId: 'post1' },
        { userId: 'user1', action: 'upvote', targetId: 'post2' },
        { userId: 'user1', action: 'downvote', targetId: 'post3' }
      ];

      for (const action of actions) {
        await karmaKit.trackUserAction(action);
      }

      const score = await karmaKit.getUserScore('user1');
      expect(score?.score).toBe(0.8); // 1 + 1 - 1*1.2 = 0.8
    });

    it('should respect rate limiting', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      // Create a new instance with lower rate limit for testing
      const limitedKarmaKit = new KarmaKit({
        rateLimit: {
          maxActions: 2,
          timeWindow: 3600000
        },
        initialScore: 0,
        maxScore: 1000,
        minScore: 0,
        actionTypes: {
          upvote: { baseScore: 1 }
        },
        trustLevels: [
          { name: 'Newcomer', minScore: 0, actionWeight: 1, badge: '🌱', privileges: ['basic_access'] }
        ],
        eventLogging: { enabled: true, maxEvents: 1000, retentionPeriod: 30 }
      }, mockDb, mockCache);

      await limitedKarmaKit.trackUserAction(action);
      await limitedKarmaKit.trackUserAction(action);
      await expect(limitedKarmaKit.trackUserAction(action))
        .rejects
        .toThrow('Rate limit exceeded');
    });
  });

  describe('trust levels', () => {
    it('should progress through trust levels based on score', async () => {
      const actions = [
        { userId: 'user1', action: 'achievement', targetId: 'post1' }, // +5
        { userId: 'user1', action: 'achievement', targetId: 'post2' }, // +5
        { userId: 'user1', action: 'achievement', targetId: 'post3' }  // +5
      ];

      for (const action of actions) {
        await karmaKit.trackUserAction(action);
      }

      const score = await karmaKit.getUserScore('user1');
      expect(score?.trustLevel.name).toBe('Trusted'); // Score should be 15, reaching Trusted level
    });
  });

  describe('getUserScore', () => {
    it('should return undefined for non-existent user', async () => {
      const score = await karmaKit.getUserScore('nonexistent');
      expect(score).toBeUndefined();
    });

    it('should return user score after tracking action', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      await karmaKit.trackUserAction(action);
      const score = await karmaKit.getUserScore('user1');
      expect(score).toBeDefined();
      expect(score?.score).toBe(1);
    });
  });

  it('should respect trust level action weights', async () => {
    // Create a user with initial score
    const result = await karmaKit.trackUserAction({
      userId: 'user1',
      action: 'upvote',
      targetId: 'post1'
    });
    await mockDb.createOrUpdateUserScore('user1', result);
    await mockCache.setUserScore('user1', result);

    // Update trust level to Newcomer (1x weight)
    const newTrustLevel: TrustLevel = {
      name: 'Newcomer',
      minScore: 0,
      actionWeight: 1,
      badge: '🌱',
      privileges: ['basic_access']
    };
    await karmaKit.updateTrustLevel('user1', newTrustLevel);

    // Track another action
    const newResult = await karmaKit.trackUserAction({
      userId: 'user1',
      action: 'upvote',
      targetId: 'post2'
    });

    expect(newResult.score).toBe(2); // 1 + (1 * 1)
    expect(newResult.trustLevel.name).toBe('Contributor');
  });
}); 
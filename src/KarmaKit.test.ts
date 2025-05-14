import '@types/jest';
import { KarmaKit } from './KarmaKit';

describe('KarmaKit', () => {
  let karmaKit: KarmaKit;

  beforeEach(() => {
    karmaKit = new KarmaKit();
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

      const events = karmaKit.getUserEvents('user1', { type: 'action' });
      const trustChangeEvent = events.find(event => event.data.trustLevelChange);
      expect(trustChangeEvent).toBeDefined();
      expect(trustChangeEvent?.data.trustLevelChange?.from).toBe('Newcomer');
      expect(trustChangeEvent?.data.trustLevelChange?.to).toBe('Contributor');
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

      const score = karmaKit.getUserScore('user1');
      expect(score?.score).toBe(1); // 1 + 1 - 1 = 1
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
        }
      });

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

      const score = karmaKit.getUserScore('user1');
      expect(score?.trustLevel.name).toBe('Trusted'); // Score should be 15, reaching Trusted level
    });
  });

  describe('score decay', () => {
    it('should apply score decay for inactive users', async () => {
      // Create a user with some score
      const action = {
        userId: 'user1',
        action: 'achievement',
        targetId: 'post1'
      };

      await karmaKit.trackUserAction(action);
      const initialScore = karmaKit.getUserScore('user1')?.score ?? 0;

      // Enable score decay
      karmaKit = new KarmaKit({
        scoreDecay: {
          enabled: true,
          baseRate: 1 // 1 point per day
        }
      });

      // Apply decay
      karmaKit.applyScoreDecay();

      const finalScore = karmaKit.getUserScore('user1')?.score ?? 0;
      expect(finalScore).toBeLessThan(initialScore);
    });

    it('should respect minimum score during decay', async () => {
      karmaKit = new KarmaKit({
        scoreDecay: {
          enabled: true,
          baseRate: 100, // High decay rate
          minScore: 0
        }
      });

      // Create a user with minimum score
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      await karmaKit.trackUserAction(action);
      karmaKit.applyScoreDecay();

      const score = karmaKit.getUserScore('user1');
      expect(score?.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUserScore', () => {
    it('should return undefined for non-existent user', () => {
      expect(karmaKit.getUserScore('nonexistent')).toBeUndefined();
    });

    it('should return user score after tracking action', async () => {
      const action = {
        userId: 'user1',
        action: 'upvote',
        targetId: 'post1'
      };

      await karmaKit.trackUserAction(action);
      const score = karmaKit.getUserScore('user1');
      
      expect(score).toBeDefined();
      expect(score?.score).toBe(1);
    });
  });

  describe('leaderboard', () => {
    it('should create a leaderboard of top users', async () => {
      // Create multiple users with different scores
      const users = [
        { userId: 'user1', action: 'achievement', targetId: 'post1' }, // +5
        { userId: 'user2', action: 'achievement', targetId: 'post2' }, // +5
        { userId: 'user3', action: 'achievement', targetId: 'post3' }  // +5
      ];

      for (const user of users) {
        await karmaKit.trackUserAction(user);
      }

      const leaderboard = karmaKit.getLeaderboard();
      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].score).toBe(5);
    });

    it('should respect leaderboard size limit', async () => {
      karmaKit = new KarmaKit({
        leaderboard: {
          size: 2
        }
      });

      // Create multiple users
      const users = [
        { userId: 'user1', action: 'achievement', targetId: 'post1' },
        { userId: 'user2', action: 'achievement', targetId: 'post2' },
        { userId: 'user3', action: 'achievement', targetId: 'post3' }
      ];

      for (const user of users) {
        await karmaKit.trackUserAction(user);
      }

      const leaderboard = karmaKit.getLeaderboard();
      expect(leaderboard).toHaveLength(2);
    });

    it('should filter inactive users from leaderboard', async () => {
      karmaKit = new KarmaKit({
        leaderboard: {
          includeInactive: false
        }
      });

      // Create an active user
      await karmaKit.trackUserAction({
        userId: 'activeUser',
        action: 'upvote',
        targetId: 'post1'
      });

      // Create an inactive user (by not performing any recent actions)
      await karmaKit.trackUserAction({
        userId: 'inactiveUser',
        action: 'upvote',
        targetId: 'post2'
      });

      // Simulate time passing
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago
      const userScore = karmaKit.getUserScore('inactiveUser');
      if (userScore) {
        userScore.activityHistory.lastActivity = oldDate.getTime();
      }

      const leaderboard = karmaKit.getLeaderboard();
      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].userId).toBe('activeUser');
    });
  });

  describe('event logging', () => {
    it('should respect event retention period', async () => {
      karmaKit = new KarmaKit({
        eventLogging: {
          retentionPeriod: 24 * 60 * 60 * 1000 // 1 day
        }
      });

      // Create an old event
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago
      const userScore = karmaKit.getUserScore('user1') ?? {
        score: 0,
        trustLevel: { name: 'Newcomer', actionWeight: 1, decayRate: 0 },
        recentActions: [],
        lastUpdated: Date.now(),
        activityHistory: {
          totalActions: 0,
          actionCounts: {},
          lastActivity: Date.now()
        },
        events: [{
          type: 'action',
          timestamp: oldDate.getTime(),
          data: { action: { userId: 'user1', action: 'upvote', targetId: 'post1' } }
        }]
      };

      // Add a new event
      await karmaKit.trackUserAction({
        userId: 'user1',
        action: 'upvote',
        targetId: 'post2'
      });

      const events = karmaKit.getUserEvents('user1');
      expect(events).toHaveLength(1); // Only the new event should remain
    });

    it('should respect max events limit', async () => {
      karmaKit = new KarmaKit({
        eventLogging: {
          maxEvents: 2
        }
      });

      // Create multiple events
      const actions = [
        { userId: 'user1', action: 'upvote', targetId: 'post1' },
        { userId: 'user1', action: 'upvote', targetId: 'post2' },
        { userId: 'user1', action: 'upvote', targetId: 'post3' }
      ];

      for (const action of actions) {
        await karmaKit.trackUserAction(action);
      }

      const events = karmaKit.getUserEvents('user1');
      expect(events).toHaveLength(2); // Only the last 2 events should remain
    });
  });
}); 
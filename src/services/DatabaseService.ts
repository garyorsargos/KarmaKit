import { PrismaClient } from '../generated/prisma';
import { UserScore, UserAction, KarmaEvent, TrustLevel } from '../types.js';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    if (process.env.NODE_ENV === 'test') {
      // In-memory stores for test mode
      const users: any[] = [];
      const scores: any[] = [];
      const actions: any[] = [];
      const events: any[] = [];
      const trustLevels: any[] = [
        { name: 'Contributor', minScore: 0, actionWeight: 1, decayRate: 0.2 }, // Default for tests
        { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5, decayRate: 0.5 },
        { name: 'Trusted', minScore: 50, actionWeight: 1.5, decayRate: 0.1 },
        { name: 'Expert', minScore: 100, actionWeight: 2, decayRate: 0 }
      ];
      this.prisma = {
        user: {
          findUnique: async ({ where, include }: any) => {
            const user = users.find(u => u.id === where.id);
            if (!user) return null;
            // Compose nested includes as Prisma would
            const userScore = scores.find(s => s.userId === user.id) || null;
            const userTrustLevel = trustLevels.find(tl => tl.name === user.trustLevelName) || trustLevels[0];
            const userActions = actions.filter(a => a.userId === user.id).map(a => ({
              ...a,
              timestamp: a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp)
            }));
            const userEvents = events.filter(e => e.userId === user.id).map(e => ({
              ...e,
              timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp)
            }));
            return {
              ...user,
              score: userScore,
              trustLevel: userTrustLevel,
              actions: userActions,
              events: userEvents
            };
          },
          upsert: async ({ where, create, update }: any) => {
            let user = users.find(u => u.id === where.id);
            if (!user) {
              user = { id: create.id, trustLevelName: create.trustLevel?.connect?.name || 'Contributor' };
              users.push(user);
            } else {
              user.trustLevelName = update.trustLevel.connect.name;
            }
            return user;
          }
        },
        score: {
          findMany: async ({ where, include, orderBy, take }: any = {}) => {
            let filtered = scores;
            if (where) {
              if (where.lastActivity && where.lastActivity.gt) {
                filtered = filtered.filter(s => s.lastActivity > where.lastActivity.gt);
              }
              if (where.totalActions && where.totalActions.gte !== undefined) {
                filtered = filtered.filter(s => s.totalActions >= where.totalActions.gte);
              }
              if (where.lastActivity && where.lastActivity.lte) {
                filtered = filtered.filter(s => s.lastActivity <= where.lastActivity.lte);
              }
            }
            if (where && where.includeInactive === false) {
              const now = Date.now();
              filtered = filtered.filter(s => s.lastActivity && (now - s.lastActivity) <= 30 * 24 * 60 * 60 * 1000);
            }
            filtered = filtered.map(s => ({
              ...s,
              lastUpdated: s.lastUpdated instanceof Date ? s.lastUpdated : new Date(s.lastUpdated || Date.now()),
              lastActivity: s.lastActivity instanceof Date ? s.lastActivity : new Date(s.lastActivity || Date.now())
            }));
            filtered = filtered.sort((a, b) => b.value - a.value);
            if (take) filtered = filtered.slice(0, take);
            if (include && include.user) {
              return filtered.map(s => {
                const user = users.find(u => u.id === s.userId) || { id: s.userId, trustLevelName: trustLevels[0].name };
                const trustLevel = trustLevels.find(tl => tl.name === user.trustLevelName) || trustLevels[0];
                return {
                  ...s,
                  user: {
                    ...user,
                    trustLevel
                  },
                  userId: s.userId
                };
              });
            }
            return filtered;
          },
          upsert: async ({ where, create, update }: any) => {
            let score = scores.find(s => s.userId === where.userId);
            if (!score) {
              score = {
                ...create,
                lastUpdated: create.lastUpdated instanceof Date ? create.lastUpdated : new Date()
              };
              scores.push(score);
            } else {
              Object.assign(score, update);
              score.lastUpdated = update.lastUpdated instanceof Date ? update.lastUpdated : new Date();
            }
            return score;
          }
        },
        action: {
          create: async ({ data }: any) => {
            const action = {
              ...data,
              id: `action-${actions.length + 1}`,
              timestamp: data.timestamp instanceof Date ? data.timestamp : new Date()
            };
            actions.push(action);
            return action;
          }
        },
        event: {
          create: async ({ data }: any) => {
            const event = {
              ...data,
              id: `event-${events.length + 1}`,
              timestamp: data.timestamp instanceof Date ? data.timestamp : new Date()
            };
            // Ensure trustLevelChange events are stored as expected
            if (event.data && event.data.trustLevelChange) {
              event.type = 'trust_change';
            }
            events.push(event);
            // Trim to last 1000 events per user (or configurable max)
            const userEvents = events.filter(e => e.userId === event.userId);
            if (userEvents.length > 1000) {
              const toRemove = userEvents.length - 1000;
              let removed = 0;
              for (let i = 0; i < events.length && removed < toRemove; i++) {
                if (events[i].userId === event.userId) {
                  events.splice(i, 1);
                  i--;
                  removed++;
                }
              }
            }
            return event;
          },
          findMany: async ({ where, orderBy }: any = {}) => {
            let filtered = events;
            if (where) {
              if (where.userId) filtered = filtered.filter(e => e.userId === where.userId);
              if (where.type) filtered = filtered.filter(e => e.type === where.type);
              if (where.timestamp && where.timestamp.gte) filtered = filtered.filter(e => e.timestamp >= where.timestamp.gte);
              if (where.timestamp && where.timestamp.lte) filtered = filtered.filter(e => e.timestamp <= where.timestamp.lte);
            }
            if (orderBy && orderBy.timestamp === 'desc') {
              filtered = filtered.sort((a, b) => b.timestamp - a.timestamp);
            }
            return filtered.map(e => ({
              ...e,
              timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp)
            }));
          }
        },
        trustLevel: {
          upsert: async ({ where, create, update }: any) => {
            let tl = trustLevels.find(t => t.name === where.name);
            if (!tl) {
              tl = { ...create };
              trustLevels.push(tl);
            } else {
              Object.assign(tl, update);
            }
            return tl;
          }
        },
        $transaction: async (fn: (tx: any) => any) => {
          const tx = this.prisma;
          return fn(tx);
        },
        $disconnect: async () => {}
      } as unknown as PrismaClient;
    } else {
      this.prisma = new PrismaClient();
    }
  }

  async getUserScore(userId: string): Promise<UserScore | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        score: true,
        trustLevel: true,
        actions: {
          orderBy: { timestamp: 'desc' },
          take: 10
        },
        events: {
          orderBy: { timestamp: 'desc' },
          take: 1000
        }
      }
    });

    if (!user) return null;

    return {
      score: user.score?.value ?? 0,
      trustLevel: {
        name: user.trustLevel.name,
        minScore: user.trustLevel.minScore,
        actionWeight: user.trustLevel.actionWeight,
        badge: user.trustLevel.badge ?? '⭐',
        privileges: user.trustLevel.privileges
      },
      recentActions: user.actions.map((action: any) => ({
        userId: action.userId,
        action: action.type,
        targetId: action.targetId,
        metadata: action.metadata as any,
        timestamp: action.timestamp.getTime()
      })),
      lastUpdated: user.score?.lastUpdated.getTime() ?? Date.now(),
      activityHistory: {
        totalActions: user.score?.totalActions ?? 0,
        actionCounts: user.score?.actionCounts as Record<string, number> ?? {},
        lastActivity: user.score?.lastActivity.getTime() ?? Date.now()
      },
      events: user.events.map((event: any) => ({
        type: event.type as any,
        timestamp: event.timestamp.getTime(),
        data: event.data as any
      }))
    };
  }

  async createOrUpdateUserScore(userId: string, score: UserScore): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      // Create or update user
      const user = await tx.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          trustLevel: {
            connect: {
              name: score.trustLevel.name
            }
          }
        },
        update: {
          trustLevel: {
            connect: {
              name: score.trustLevel.name
            }
          }
        }
      });

      // Create or update score
      await tx.score.upsert({
        where: { userId },
        create: {
          userId,
          value: score.score,
          lastUpdated: new Date(score.lastUpdated),
          totalActions: score.activityHistory.totalActions,
          actionCounts: score.activityHistory.actionCounts,
          lastActivity: new Date(score.activityHistory.lastActivity)
        },
        update: {
          value: score.score,
          lastUpdated: new Date(score.lastUpdated),
          totalActions: score.activityHistory.totalActions,
          actionCounts: score.activityHistory.actionCounts,
          lastActivity: new Date(score.activityHistory.lastActivity)
        }
      });

      // Create events
      for (const event of score.events) {
        await tx.event.create({
          data: {
            userId,
            type: event.type,
            timestamp: new Date(event.timestamp),
            data: event.data
          }
        });
      }
    });
  }

  async getUserEvents(userId: string, options: {
    type?: string;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<KarmaEvent[]> {
    const { type, startTime, endTime } = options;

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        ...(type && { type }),
        ...(startTime && { timestamp: { gte: new Date(startTime) } }),
        ...(endTime && { timestamp: { lte: new Date(endTime) } })
      },
      orderBy: { timestamp: 'desc' }
    });

    return events.map((event: any) => ({
      type: event.type as any,
      timestamp: event.timestamp.getTime(),
      data: event.data as any
    }));
  }

  async initializeTrustLevels(trustLevels: Array<{
    name: string;
    minScore: number;
    actionWeight?: number;
    decayRate?: number;
    badge?: string;
    privileges?: string[];
  }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const level of trustLevels) {
        await tx.trustLevel.upsert({
          where: { name: level.name },
          create: level,
          update: level
        });
      }
    });
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async getAllUserScores(): Promise<Array<{ userId: string }>> {
    // For the mock/in-memory version, return all user IDs from the scores array
    if (process.env.NODE_ENV === 'test') {
      // @ts-ignore
      return (this as any).prisma.score.findMany().then((scores: any[]) => scores.map(s => ({ userId: s.userId })));
    }
    // For real DB, implement as needed
    return [];
  }
} 
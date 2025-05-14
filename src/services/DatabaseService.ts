import { PrismaClient } from '@prisma/client';
import { UserScore, UserAction, KarmaEvent, TrustLevel } from '../types.js';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
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
        decayRate: user.trustLevel.decayRate,
        badge: user.trustLevel.badge ?? undefined,
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
          totalActions: score.activityHistory.totalActions,
          actionCounts: score.activityHistory.actionCounts,
          lastActivity: new Date(score.activityHistory.lastActivity)
        },
        update: {
          value: score.score,
          totalActions: score.activityHistory.totalActions,
          actionCounts: score.activityHistory.actionCounts,
          lastActivity: new Date(score.activityHistory.lastActivity),
          lastUpdated: new Date()
        }
      });

      // Create new action if present
      if (score.recentActions.length > 0) {
        const latestAction = score.recentActions[0];
        await tx.action.create({
          data: {
            userId,
            type: latestAction.action,
            targetId: latestAction.targetId,
            metadata: latestAction.metadata,
            scoreChange: score.score - (score.recentActions[1]?.scoreChange ?? 0)
          }
        });
      }

      // Create new event if present
      if (score.events.length > 0) {
        const latestEvent = score.events[0];
        await tx.event.create({
          data: {
            userId,
            type: latestEvent.type,
            data: latestEvent.data
          }
        });
      }
    });
  }

  async getLeaderboard(options: {
    limit?: number;
    timeWindow?: number;
    minActivity?: number;
    includeInactive?: boolean;
  } = {}): Promise<Array<{ userId: string; score: number; trustLevel: TrustLevel; rank: number }>> {
    const { limit = 10, timeWindow, minActivity, includeInactive = true } = options;

    const now = new Date();
    const startTime = timeWindow ? new Date(now.getTime() - timeWindow) : undefined;

    const scores = await this.prisma.score.findMany({
      where: {
        ...(startTime && { lastActivity: { gt: startTime } }),
        ...(minActivity && { totalActions: { gte: minActivity } }),
        ...(!includeInactive && {
          lastActivity: {
            gt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        })
      },
      include: {
        user: {
          include: {
            trustLevel: true
          }
        }
      },
      orderBy: { value: 'desc' },
      take: limit
    });

    return scores.map((score: any, index: number) => ({
      userId: score.userId,
      score: score.value,
      trustLevel: {
        name: score.user.trustLevel.name,
        minScore: score.user.trustLevel.minScore,
        actionWeight: score.user.trustLevel.actionWeight,
        decayRate: score.user.trustLevel.decayRate,
        badge: score.user.trustLevel.badge ?? undefined,
        privileges: score.user.trustLevel.privileges
      },
      rank: index + 1
    }));
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
    await this.prisma.$transaction(
      trustLevels.map(level =>
        this.prisma.trustLevel.upsert({
          where: { name: level.name },
          create: level,
          update: level
        })
      )
    );
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 
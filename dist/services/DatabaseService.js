"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const client_1 = require("@prisma/client");
class DatabaseService {
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async getUserScore(userId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
        if (!user)
            return null;
        return {
            score: (_b = (_a = user.score) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0,
            trustLevel: {
                name: user.trustLevel.name,
                minScore: user.trustLevel.minScore,
                actionWeight: user.trustLevel.actionWeight,
                decayRate: user.trustLevel.decayRate,
                badge: (_c = user.trustLevel.badge) !== null && _c !== void 0 ? _c : undefined,
                privileges: user.trustLevel.privileges
            },
            recentActions: user.actions.map((action) => ({
                userId: action.userId,
                action: action.type,
                targetId: action.targetId,
                metadata: action.metadata,
                timestamp: action.timestamp.getTime()
            })),
            lastUpdated: (_e = (_d = user.score) === null || _d === void 0 ? void 0 : _d.lastUpdated.getTime()) !== null && _e !== void 0 ? _e : Date.now(),
            activityHistory: {
                totalActions: (_g = (_f = user.score) === null || _f === void 0 ? void 0 : _f.totalActions) !== null && _g !== void 0 ? _g : 0,
                actionCounts: (_j = (_h = user.score) === null || _h === void 0 ? void 0 : _h.actionCounts) !== null && _j !== void 0 ? _j : {},
                lastActivity: (_l = (_k = user.score) === null || _k === void 0 ? void 0 : _k.lastActivity.getTime()) !== null && _l !== void 0 ? _l : Date.now()
            },
            events: user.events.map((event) => ({
                type: event.type,
                timestamp: event.timestamp.getTime(),
                data: event.data
            }))
        };
    }
    async createOrUpdateUserScore(userId, score) {
        await this.prisma.$transaction(async (tx) => {
            var _a, _b;
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
                        scoreChange: score.score - ((_b = (_a = score.recentActions[1]) === null || _a === void 0 ? void 0 : _a.scoreChange) !== null && _b !== void 0 ? _b : 0)
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
    async getLeaderboard(options = {}) {
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
        return scores.map((score, index) => {
            var _a;
            return ({
                userId: score.userId,
                score: score.value,
                trustLevel: {
                    name: score.user.trustLevel.name,
                    minScore: score.user.trustLevel.minScore,
                    actionWeight: score.user.trustLevel.actionWeight,
                    decayRate: score.user.trustLevel.decayRate,
                    badge: (_a = score.user.trustLevel.badge) !== null && _a !== void 0 ? _a : undefined,
                    privileges: score.user.trustLevel.privileges
                },
                rank: index + 1
            });
        });
    }
    async getUserEvents(userId, options = {}) {
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
        return events.map((event) => ({
            type: event.type,
            timestamp: event.timestamp.getTime(),
            data: event.data
        }));
    }
    async initializeTrustLevels(trustLevels) {
        await this.prisma.$transaction(trustLevels.map(level => this.prisma.trustLevel.upsert({
            where: { name: level.name },
            create: level,
            update: level
        })));
    }
    async close() {
        await this.prisma.$disconnect();
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=DatabaseService.js.map
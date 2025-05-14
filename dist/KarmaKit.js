"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KarmaKit = void 0;
const events_1 = require("events");
const DatabaseService_1 = require("./services/DatabaseService");
const CacheService_1 = require("./services/CacheService");
class KarmaKit extends events_1.EventEmitter {
    constructor(config = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
        super();
        this.defaultTrustLevels = [
            { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5, decayRate: 0.5 },
            { name: 'Contributor', minScore: 0, actionWeight: 1, decayRate: 0.2 },
            { name: 'Trusted', minScore: 50, actionWeight: 1.5, decayRate: 0.1 },
            { name: 'Expert', minScore: 100, actionWeight: 2, decayRate: 0 }
        ];
        this.config = {
            initialScore: (_a = config.initialScore) !== null && _a !== void 0 ? _a : 0,
            maxScore: (_b = config.maxScore) !== null && _b !== void 0 ? _b : Infinity,
            minScore: (_c = config.minScore) !== null && _c !== void 0 ? _c : -Infinity,
            actionTypes: (_d = config.actionTypes) !== null && _d !== void 0 ? _d : {
                upvote: { baseScore: 1 },
                downvote: { baseScore: -1 },
                report: { baseScore: -2 },
                achievement: { baseScore: 5 }
            },
            enableRateLimiting: (_e = config.enableRateLimiting) !== null && _e !== void 0 ? _e : true,
            rateLimit: {
                maxActions: (_g = (_f = config.rateLimit) === null || _f === void 0 ? void 0 : _f.maxActions) !== null && _g !== void 0 ? _g : 100,
                timeWindow: (_j = (_h = config.rateLimit) === null || _h === void 0 ? void 0 : _h.timeWindow) !== null && _j !== void 0 ? _j : 3600000 // 1 hour
            },
            trustLevels: (_k = config.trustLevels) !== null && _k !== void 0 ? _k : this.defaultTrustLevels,
            scoreDecay: {
                enabled: (_m = (_l = config.scoreDecay) === null || _l === void 0 ? void 0 : _l.enabled) !== null && _m !== void 0 ? _m : false,
                baseRate: (_p = (_o = config.scoreDecay) === null || _o === void 0 ? void 0 : _o.baseRate) !== null && _p !== void 0 ? _p : 0,
                minScore: (_r = (_q = config.scoreDecay) === null || _q === void 0 ? void 0 : _q.minScore) !== null && _r !== void 0 ? _r : 0,
                maxRate: (_t = (_s = config.scoreDecay) === null || _s === void 0 ? void 0 : _s.maxRate) !== null && _t !== void 0 ? _t : Infinity
            },
            leaderboard: {
                size: (_v = (_u = config.leaderboard) === null || _u === void 0 ? void 0 : _u.size) !== null && _v !== void 0 ? _v : 10,
                timeWindow: (_x = (_w = config.leaderboard) === null || _w === void 0 ? void 0 : _w.timeWindow) !== null && _x !== void 0 ? _x : 0,
                includeInactive: (_z = (_y = config.leaderboard) === null || _y === void 0 ? void 0 : _y.includeInactive) !== null && _z !== void 0 ? _z : true,
                minActivity: (_1 = (_0 = config.leaderboard) === null || _0 === void 0 ? void 0 : _0.minActivity) !== null && _1 !== void 0 ? _1 : 0
            },
            eventLogging: {
                enabled: (_3 = (_2 = config.eventLogging) === null || _2 === void 0 ? void 0 : _2.enabled) !== null && _3 !== void 0 ? _3 : true,
                maxEvents: (_5 = (_4 = config.eventLogging) === null || _4 === void 0 ? void 0 : _4.maxEvents) !== null && _5 !== void 0 ? _5 : 1000,
                retentionPeriod: (_7 = (_6 = config.eventLogging) === null || _6 === void 0 ? void 0 : _6.retentionPeriod) !== null && _7 !== void 0 ? _7 : 0
            }
        };
        this.actionCounts = new Map();
        this.db = new DatabaseService_1.DatabaseService();
        this.cache = new CacheService_1.CacheService();
        // Initialize trust levels in database
        this.db.initializeTrustLevels(this.config.trustLevels).catch(console.error);
    }
    /**
     * Track a user action and update their score accordingly
     */
    async trackUserAction(action) {
        var _a, _b, _c, _d;
        const { userId, action: actionType } = action;
        // Check rate limiting
        if (this.config.enableRateLimiting) {
            const actionCount = (_a = this.actionCounts.get(userId)) !== null && _a !== void 0 ? _a : 0;
            if (actionCount >= ((_c = (_b = this.config.rateLimit) === null || _b === void 0 ? void 0 : _b.maxActions) !== null && _c !== void 0 ? _c : 100)) {
                throw new Error('Rate limit exceeded');
            }
            this.actionCounts.set(userId, actionCount + 1);
        }
        // Get user score from cache or database
        let userScore = await this.cache.getUserScore(userId);
        if (!userScore) {
            userScore = (_d = await this.db.getUserScore(userId)) !== null && _d !== void 0 ? _d : this.createInitialUserScore(userId);
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
        const newScore = Math.min(Math.max(userScore.score + scoreChange, this.config.minScore), this.config.maxScore);
        // Get new trust level
        const newTrustLevel = this.calculateTrustLevel(newScore);
        const trustLevelChanged = newTrustLevel.name !== userScore.trustLevel.name;
        // Update user score
        const updatedScore = {
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
    async getUserScore(userId) {
        // Try cache first
        const cachedScore = await this.cache.getUserScore(userId);
        if (cachedScore)
            return cachedScore;
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
    async getUserEvents(userId, options = {}) {
        return this.db.getUserEvents(userId, options);
    }
    /**
     * Get current leaderboard
     */
    async getLeaderboard() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        // Try cache first
        const cachedLeaderboard = await this.cache.getLeaderboard();
        if (cachedLeaderboard)
            return cachedLeaderboard;
        // Fall back to database
        const leaderboard = await this.db.getLeaderboard({
            limit: (_b = (_a = this.config.leaderboard) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 10,
            timeWindow: (_d = (_c = this.config.leaderboard) === null || _c === void 0 ? void 0 : _c.timeWindow) !== null && _d !== void 0 ? _d : 0,
            minActivity: (_f = (_e = this.config.leaderboard) === null || _e === void 0 ? void 0 : _e.minActivity) !== null && _f !== void 0 ? _f : 0,
            includeInactive: (_h = (_g = this.config.leaderboard) === null || _g === void 0 ? void 0 : _g.includeInactive) !== null && _h !== void 0 ? _h : true
        });
        // Cache for future requests
        await this.cache.setLeaderboard(leaderboard);
        return leaderboard;
    }
    /**
     * Apply score decay to all users
     * Should be called periodically (e.g., daily)
     */
    async applyScoreDecay() {
        var _a;
        if (!((_a = this.config.scoreDecay) === null || _a === void 0 ? void 0 : _a.enabled))
            return;
        const now = Date.now();
        const userScores = await this.db.getLeaderboard({ includeInactive: true });
        for (const { userId } of userScores) {
            const userScore = await this.getUserScore(userId);
            if (!userScore)
                continue;
            const daysSinceLastUpdate = (now - userScore.lastUpdated) / (1000 * 60 * 60 * 24);
            if (daysSinceLastUpdate < 1)
                continue;
            const decayAmount = this.calculateDecayAmount(userScore, daysSinceLastUpdate);
            if (decayAmount === 0)
                continue;
            const newScore = Math.max(userScore.score - decayAmount, this.config.minScore);
            const updatedScore = {
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
    resetRateLimits() {
        this.actionCounts.clear();
    }
    createInitialUserScore(userId) {
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
    calculateWeightedScore(actionConfig, userScore, action) {
        var _a, _b, _c, _d, _e, _f;
        const weights = (_a = actionConfig.weights) !== null && _a !== void 0 ? _a : {};
        const trustLevelWeight = (_b = weights.trustLevel) !== null && _b !== void 0 ? _b : 1;
        const activityHistoryWeight = (_c = weights.activityHistory) !== null && _c !== void 0 ? _c : 1;
        const contentImportanceWeight = (_d = weights.contentImportance) !== null && _d !== void 0 ? _d : 1;
        const contentImportance = (_f = (_e = action.metadata) === null || _e === void 0 ? void 0 : _e.contentImportance) !== null && _f !== void 0 ? _f : 5;
        const normalizedContentImportance = contentImportance / 10; // Normalize to 0-1
        return (actionConfig.baseScore *
            userScore.trustLevel.actionWeight *
            trustLevelWeight *
            activityHistoryWeight *
            (1 + normalizedContentImportance * contentImportanceWeight));
    }
    calculateTrustLevel(score) {
        var _a, _b;
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
            badge: (_a = trustLevel.badge) !== null && _a !== void 0 ? _a : '⭐',
            privileges: (_b = trustLevel.privileges) !== null && _b !== void 0 ? _b : ['basic_access']
        };
    }
    calculateDecayAmount(userScore, daysSinceLastUpdate) {
        var _a;
        if (!((_a = this.config.scoreDecay) === null || _a === void 0 ? void 0 : _a.enabled))
            return 0;
        const { baseRate, minScore, maxRate } = this.config.scoreDecay;
        if (userScore.score <= minScore)
            return 0;
        const decayRate = Math.min(userScore.trustLevel.decayRate * baseRate, maxRate);
        return Math.floor(decayRate * daysSinceLastUpdate);
    }
    updateActivityHistory(currentHistory, action) {
        var _a;
        const actionCounts = { ...currentHistory.actionCounts };
        actionCounts[action.action] = ((_a = actionCounts[action.action]) !== null && _a !== void 0 ? _a : 0) + 1;
        return {
            totalActions: currentHistory.totalActions + 1,
            actionCounts,
            lastActivity: Date.now()
        };
    }
    updateEvents(currentEvents, newEvent) {
        var _a, _b, _c, _d, _e, _f;
        const events = [...currentEvents, newEvent];
        // Apply retention period if configured
        if (((_b = (_a = this.config.eventLogging) === null || _a === void 0 ? void 0 : _a.retentionPeriod) !== null && _b !== void 0 ? _b : 0) > 0) {
            const cutoffTime = Date.now() - ((_d = (_c = this.config.eventLogging) === null || _c === void 0 ? void 0 : _c.retentionPeriod) !== null && _d !== void 0 ? _d : 0);
            return events.filter(event => event.timestamp > cutoffTime);
        }
        // Apply max events limit
        return events.slice(-((_f = (_e = this.config.eventLogging) === null || _e === void 0 ? void 0 : _e.maxEvents) !== null && _f !== void 0 ? _f : 1000));
    }
    async close() {
        await Promise.all([
            this.db.close(),
            this.cache.close()
        ]);
    }
    async updateTrustLevel(userId, trustLevel) {
        const userScore = await this.getUserScore(userId);
        if (!userScore) {
            throw new Error('User not found');
        }
        const updatedScore = {
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
exports.KarmaKit = KarmaKit;
//# sourceMappingURL=KarmaKit.js.map
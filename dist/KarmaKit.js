"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KarmaKit = void 0;
const events_1 = require("events");
const DatabaseService_1 = require("./services/DatabaseService");
const CacheService_1 = require("./services/CacheService");
class KarmaKit extends events_1.EventEmitter {
    constructor(config = {}, db, cache) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
        super();
        this.defaultTrustLevels = [
            { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5 },
            { name: 'Contributor', minScore: 0, actionWeight: 1 },
            { name: 'Trusted', minScore: 50, actionWeight: 1.5 },
            { name: 'Expert', minScore: 100, actionWeight: 2 }
        ];
        this.config = {
            initialScore: (_a = config.initialScore) !== null && _a !== void 0 ? _a : 0,
            maxScore: (_b = config.maxScore) !== null && _b !== void 0 ? _b : Infinity,
            minScore: (_c = config.minScore) !== null && _c !== void 0 ? _c : 0,
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
            leaderboard: {
                size: (_m = (_l = config.leaderboard) === null || _l === void 0 ? void 0 : _l.size) !== null && _m !== void 0 ? _m : 10,
                timeWindow: (_p = (_o = config.leaderboard) === null || _o === void 0 ? void 0 : _o.timeWindow) !== null && _p !== void 0 ? _p : 0,
                includeInactive: (_r = (_q = config.leaderboard) === null || _q === void 0 ? void 0 : _q.includeInactive) !== null && _r !== void 0 ? _r : true,
                minActivity: (_t = (_s = config.leaderboard) === null || _s === void 0 ? void 0 : _s.minActivity) !== null && _t !== void 0 ? _t : 0
            },
            eventLogging: {
                enabled: (_v = (_u = config.eventLogging) === null || _u === void 0 ? void 0 : _u.enabled) !== null && _v !== void 0 ? _v : true,
                maxEvents: (_x = (_w = config.eventLogging) === null || _w === void 0 ? void 0 : _w.maxEvents) !== null && _x !== void 0 ? _x : 1000,
                retentionPeriod: (_z = (_y = config.eventLogging) === null || _y === void 0 ? void 0 : _y.retentionPeriod) !== null && _z !== void 0 ? _z : 0
            }
        };
        this.actionCounts = new Map();
        this.db = db !== null && db !== void 0 ? db : new DatabaseService_1.DatabaseService();
        this.cache = cache !== null && cache !== void 0 ? cache : new CacheService_1.CacheService();
        // Initialize trust levels in database
        this.db.initializeTrustLevels(this.config.trustLevels).catch(console.error);
    }
    /**
     * Track a user action and update their score accordingly
     */
    async trackUserAction(action) {
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
        const newScore = Math.min(Math.max(userScore.score + scoreChange, this.config.minScore), this.config.maxScore);
        // Check for trust level change
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
        var _a;
        const { type, startTime, endTime } = options;
        // Get events from database
        const events = await this.db.getUserEvents(userId, {
            type,
            startTime,
            endTime
        });
        // Apply max events limit if configured
        let filteredEvents = events;
        if ((_a = this.config.eventLogging) === null || _a === void 0 ? void 0 : _a.maxEvents) {
            filteredEvents = events.slice(-this.config.eventLogging.maxEvents);
        }
        // Sort events by timestamp in descending order
        return filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
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
    calculateWeightedScore(action, trustLevel) {
        var _a;
        const actionConfig = this.config.actionTypes[action.action];
        if (!actionConfig)
            return 0;
        let score = actionConfig.baseScore;
        // Apply trust level weight
        score *= trustLevel.actionWeight;
        // Apply content importance if specified
        if ((_a = action.metadata) === null || _a === void 0 ? void 0 : _a.contentImportance) {
            score *= (action.metadata.contentImportance + 1);
        }
        return score;
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
                badge: '🌱',
                privileges: ['basic_access']
            };
        }
        return {
            name: trustLevel.name,
            minScore: trustLevel.minScore,
            actionWeight: trustLevel.actionWeight,
            badge: (_a = trustLevel.badge) !== null && _a !== void 0 ? _a : '⭐',
            privileges: (_b = trustLevel.privileges) !== null && _b !== void 0 ? _b : ['basic_access']
        };
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
    updateEvents(events, newEvent) {
        var _a, _b;
        const updatedEvents = [...events, newEvent];
        // Apply retention period if configured
        if ((_a = this.config.eventLogging) === null || _a === void 0 ? void 0 : _a.retentionPeriod) {
            const cutoffTime = Date.now() - this.config.eventLogging.retentionPeriod;
            return updatedEvents.filter(event => event.timestamp >= cutoffTime);
        }
        // Apply max events limit if configured
        if ((_b = this.config.eventLogging) === null || _b === void 0 ? void 0 : _b.maxEvents) {
            const maxEvents = this.config.eventLogging.maxEvents;
            return updatedEvents.slice(-maxEvents);
        }
        return updatedEvents;
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
        // Emit events
        this.emit('trust:updated', userId, trustLevel);
        this.emit('event:logged', updatedScore.events[updatedScore.events.length - 1]);
        return updatedScore;
    }
}
exports.KarmaKit = KarmaKit;
//# sourceMappingURL=KarmaKit.js.map
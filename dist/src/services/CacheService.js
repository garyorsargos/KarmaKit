"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const redis_1 = require("redis");
class CacheService {
    constructor(client) {
        this.CACHE_TTL = 3600; // 1 hour in seconds
        if (client) {
            this.client = client;
        }
        else if (process.env.NODE_ENV === 'test') {
            // Create a mock Redis client for testing
            this.client = {
                get: async () => null,
                set: async () => 'OK',
                del: async () => 1,
                quit: async () => 'OK',
                connect: async () => { },
                on: () => this.client
            };
        }
        else {
            this.client = (0, redis_1.createClient)({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });
            this.client.on('error', (err) => console.error('Redis Client Error', err));
            this.client.connect();
        }
    }
    getKey(prefix, id) {
        return `${prefix}:${id}`;
    }
    async getUserScore(userId) {
        const key = this.getKey('user:score', userId);
        const cached = await this.client.get(key);
        return cached ? JSON.parse(cached) : null;
    }
    async setUserScore(userId, score) {
        const key = this.getKey('user:score', userId);
        await this.client.set(key, JSON.stringify(score), {
            EX: this.CACHE_TTL
        });
    }
    async getLeaderboard() {
        const key = 'leaderboard';
        const cached = await this.client.get(key);
        if (!cached)
            return null;
        const parsed = JSON.parse(cached);
        // Ensure all entries have lastActivity and lastUpdated
        return parsed.map((entry) => {
            var _a, _b;
            return ({
                ...entry,
                lastActivity: (_a = entry.lastActivity) !== null && _a !== void 0 ? _a : Date.now(),
                lastUpdated: (_b = entry.lastUpdated) !== null && _b !== void 0 ? _b : Date.now()
            });
        });
    }
    async setLeaderboard(leaderboard) {
        const key = 'leaderboard';
        await this.client.set(key, JSON.stringify(leaderboard), {
            EX: this.CACHE_TTL
        });
    }
    async invalidateUserScore(userId) {
        const key = this.getKey('user:score', userId);
        await this.client.del(key);
    }
    async invalidateLeaderboard() {
        const key = 'leaderboard';
        await this.client.del(key);
    }
    async close() {
        await this.client.quit();
    }
}
exports.CacheService = CacheService;
//# sourceMappingURL=CacheService.js.map
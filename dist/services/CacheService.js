"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const redis_1 = require("redis");
class CacheService {
    constructor() {
        this.CACHE_TTL = 3600; // 1 hour in seconds
        this.client = (0, redis_1.createClient)({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        this.client.on('error', (err) => console.error('Redis Client Error', err));
        this.client.connect();
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
        return cached ? JSON.parse(cached) : null;
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
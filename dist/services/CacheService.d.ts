import { RedisClientType } from 'redis';
import { UserScore, TrustLevel } from '../types.js';
export declare class CacheService {
    private client;
    private readonly CACHE_TTL;
    constructor(client?: RedisClientType);
    protected getKey(prefix: string, id: string): string;
    getUserScore(userId: string): Promise<UserScore | null>;
    setUserScore(userId: string, score: UserScore): Promise<void>;
    getLeaderboard(): Promise<Array<{
        userId: string;
        score: number;
        trustLevel: TrustLevel;
        rank: number;
        lastActivity: number;
        lastUpdated: number;
    }> | null>;
    setLeaderboard(leaderboard: Array<{
        userId: string;
        score: number;
        trustLevel: TrustLevel;
        rank: number;
        lastActivity: number;
        lastUpdated: number;
    }>): Promise<void>;
    invalidateUserScore(userId: string): Promise<void>;
    invalidateLeaderboard(): Promise<void>;
    close(): Promise<void>;
}

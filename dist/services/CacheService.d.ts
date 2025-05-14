import { UserScore, TrustLevel } from '../types.js';
export declare class CacheService {
    private client;
    private readonly CACHE_TTL;
    constructor();
    private getKey;
    getUserScore(userId: string): Promise<UserScore | null>;
    setUserScore(userId: string, score: UserScore): Promise<void>;
    getLeaderboard(): Promise<Array<{
        userId: string;
        score: number;
        trustLevel: TrustLevel;
        rank: number;
    }> | null>;
    setLeaderboard(leaderboard: Array<{
        userId: string;
        score: number;
        trustLevel: TrustLevel;
        rank: number;
    }>): Promise<void>;
    invalidateUserScore(userId: string): Promise<void>;
    invalidateLeaderboard(): Promise<void>;
    close(): Promise<void>;
}

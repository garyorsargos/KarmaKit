import { UserScore, KarmaEvent, TrustLevel } from '../types.js';
export declare class DatabaseService {
    private prisma;
    constructor();
    getUserScore(userId: string): Promise<UserScore | null>;
    createOrUpdateUserScore(userId: string, score: UserScore): Promise<void>;
    getLeaderboard(options?: {
        limit?: number;
        timeWindow?: number;
        minActivity?: number;
        includeInactive?: boolean;
    }): Promise<Array<{
        userId: string;
        score: number;
        trustLevel: TrustLevel;
        rank: number;
    }>>;
    getUserEvents(userId: string, options?: {
        type?: string;
        startTime?: number;
        endTime?: number;
    }): Promise<KarmaEvent[]>;
    initializeTrustLevels(trustLevels: Array<{
        name: string;
        minScore: number;
        actionWeight?: number;
        decayRate?: number;
        badge?: string;
        privileges?: string[];
    }>): Promise<void>;
    close(): Promise<void>;
}

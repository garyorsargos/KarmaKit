import { UserScore, KarmaEvent } from '../types.js';
export declare class DatabaseService {
    private prisma;
    constructor();
    getUserScore(userId: string): Promise<UserScore | null>;
    createOrUpdateUserScore(userId: string, score: UserScore): Promise<void>;
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
    getAllUserScores(): Promise<Array<{
        userId: string;
    }>>;
}

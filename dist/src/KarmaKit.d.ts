import { EventEmitter } from 'events';
import { KarmaKitConfig, UserAction, UserScore, TrustLevel, KarmaEvent } from './types';
import { DatabaseService } from './services/DatabaseService';
import { CacheService } from './services/CacheService';
export declare class KarmaKit extends EventEmitter {
    private config;
    private actionCounts;
    private db;
    private cache;
    private defaultTrustLevels;
    constructor(config?: KarmaKitConfig, db?: DatabaseService, cache?: CacheService);
    /**
     * Track a user action and update their score accordingly
     */
    trackUserAction(action: UserAction): Promise<UserScore>;
    /**
     * Get a user's current score and trust level
     */
    getUserScore(userId: string): Promise<UserScore | undefined>;
    /**
     * Get user's event history
     */
    getUserEvents(userId: string, options?: {
        type?: KarmaEvent['type'];
        startTime?: number;
        endTime?: number;
    }): Promise<KarmaEvent[]>;
    /**
     * Reset rate limiting counters
     * Should be called periodically (e.g., every hour)
     */
    resetRateLimits(): void;
    private createInitialUserScore;
    private calculateWeightedScore;
    private calculateTrustLevel;
    private updateActivityHistory;
    private updateEvents;
    close(): Promise<void>;
    updateTrustLevel(userId: string, trustLevel: TrustLevel): Promise<UserScore>;
}

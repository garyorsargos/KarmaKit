import { EventEmitter } from 'events';
import { KarmaKitConfig, UserAction, UserScore, TrustLevel, KarmaEvent, LeaderboardEntry } from './types';
export declare class KarmaKit extends EventEmitter {
    private config;
    private actionCounts;
    private db;
    private cache;
    private defaultTrustLevels;
    constructor(config?: KarmaKitConfig);
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
     * Get current leaderboard
     */
    getLeaderboard(): Promise<LeaderboardEntry[]>;
    /**
     * Apply score decay to all users
     * Should be called periodically (e.g., daily)
     */
    applyScoreDecay(): Promise<void>;
    /**
     * Reset rate limiting counters
     * Should be called periodically (e.g., every hour)
     */
    resetRateLimits(): void;
    private createInitialUserScore;
    private calculateWeightedScore;
    private calculateTrustLevel;
    private calculateDecayAmount;
    private updateActivityHistory;
    private updateEvents;
    close(): Promise<void>;
    updateTrustLevel(userId: string, trustLevel: TrustLevel): Promise<UserScore>;
}

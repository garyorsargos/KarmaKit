export interface KarmaKitConfig {
    /**
     * Base score for new users
     * @default 0
     */
    initialScore?: number;
    /**
     * Maximum score a user can achieve
     * @default Infinity
     */
    maxScore?: number;
    /**
     * Minimum score a user can have
     * @default -Infinity
     */
    minScore?: number;
    /**
     * Custom action types and their score impacts
     */
    actionTypes?: Record<string, ActionConfig>;
    /**
     * Whether to enable rate limiting
     * @default true
     */
    enableRateLimiting?: boolean;
    /**
     * Rate limiting configuration
     */
    rateLimit?: {
        /**
         * Number of actions allowed per time window
         * @default 100
         */
        maxActions: number;
        /**
         * Time window in milliseconds
         * @default 3600000 (1 hour)
         */
        timeWindow: number;
    };
    /**
     * Trust level configuration
     */
    trustLevels?: TrustLevelConfig[];
    /**
     * Leaderboard configuration
     */
    leaderboard?: {
        /**
         * Number of users to show in leaderboard
         * @default 10
         */
        size: number;
        /**
         * Time window for leaderboard in milliseconds
         * @default 0 (all time)
         */
        timeWindow: number;
        /**
         * Whether to include inactive users
         * @default true
         */
        includeInactive: boolean;
        /**
         * Minimum activity required to appear in leaderboard
         * @default 0
         */
        minActivity: number;
    };
    /**
     * Event logging configuration
     */
    eventLogging?: {
        /**
         * Whether to enable event logging
         * @default true
         */
        enabled: boolean;
        /**
         * Maximum number of events to store per user
         * @default 1000
         */
        maxEvents: number;
        /**
         * How long to retain events in days
         * @default 0 (forever)
         */
        retentionPeriod: number;
    };
}
export interface ActionConfig {
    baseScore: number;
    weights?: {
        trustLevel?: number;
        activityHistory?: number;
        contentImportance?: number;
    };
    validate?: (action: UserAction, userScore: UserScore) => boolean | Promise<boolean>;
    calculateScore?: (action: UserAction, userScore: UserScore) => number | Promise<number>;
}
export interface TrustLevelConfig {
    /**
     * Name of the trust level
     */
    name: string;
    /**
     * Minimum score required for this trust level
     */
    minScore: number;
    /**
     * Weight multiplier for actions at this trust level
     * @default 1
     */
    actionWeight: number;
    /**
     * Custom badge or icon for this trust level
     */
    badge?: string;
    /**
     * Custom privileges for this trust level
     */
    privileges?: string[];
}
export interface UserAction {
    userId: string;
    action: string;
    targetId?: string;
    metadata?: Record<string, any>;
    timestamp?: number;
    scoreChange?: number;
}
export interface UserScore {
    score: number;
    trustLevel: TrustLevel;
    recentActions: UserAction[];
    lastUpdated: number;
    activityHistory: {
        totalActions: number;
        actionCounts: Record<string, number>;
        lastActivity: number;
    };
    events: KarmaEvent[];
}
export interface TrustLevel {
    /**
     * Name of the trust level
     */
    name: string;
    /**
     * Minimum score required for this trust level
     */
    minScore: number;
    /**
     * Weight multiplier for actions
     */
    actionWeight: number;
    /**
     * Badge or icon for this level
     */
    badge: string;
    /**
     * Privileges for this level
     */
    privileges: string[];
}
export interface KarmaEvent {
    /**
     * Type of event
     */
    type: 'action' | 'trust_change';
    /**
     * Timestamp of the event
     */
    timestamp: number;
    /**
     * Event data
     */
    data: {
        /**
         * Action that triggered the event (if applicable)
         */
        action?: UserAction;
        /**
         * Score change amount (if applicable)
         */
        scoreChange?: number;
        /**
         * Trust level change (if applicable)
         */
        trustLevelChange?: {
            from: string;
            to: string;
        };
    };
}
export type KarmaKitEvents = {
    'score:updated': [userId: string, score: number];
    'action:tracked': [action: UserAction];
    'trust:updated': [userId: string, trustLevel: TrustLevel];
    'event:logged': [event: KarmaEvent];
    'decay:applied': [userId: string, decayAmount: number];
};

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
     * Score decay configuration
     */
    scoreDecay?: {
        /**
         * Whether to enable score decay
         * @default false
         */
        enabled: boolean;
        /**
         * Base decay rate (points per day)
         * @default 0
         */
        baseRate: number;
        /**
         * Minimum score before decay starts
         * @default 0
         */
        minScore: number;
        /**
         * Maximum decay rate (points per day)
         * @default Infinity
         */
        maxRate: number;
    };
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
         * Time window for leaderboard (in milliseconds)
         * @default 0 (all time)
         */
        timeWindow: number;
        /**
         * Whether to include inactive users
         * @default true
         */
        includeInactive: boolean;
        /**
         * Minimum activity threshold for inclusion
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
         * Event retention period (in milliseconds)
         * @default 0 (indefinite)
         */
        retentionPeriod: number;
    };
}
export interface ActionConfig {
    /**
     * Base score impact of the action
     */
    baseScore: number;
    /**
     * Weight multipliers for different factors
     */
    weights?: {
        /**
         * Weight based on user's current trust level
         * @default 1
         */
        trustLevel?: number;
        /**
         * Weight based on user's activity history
         * @default 1
         */
        activityHistory?: number;
        /**
         * Weight based on content importance
         * @default 1
         */
        contentImportance?: number;
    };
    /**
     * Custom validation function for the action
     */
    validate?: (action: UserAction, userScore: UserScore) => boolean | Promise<boolean>;
    /**
     * Custom score calculation function
     */
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
     * Decay rate for this trust level (points per day)
     * @default 0
     */
    decayRate: number;
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
    /**
     * Unique identifier of the user performing the action
     */
    userId: string;
    /**
     * Type of action being performed
     */
    action: string;
    /**
     * Unique identifier of the target (e.g., post, comment, etc.)
     */
    targetId?: string;
    /**
     * Optional metadata about the action
     */
    metadata?: Record<string, any>;
    /**
     * Timestamp of when the action occurred
     * @default Date.now()
     */
    timestamp?: number;
}
export interface UserScore {
    /**
     * User's current score
     */
    score: number;
    /**
     * User's trust level
     */
    trustLevel: TrustLevel;
    /**
     * History of recent actions
     */
    recentActions: UserAction[];
    /**
     * Last updated timestamp
     */
    lastUpdated: number;
    /**
     * User's activity history
     */
    activityHistory: {
        /**
         * Total number of actions performed
         */
        totalActions: number;
        /**
         * Actions per category
         */
        actionCounts: Record<string, number>;
        /**
         * Last activity timestamp
         */
        lastActivity: number;
    };
    /**
     * User's event history
     */
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
     * Decay rate for this level
     */
    decayRate: number;
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
    type: 'action' | 'decay' | 'trust_change';
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
         * Decay amount (if applicable)
         */
        decayAmount?: number;
        /**
         * Trust level change (if applicable)
         */
        trustLevelChange?: {
            from: string;
            to: string;
        };
    };
}
export interface LeaderboardEntry {
    userId: string;
    score: number;
    trustLevel: TrustLevel;
    rank: number;
    activity?: {
        totalActions: number;
        lastActivity: number;
    };
}
export type KarmaKitEvents = {
    'score:updated': [userId: string, score: number];
    'action:tracked': [action: UserAction];
    'trust:updated': [userId: string, trustLevel: TrustLevel];
    'event:logged': [event: KarmaEvent];
    'decay:applied': [userId: string, decayAmount: number];
    'leaderboard:updated': [leaderboard: LeaderboardEntry[]];
};

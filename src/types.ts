export interface KarmaKitConfig {
  initialScore?: number;
  maxScore?: number;
  minScore?: number;
  actionTypes?: Record<string, ActionConfig>;
  enableRateLimiting?: boolean;
  rateLimit?: {
    maxActions: number;
    timeWindow: number;
  };
  trustLevels?: TrustLevelConfig[];
  scoreDecay?: {
    enabled: boolean;
    baseRate: number;
    minScore: number;
    maxRate: number;
  };
  leaderboard?: {
    size: number;
    timeWindow: number;
    includeInactive: boolean;
    minActivity: number;
  };
  eventLogging?: {
    enabled: boolean;
    maxEvents: number;
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
  name: string;
  minScore: number;
  actionWeight: number;
  decayRate: number;
  badge?: string;
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
  name: string;
  minScore: number;
  actionWeight: number;
  decayRate: number;
  badge: string;
  privileges: string[];
}

export interface KarmaEvent {
  type: 'action' | 'decay' | 'trust_change';
  timestamp: number;
  data: {
    action?: UserAction;
    scoreChange?: number;
    decayAmount?: number;
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
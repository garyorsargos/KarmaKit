import { createClient, RedisClientType } from 'redis';
import { UserScore, TrustLevel } from '../types.js';

export class CacheService {
  private client: RedisClientType;
  private readonly CACHE_TTL = 3600; // 1 hour in seconds

  constructor(client?: RedisClientType) {
    if (client) {
      this.client = client;
    } else if (process.env.NODE_ENV === 'test') {
      // Create a mock Redis client for testing
      this.client = {
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
        quit: async () => 'OK',
        connect: async () => {},
        on: () => this.client
      } as unknown as RedisClientType;
    } else {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.client.on('error', (err) => console.error('Redis Client Error', err));
      this.client.connect();
    }
  }

  protected getKey(prefix: string, id: string): string {
    return `${prefix}:${id}`;
  }

  async getUserScore(userId: string): Promise<UserScore | null> {
    const key = this.getKey('user:score', userId);
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async setUserScore(userId: string, score: UserScore): Promise<void> {
    const key = this.getKey('user:score', userId);
    await this.client.set(key, JSON.stringify(score), {
      EX: this.CACHE_TTL
    });
  }

  async getLeaderboard(): Promise<Array<{ userId: string; score: number; trustLevel: TrustLevel; rank: number; lastActivity: number; lastUpdated: number }> | null> {
    const key = 'leaderboard';
    const cached = await this.client.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Ensure all entries have lastActivity and lastUpdated
    return parsed.map((entry: any) => ({
      ...entry,
      lastActivity: entry.lastActivity ?? Date.now(),
      lastUpdated: entry.lastUpdated ?? Date.now()
    }));
  }

  async setLeaderboard(leaderboard: Array<{ userId: string; score: number; trustLevel: TrustLevel; rank: number; lastActivity: number; lastUpdated: number }>): Promise<void> {
    const key = 'leaderboard';
    await this.client.set(key, JSON.stringify(leaderboard), {
      EX: this.CACHE_TTL
    });
  }

  async invalidateUserScore(userId: string): Promise<void> {
    const key = this.getKey('user:score', userId);
    await this.client.del(key);
  }

  async invalidateLeaderboard(): Promise<void> {
    const key = 'leaderboard';
    await this.client.del(key);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
} 
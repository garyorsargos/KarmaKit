import { createClient } from 'redis';
import { UserScore, TrustLevel } from '../types.js';

export class CacheService {
  private client;
  private readonly CACHE_TTL = 3600; // 1 hour in seconds

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.connect();
  }

  private getKey(prefix: string, id: string): string {
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

  async getLeaderboard(): Promise<Array<{ userId: string; score: number; trustLevel: TrustLevel; rank: number }> | null> {
    const key = 'leaderboard';
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async setLeaderboard(leaderboard: Array<{ userId: string; score: number; trustLevel: TrustLevel; rank: number }>): Promise<void> {
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
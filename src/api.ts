import express, { Request, Response } from 'express';
import { KarmaKit } from './KarmaKit';
import { UserAction, TrustLevel, KarmaEvent } from './types.js';
import { appConfig } from './config';

export class KarmaKitAPI {
  private app: express.Application;
  private karmaKit: KarmaKit;

  constructor(karmaKit: KarmaKit) {
    this.karmaKit = karmaKit;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Get user karma
    this.app.get('/user/:userId/karma', async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const userScore = await this.karmaKit.getUserScore(userId);

        if (!userScore) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json({
          userId,
          score: userScore.score,
          trustLevel: userScore.trustLevel,
          activityHistory: userScore.activityHistory
        });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Record user action
    this.app.post('/user/:userId/karma/action', async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const action: UserAction = {
          userId,
          ...req.body,
          timestamp: Date.now()
        };

        const updatedScore = await this.karmaKit.trackUserAction(action);
        res.json(updatedScore);
      } catch (error) {
        if (error instanceof Error && error.message === 'Rate limit exceeded') {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update user trust level
    this.app.put('/user/:userId/trust', async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { trustLevel } = req.body;

        const userScore = await this.karmaKit.getUserScore(userId);
        if (!userScore) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Update trust level configuration
        const updatedTrustLevel: TrustLevel = {
          ...userScore.trustLevel,
          ...trustLevel
        };

        // Save updated trust level
        await this.karmaKit.updateTrustLevel(userId, updatedTrustLevel);
        res.json(updatedTrustLevel);
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get user history
    this.app.get('/user/:userId/history', async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { type, startTime, endTime } = req.query;

        const events = await this.karmaKit.getUserEvents(userId, {
          type: type as KarmaEvent['type'],
          startTime: startTime ? parseInt(startTime as string, 10) : undefined,
          endTime: endTime ? parseInt(endTime as string, 10) : undefined
        });

        res.json(events);
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  public start() {
    this.app.listen(appConfig.port, () => {
      console.log(`KarmaKit API server running on port ${appConfig.port}`);
    });
  }
} 
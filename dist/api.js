"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KarmaKitAPI = void 0;
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
class KarmaKitAPI {
    constructor(karmaKit) {
        this.karmaKit = karmaKit;
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
    }
    setupRoutes() {
        // Get user karma
        this.app.get('/user/:userId/karma', async (req, res) => {
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
            }
            catch (error) {
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Record user action
        this.app.post('/user/:userId/karma/action', async (req, res) => {
            try {
                const { userId } = req.params;
                const action = {
                    userId,
                    ...req.body,
                    timestamp: Date.now()
                };
                const updatedScore = await this.karmaKit.trackUserAction(action);
                res.json(updatedScore);
            }
            catch (error) {
                if (error instanceof Error && error.message === 'Rate limit exceeded') {
                    return res.status(429).json({ error: 'Rate limit exceeded' });
                }
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Update user trust level
        this.app.put('/user/:userId/trust', async (req, res) => {
            try {
                const { userId } = req.params;
                const { trustLevel } = req.body;
                const userScore = await this.karmaKit.getUserScore(userId);
                if (!userScore) {
                    return res.status(404).json({ error: 'User not found' });
                }
                // Update trust level configuration
                const updatedTrustLevel = {
                    ...userScore.trustLevel,
                    ...trustLevel
                };
                // Save updated trust level
                await this.karmaKit.updateTrustLevel(userId, updatedTrustLevel);
                res.json(updatedTrustLevel);
            }
            catch (error) {
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get user history
        this.app.get('/user/:userId/history', async (req, res) => {
            try {
                const { userId } = req.params;
                const { type, startTime, endTime } = req.query;
                const events = await this.karmaKit.getUserEvents(userId, {
                    type: type,
                    startTime: startTime ? parseInt(startTime, 10) : undefined,
                    endTime: endTime ? parseInt(endTime, 10) : undefined
                });
                res.json(events);
            }
            catch (error) {
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    start() {
        this.app.listen(config_1.appConfig.port, () => {
            console.log(`KarmaKit API server running on port ${config_1.appConfig.port}`);
        });
    }
}
exports.KarmaKitAPI = KarmaKitAPI;
//# sourceMappingURL=api.js.map
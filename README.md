# Karma-Kit

A flexible and extensible karma/reputation system for Node.js applications.

## Features

- User karma scoring and trust levels
- Configurable action types and weights
- Rate limiting and score decay
- Event logging and history
- Leaderboard functionality
- Real-time updates via events
- PostgreSQL database integration
- Redis caching for performance
- RESTful API endpoints

## Installation

```bash
npm install karma-kit
```

## Configuration

Create a `.env` file in your project root with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/karma_kit

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Application Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

## Usage

```typescript
import { KarmaKit } from 'karma-kit';

const karmaKit = new KarmaKit({
  initialScore: 0,
  maxScore: 1000,
  minScore: -100,
  actionTypes: {
    upvote: { baseScore: 1 },
    downvote: { baseScore: -1 },
    report: { baseScore: -2 },
    achievement: { baseScore: 5 }
  },
  enableRateLimiting: true,
  rateLimit: {
    maxActions: 100,
    timeWindow: 3600000 // 1 hour
  },
  trustLevels: [
    { name: 'Newcomer', minScore: -Infinity, actionWeight: 0.5, decayRate: 0.5 },
    { name: 'Contributor', minScore: 0, actionWeight: 1, decayRate: 0.2 },
    { name: 'Trusted', minScore: 50, actionWeight: 1.5, decayRate: 0.1 },
    { name: 'Expert', minScore: 100, actionWeight: 2, decayRate: 0 }
  ],
  scoreDecay: {
    enabled: true,
    baseRate: 0.1,
    minScore: 0,
    maxRate: 1
  },
  leaderboard: {
    size: 10,
    timeWindow: 0,
    includeInactive: true,
    minActivity: 0
  },
  eventLogging: {
    enabled: true,
    maxEvents: 1000,
    retentionPeriod: 0
  }
});

// Track user actions
await karmaKit.trackUserAction({
  userId: 'user123',
  action: 'upvote',
  targetId: 'post456',
  metadata: { reason: 'helpful content' }
});

// Get user score
const userScore = await karmaKit.getUserScore('user123');

// Get leaderboard
const leaderboard = await karmaKit.getLeaderboard();

// Get user events
const events = await karmaKit.getUserEvents('user123', {
  type: 'action',
  startTime: Date.now() - 86400000 // Last 24 hours
});

// Apply score decay (should be called periodically)
await karmaKit.applyScoreDecay();

// Clean up resources
await karmaKit.close();
```

## API Endpoints

- `GET /user/{userId}/karma` - Get user's karma score and trust level
- `POST /user/{userId}/karma/action` - Record a new action
- `GET /leaderboard` - Get the leaderboard
- `PUT /user/{userId}/trust` - Update user's trust level
- `GET /user/{userId}/history` - Get user's event history

## Events

The KarmaKit class extends EventEmitter and emits the following events:

- `score:updated` - When a user's score changes
- `action:tracked` - When a new action is tracked
- `trust:updated` - When a user's trust level changes
- `event:logged` - When a new event is logged
- `decay:applied` - When score decay is applied
- `leaderboard:updated` - When the leaderboard is updated

## Database Schema

The application uses PostgreSQL with the following schema:

- `User` - User information and scores
- `Score` - User score history
- `Action` - Recorded user actions
- `Event` - System events
- `TrustLevel` - Trust level definitions

## Caching

Redis is used for caching:
- User scores
- Leaderboard data
- Trust level configurations

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up PostgreSQL and Redis
4. Create a `.env` file based on `.env.example`
5. Run tests: `npm test`
6. Start development server: `npm run dev`

## License

MIT 
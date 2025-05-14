# KarmaKit

KarmaKit is a flexible, extensible user reputation and trust system for Node.js applications. It tracks user actions, updates scores, manages trust levels, and provides event logging and rate limiting features.

## Features

- **User Scoring:** Track and update user scores based on configurable actions.
- **Trust Levels:** Define custom trust levels with score thresholds and action weights.
- **Rate Limiting:** Prevent abuse by limiting the number of actions per user in a time window.
- **Event Logging:** Log user actions and trust level changes for auditing and analytics.
- **API Endpoints:** RESTful API for interacting with user karma, trust levels, and history.

## Installation

```bash
npm install karma-kit
```

## Quick Start

Here's a simple example to get you started:

```typescript
import { KarmaKit } from 'karma-kit';

// Create a new KarmaKit instance with basic configuration
const karmaKit = new KarmaKit({
  // Start users with 0 points
  initialScore: 0,
  
  // Define a simple action type
  actionTypes: {
    like: { baseScore: 1 },
    dislike: { baseScore: -1 }
  },
  
  // Define basic trust levels
  trustLevels: [
    { 
      name: 'Newcomer',
      minScore: 0,
      actionWeight: 1,
      badge: '🌱',
      privileges: ['basic_access']
    },
    { 
      name: 'Trusted',
      minScore: 10,
      actionWeight: 1,
      badge: '⭐',
      privileges: ['basic_access', 'advanced_access']
    }
  ]
});

// Example: Track a user's action
async function example() {
  // User likes a post
  const result = await karmaKit.trackUserAction({
    userId: 'user123',
    action: 'like',
    targetId: 'post456'
  });

  console.log('User score:', result.score);
  console.log('Trust level:', result.trustLevel.name);
  console.log('Badge:', result.trustLevel.badge);
}

// Run the example
example();
```

This will output something like:
```
User score: 1
Trust level: Newcomer
Badge: 🌱
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
    { name: 'Newcomer', minScore: 0, actionWeight: 1, badge: '🌱', privileges: ['basic_access'] },
    { name: 'Contributor', minScore: 2, actionWeight: 1.2, badge: '🎖️', privileges: ['basic_access', 'post'] },
    { name: 'Trusted', minScore: 5, actionWeight: 1.5, badge: '⭐', privileges: ['basic_access', 'post', 'vote'] }
  ],
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

// Get user events
const events = await karmaKit.getUserEvents('user123', {
  type: 'action',
  startTime: Date.now() - 86400000 // Last 24 hours
});

// Clean up resources
await karmaKit.close();
```

## API Endpoints

- `GET /user/{userId}/karma` - Get user's karma score and trust level
- `POST /user/{userId}/karma/action` - Record a new action
- `PUT /user/{userId}/trust` - Update user's trust level
- `GET /user/{userId}/history` - Get user's event history

## Events

- `score:updated` — User's score was updated
- `action:tracked` — User action was tracked
- `trust:updated` — User's trust level was updated
- `event:logged` — An event was logged

## Configuration Reference

- **initialScore**: Starting score for new users
- **maxScore / minScore**: Score boundaries
- **actionTypes**: Map of action names to base scores
- **enableRateLimiting**: Enable/disable rate limiting
- **rateLimit**: { maxActions, timeWindow } per user
- **trustLevels**: Array of trust level configs (name, minScore, actionWeight, badge, privileges)
- **eventLogging**: { enabled, maxEvents, retentionPeriod }

## Running Tests

To run the test suite:

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Set up environment variables:**
   - You can use the provided `.env.example` as a template:
     ```bash
     cp .env.example .env
     ```
   - For most tests, the default values will work. The test suite uses in-memory mocks for the database and cache, so you do **not** need a running PostgreSQL or Redis instance (or Docker containers) for basic tests.
3. **Run the tests:**
   ```bash
   npm test
   ```

> **Note:**
> You only need PostgreSQL and Redis running (e.g., via Docker) if you want to run the full application or add integration tests that use real services. For the default test suite, containers are not required.

If you encounter issues, ensure your Node.js version matches the project's requirements and that your dependencies are up to date.

## Final Notes

- All leaderboard and score decay functionality has been removed.
- Trust levels and scoring are fully customizable.
- The system is extensible for additional features as needed.

## Database Schema

The application uses PostgreSQL with the following schema:

- `User` - User information and scores
- `
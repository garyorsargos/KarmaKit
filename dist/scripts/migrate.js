"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/generated/prisma");
const config_1 = require("../src/config");
async function main() {
    const prisma = new prisma_1.PrismaClient({
        datasources: {
            db: {
                url: config_1.dbConfig.url
            }
        }
    });
    try {
        console.log('Running database migrations...');
        await prisma.$executeRaw `
      -- Create enum types
      CREATE TYPE "TrustLevelName" AS ENUM ('Newcomer', 'Contributor', 'Trusted', 'Expert');
      CREATE TYPE "EventType" AS ENUM ('action', 'decay', 'trust_change');

      -- Create tables
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "score" INTEGER NOT NULL DEFAULT 0,
        "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "Score" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "score" INTEGER NOT NULL,
        "lastUpdated" TIMESTAMP(3) NOT NULL,
        "totalActions" INTEGER NOT NULL DEFAULT 0,
        "actionCounts" JSONB NOT NULL DEFAULT '{}',
        "lastActivity" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "Action" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "targetId" TEXT,
        "metadata" JSONB,
        "timestamp" TIMESTAMP(3) NOT NULL,
        "scoreChange" INTEGER NOT NULL,
        CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "Event" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "type" "EventType" NOT NULL,
        "timestamp" TIMESTAMP(3) NOT NULL,
        "data" JSONB NOT NULL,
        CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "TrustLevel" (
        "id" TEXT NOT NULL,
        "name" "TrustLevelName" NOT NULL,
        "minScore" INTEGER NOT NULL,
        "actionWeight" DOUBLE PRECISION NOT NULL,
        "decayRate" DOUBLE PRECISION NOT NULL,
        "badge" TEXT NOT NULL,
        "privileges" TEXT[] NOT NULL,
        CONSTRAINT "TrustLevel_pkey" PRIMARY KEY ("id")
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS "Score_userId_idx" ON "Score"("userId");
      CREATE INDEX IF NOT EXISTS "Action_userId_idx" ON "Action"("userId");
      CREATE INDEX IF NOT EXISTS "Action_timestamp_idx" ON "Action"("timestamp");
      CREATE INDEX IF NOT EXISTS "Event_userId_idx" ON "Event"("userId");
      CREATE INDEX IF NOT EXISTS "Event_timestamp_idx" ON "Event"("timestamp");
      CREATE INDEX IF NOT EXISTS "TrustLevel_name_idx" ON "TrustLevel"("name");

      -- Create foreign key constraints
      ALTER TABLE "Score" ADD CONSTRAINT "Score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "Action" ADD CONSTRAINT "Action_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `;
        console.log('Database migrations completed successfully!');
    }
    catch (error) {
        console.error('Error running database migrations:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=migrate.js.map
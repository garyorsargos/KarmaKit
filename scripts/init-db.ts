import { PrismaClient } from '../src/generated/prisma';
import { dbConfig } from '../src/config';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbConfig.url
      }
    }
  });

  try {
    // Create default trust levels
    const trustLevels = [
      {
        name: 'Newcomer',
        minScore: -Infinity,
        actionWeight: 0.5,
        decayRate: 0.5,
        badge: '🌱',
        privileges: ['basic_access']
      },
      {
        name: 'Contributor',
        minScore: 0,
        actionWeight: 1,
        decayRate: 0.2,
        badge: '⭐',
        privileges: ['basic_access', 'create_content']
      },
      {
        name: 'Trusted',
        minScore: 50,
        actionWeight: 1.5,
        decayRate: 0.1,
        badge: '🌟',
        privileges: ['basic_access', 'create_content', 'moderate_content']
      },
      {
        name: 'Expert',
        minScore: 100,
        actionWeight: 2,
        decayRate: 0,
        badge: '👑',
        privileges: ['basic_access', 'create_content', 'moderate_content', 'admin_access']
      }
    ];

    console.log('Creating trust levels...');
    for (const level of trustLevels) {
      await prisma.trustLevel.upsert({
        where: { name: level.name },
        update: level,
        create: level
      });
    }

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = exports.redisConfig = exports.dbConfig = void 0;
const dotenv_1 = require("dotenv");
// Load environment variables from .env file
(0, dotenv_1.config)();
exports.dbConfig = {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/karma_kit',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
};
exports.redisConfig = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    tls: process.env.NODE_ENV === 'production' ? {} : undefined
};
exports.appConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    }
};
//# sourceMappingURL=config.js.map
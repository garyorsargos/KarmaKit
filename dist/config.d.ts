export declare const dbConfig: {
    url: string;
    ssl: {
        rejectUnauthorized: boolean;
    } | undefined;
};
export declare const redisConfig: {
    url: string;
    password: string | undefined;
    tls: {} | undefined;
};
export declare const appConfig: {
    port: number;
    env: string;
    cors: {
        origin: string;
        methods: string[];
        allowedHeaders: string[];
    };
    rateLimit: {
        windowMs: number;
        max: number;
    };
};

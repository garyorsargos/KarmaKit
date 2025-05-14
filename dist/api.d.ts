import { KarmaKit } from './KarmaKit';
export declare class KarmaKitAPI {
    private app;
    private karmaKit;
    constructor(karmaKit: KarmaKit);
    private setupMiddleware;
    private setupRoutes;
    start(): void;
}

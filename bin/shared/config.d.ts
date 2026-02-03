import 'dotenv/config';
import { Config } from './types';
declare class ConfigManager {
    private config;
    private configPath;
    constructor(configPath?: string);
    private loadConfig;
    get(): Config;
    getSection<K extends keyof Config>(section: K): Config[K];
    update<K extends keyof Config>(section: K, updates: Partial<Config[K]>): void;
    private saveConfig;
    isProduction(): boolean;
    isDevelopment(): boolean;
}
declare const configManager: ConfigManager;
export default configManager;
//# sourceMappingURL=config.d.ts.map
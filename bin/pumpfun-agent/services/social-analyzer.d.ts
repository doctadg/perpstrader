import { SocialAnalysis } from '../../shared/types';
/**
 * Social Analyzer Service
 * Analyzes social media presence and engagement
 */
declare class SocialAnalyzerService {
    private timeout;
    constructor();
    /**
     * Analyze social media presence from metadata
     */
    analyzeSocial(metadata: {
        twitter?: string;
        telegram?: string;
        discord?: string;
    }): Promise<SocialAnalysis>;
    /**
     * Analyze Twitter presence
     */
    private analyzeTwitter;
    /**
     * Analyze Telegram presence
     */
    private analyzeTelegram;
    /**
     * Analyze Discord presence
     */
    private analyzeDiscord;
    /**
     * Calculate overall social presence score (0-1)
     */
    private calculateOverallScore;
    /**
     * Estimate sentiment from text (simplified)
     */
    private estimateSentiment;
    /**
     * Get empty Twitter result
     */
    private getEmptyTwitter;
    /**
     * Get empty Telegram result
     */
    private getEmptyTelegram;
    /**
     * Get empty Discord result
     */
    private getEmptyDiscord;
    /**
     * Parse social handle from various formats
     */
    parseTwitterHandle(handle: string): string;
    parseTelegramUsername(username: string): string;
    parseDiscordInvite(invite: string): string;
}
declare const socialAnalyzerService: SocialAnalyzerService;
export default socialAnalyzerService;
//# sourceMappingURL=social-analyzer.d.ts.map
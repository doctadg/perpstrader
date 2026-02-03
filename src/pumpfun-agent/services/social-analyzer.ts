// Social Analyzer Service for pump.fun Token Analysis
// Analyzes social media presence for tokens (Twitter, Telegram, Discord)

import axios from 'axios';
import logger from '../../shared/logger';
import { SocialAnalysis } from '../../shared/types';

/**
 * Social Analyzer Service
 * Analyzes social media presence and engagement
 */
class SocialAnalyzerService {
  private timeout: number;

  constructor() {
    this.timeout = 10000; // 10 second timeout
  }

  /**
   * Analyze social media presence from metadata
   */
  async analyzeSocial(metadata: {
    twitter?: string;
    telegram?: string;
    discord?: string;
  }): Promise<SocialAnalysis> {
    logger.debug(`[SocialAnalyzer] Analyzing social links for token`);

    // Analyze Twitter
    const twitter = await this.analyzeTwitter(metadata.twitter);

    // Analyze Telegram
    const telegram = await this.analyzeTelegram(metadata.telegram);

    // Analyze Discord
    const discord = await this.analyzeDiscord(metadata.discord);

    // Calculate overall presence score
    const overallPresenceScore = this.calculateOverallScore({
      twitter,
      telegram,
      discord,
    });

    return {
      twitter,
      telegram,
      discord,
      overallPresenceScore,
      glmAnalysis: '', // Will be filled by GLM analysis
    };
  }

  /**
   * Analyze Twitter presence
   */
  private async analyzeTwitter(handle?: string): Promise<{
    exists: boolean;
    followerCount: number;
    tweetCount: number;
    createdAt?: Date;
    bio: string;
    verified: boolean;
    sentimentScore: number;
  }> {
    if (!handle) {
      return this.getEmptyTwitter();
    }

    try {
      // Normalize handle
      const normalizedHandle = handle.replace('@', '').replace('https://twitter.com/', '').replace('https://x.com/', '');

      // Try to fetch from public API (limited without authentication)
      // In production, this would use Twitter API v2 with proper credentials
      const url = `https://nitter.net/${normalizedHandle}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
        },
      }).catch(() => null);

      if (response && response.status === 200) {
        // Parse response (simplified - nitter HTML scraping)
        const html = response.data;

        // Extract followers (nitter specific)
        const followersMatch = html.match(/followers[\s\S]*?(\d+[,\d]+)/i);
        const followerCount = followersMatch
          ? parseInt(followersMatch[1].replace(/,/g, ''))
          : 0;

        // Extract bio
        const bioMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
        const bio = bioMatch ? bioMatch[1] : '';

        return {
          exists: true,
          followerCount,
          tweetCount: 0, // Harder to get without auth
          bio,
          verified: false, // Harder to check without auth
          sentimentScore: this.estimateSentiment(bio),
        };
      }

      // Fallback: assume exists but can't get details
      return {
        exists: true,
        followerCount: 0,
        tweetCount: 0,
        bio: '',
        verified: false,
        sentimentScore: 0.5,
      };
    } catch (error) {
      logger.debug(`[SocialAnalyzer] Twitter analysis failed for ${handle}: ${error}`);
      return this.getEmptyTwitter();
    }
  }

  /**
   * Analyze Telegram presence
   */
  private async analyzeTelegram(username?: string): Promise<{
    exists: boolean;
    memberCount: number;
    isChannel: boolean;
    description: string;
  }> {
    if (!username) {
      return this.getEmptyTelegram();
    }

    try {
      // Normalize username
      const normalizedUsername = username
        .replace('@', '')
        .replace('https://t.me/', '')
        .replace('https://telegram.me/', '')
        .replace('t.me/', '');

      // Try to get Telegram preview (tgstat or similar)
      // In production, this would use Telegram Bot API
      const url = `https://t.me/${normalizedUsername}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
        },
      }).catch(() => null);

      if (response && response.status === 200) {
        const html = response.data;

        // Extract member count from Telegram web page
        const membersMatch = html.match(/(\d+[,\d\s]+)\s+(members|subscribers)/i);
        const memberCount = membersMatch
          ? parseInt(membersMatch[1].replace(/[,s]/g, ''))
          : 0;

        // Check if channel or group
        const isChannel = html.includes('channel') || !html.includes('group');

        return {
          exists: true,
          memberCount,
          isChannel,
          description: '', // Harder to get without API
        };
      }

      // Fallback: assume exists
      return {
        exists: true,
        memberCount: 0,
        isChannel: true,
        description: '',
      };
    } catch (error) {
      logger.debug(`[SocialAnalyzer] Telegram analysis failed for ${username}: ${error}`);
      return this.getEmptyTelegram();
    }
  }

  /**
   * Analyze Discord presence
   */
  private async analyzeDiscord(invite?: string): Promise<{
    exists: boolean;
    memberCount: number;
    inviteActive: boolean;
  }> {
    if (!invite) {
      return this.getEmptyDiscord();
    }

    try {
      // Normalize invite code
      let inviteCode = invite
        .replace('https://discord.gg/', '')
        .replace('https://discord.com/invite/', '')
        .replace('http://discord.gg/', '')
        .replace('discord.gg/', '')
        .split('/')[0]
        .split('?')[0];

      if (!inviteCode) {
        return this.getEmptyDiscord();
      }

      // Try to get Discord invite info
      const url = `https://discord.com/api/v10/invites/${inviteCode}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
        },
      }).catch(() => null);

      if (response && response.status === 200) {
        const data = response.data;

        return {
          exists: true,
          memberCount: data.approximate_member_count || 0,
          inviteActive: !data.expired,
        };
      }

      // Fallback: assume exists but can't get details
      return {
        exists: true,
        memberCount: 0,
        inviteActive: true,
      };
    } catch (error) {
      logger.debug(`[SocialAnalyzer] Discord analysis failed for ${invite}: ${error}`);
      return this.getEmptyDiscord();
    }
  }

  /**
   * Calculate overall social presence score (0-1)
   */
  private calculateOverallScore(social: {
    twitter: { exists: boolean; followerCount: number };
    telegram: { exists: boolean; memberCount: number };
    discord: { exists: boolean; memberCount: number };
  }): number {
    let score = 0;
    let maxScore = 0;

    // Twitter (up to 0.4)
    maxScore += 0.4;
    if (social.twitter.exists) {
      score += 0.1; // Has Twitter
      if (social.twitter.followerCount > 100) score += 0.1;
      if (social.twitter.followerCount > 1000) score += 0.1;
      if (social.twitter.followerCount > 10000) score += 0.1;
    }

    // Telegram (up to 0.35)
    maxScore += 0.35;
    if (social.telegram.exists) {
      score += 0.1; // Has Telegram
      if (social.telegram.memberCount > 100) score += 0.1;
      if (social.telegram.memberCount > 1000) score += 0.15;
    }

    // Discord (up to 0.25)
    maxScore += 0.25;
    if (social.discord.exists) {
      score += 0.1; // Has Discord
      if (social.discord.memberCount > 100) score += 0.08;
      if (social.discord.memberCount > 1000) score += 0.07;
    }

    return Math.min(1, score);
  }

  /**
   * Estimate sentiment from text (simplified)
   */
  private estimateSentiment(text: string): number {
    if (!text) return 0.5;

    const positiveWords = ['moon', 'gem', 'alpha', 'bullish', 'growth', 'community', 'safe', 'secure'];
    const negativeWords = ['scam', 'rug', 'ponzi', 'honey pot', 'fake', 'risk'];

    let score = 0.5;

    for (const word of positiveWords) {
      if (text.toLowerCase().includes(word)) {
        score += 0.05;
      }
    }

    for (const word of negativeWords) {
      if (text.toLowerCase().includes(word)) {
        score -= 0.1;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get empty Twitter result
   */
  private getEmptyTwitter() {
    return {
      exists: false,
      followerCount: 0,
      tweetCount: 0,
      bio: '',
      verified: false,
      sentimentScore: 0,
    };
  }

  /**
   * Get empty Telegram result
   */
  private getEmptyTelegram() {
    return {
      exists: false,
      memberCount: 0,
      isChannel: false,
      description: '',
    };
  }

  /**
   * Get empty Discord result
   */
  private getEmptyDiscord() {
    return {
      exists: false,
      memberCount: 0,
      inviteActive: false,
    };
  }

  /**
   * Parse social handle from various formats
   */
  parseTwitterHandle(handle: string): string {
    return handle
      .replace('@', '')
      .replace('https://twitter.com/', '')
      .replace('https://x.com/', '')
      .replace('twitter.com/', '')
      .replace('x.com/', '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  }

  parseTelegramUsername(username: string): string {
    return username
      .replace('@', '')
      .replace('https://t.me/', '')
      .replace('http://t.me/', '')
      .replace('t.me/', '')
      .replace('telegram.me/', '')
      .replace('telegram.dog/', '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  }

  parseDiscordInvite(invite: string): string {
    return invite
      .replace('https://discord.gg/', '')
      .replace('https://discord.com/invite/', '')
      .replace('http://discord.gg/', '')
      .replace('discord.gg/', '')
      .replace('discord.com/invite/', '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  }
}

// Singleton instance
const socialAnalyzerService = new SocialAnalyzerService();
export default socialAnalyzerService;

import { ScoredNarrative, CoinConcept, GeneratorConfig, LLMCoinResponse, GeneratedMetadata } from './types';
import { generateTokenImage } from './image-generator';
import { uploadToIPFS, buildMetadata } from './metadata-builder';

const SYSTEM_PROMPT = `You are a degen crypto meme coin name generator. Given a trending narrative, generate a catchy meme token suitable for pump.fun. Be creative, funny, and culturally relevant. Use internet slang, meme culture, and crypto Twitter language.

Return ONLY valid JSON with these fields:
- name: The full token name (catchy, meme-worthy, 2-5 words)
- symbol: Ticker symbol (3-6 uppercase letters, no $)
- description: A hype description for the token (2-3 sentences, energetic, use emojis)
- tweet: A Twitter hype tweet about this token (include $SYMBOL, hashtags, emojis, under 280 chars)

Be edgy but not offensive. Make it sound like a real degen play.`;

export class CoinGenerator {
  private config: GeneratorConfig;

  constructor(config?: Partial<GeneratorConfig>) {
    this.config = {
      openaiApiKey: config?.openaiApiKey || process.env.OPENAI_API_KEY,
      openaiBaseUrl: config?.openaiBaseUrl || process.env.OPENAI_BASE_URL,
      dalleEnabled: config?.dalleEnabled ?? (process.env.DALLE_ENABLED === 'true'),
      pinataJwt: config?.pinataJwt || process.env.PINATA_JWT || '',
      model: config?.model || process.env.COIN_GEN_MODEL || 'gpt-4o-mini',
    };
  }

  /**
   * Generate a complete coin concept from a scored narrative.
   */
  async generate(narrative: ScoredNarrative): Promise<CoinConcept> {
    // 1. Use LLM to generate coin concept
    const llmResult = await this.generateCoinConcept(narrative);

    // 2. Generate token image
    const imageBuffer = await generateTokenImage(llmResult.symbol, llmResult.name, {
      openaiApiKey: this.config.openaiApiKey,
      dalleEnabled: this.config.dalleEnabled,
    });

    // 3. Upload to IPFS and build metadata
    let metadata: GeneratedMetadata;

    if (this.config.pinataJwt) {
      const { imageUri, metadataUri } = await uploadToIPFS(
        imageBuffer,
        llmResult.name,
        llmResult.symbol,
        llmResult.description,
        { pinataJwt: this.config.pinataJwt }
      );
      metadata = buildMetadata(llmResult.name, llmResult.symbol, llmResult.description, imageUri);
      metadata.image = imageUri;
    } else {
      // No Pinata — return with placeholder URI
      metadata = buildMetadata(llmResult.name, llmResult.symbol, llmResult.description, 'ipfs://pending-upload');
    }

    return {
      name: llmResult.name,
      symbol: llmResult.symbol,
      description: llmResult.description,
      imageBuffer,
      tweet: llmResult.tweet,
      metadata,
    };
  }

  /**
   * Call LLM to generate coin name/symbol/description/tweet.
   */
  private async generateCoinConcept(narrative: ScoredNarrative): Promise<LLMCoinResponse> {
    const apiKey = this.config.openaiApiKey;
    if (!apiKey) {
      // Fallback: generate from narrative without LLM
      return this.fallbackGeneration(narrative);
    }

    const baseUrl = this.config.openaiBaseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const userPrompt = `Trending narrative:
Title: ${narrative.title}
Description: ${narrative.description}
Hashtags: ${narrative.hashtags.join(' ')}
Source: ${narrative.source}

Generate a meme token for this narrative.`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error (${res.status}): ${text}`);
    }

    const json = await res.json() as any;
    const content = json.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      return JSON.parse(jsonMatch[1].trim()) as LLMCoinResponse;
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${content}`);
    }
  }

  /**
   * Fallback generation when no LLM API key is available.
   */
  private fallbackGeneration(narrative: ScoredNarrative): LLMCoinResponse {
    // Extract key words from title
    const words = narrative.title.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    
    const name = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    const symbol = words
      .filter(w => w.length > 2)
      .slice(0, 2)
      .map(w => w.substring(0, 3).toUpperCase())
      .join('')
      .substring(0, 6);

    const hashStr = narrative.hashtags.length > 0 ? narrative.hashtags[0] : '#Crypto';
    
    return {
      name: name || 'MemeCoin',
      symbol: symbol || 'MEME',
      description: `🚀 ${name || 'MemeCoin'} is here to disrupt the ${narrative.title} narrative! Based on the hottest trend right now. Diamond hands only! 💎🙌`,
      tweet: `🚀 $${symbol || 'MEME'} just dropped — the ${narrative.title} play nobody saw coming ${hashStr} #Solana #PumpFun 🐸🔥`,
    };
  }
}

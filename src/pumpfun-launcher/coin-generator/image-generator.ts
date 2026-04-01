import * as sharp from 'sharp';

export interface ImageGenConfig {
  openaiApiKey?: string;
  dalleEnabled: boolean;
}

const MEME_COLORS: [string, string][] = [
  ['#FF0080', '#7928CA'], // pink-purple
  ['#FF6B00', '#FFD600'], // orange-yellow
  ['#00FF87', '#60EFFF'], // green-cyan
  ['#FF0055', '#FF8A00'], // red-orange
  ['#7B2FF7', '#C471F5'], // purple-lavender
  ['#00D4FF', '#00FF94'], // cyan-green
  ['#FF3CAC', '#784BA0'], // pink-purple
  ['#F7971E', '#FFD200'], // warm yellow
];

/**
 * Generate a programmatic meme-style token logo using sharp.
 * Creates a colorful circular token with gradient + symbol text.
 */
export async function generateTokenImageProgrammatic(
  symbol: string,
  name: string
): Promise<Buffer> {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;

  // Pick random color pair
  const [color1, color2] = MEME_COLORS[Math.floor(Math.random() * MEME_COLORS.length)];

  // Build SVG with gradient circle + text
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color1}"/>
          <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>
        <radialGradient id="glow" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.3)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
      </defs>
      
      <!-- Main circle -->
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#bg)" filter="url(#shadow)"/>
      
      <!-- Inner highlight -->
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#glow)"/>
      
      <!-- Border ring -->
      <circle cx="${cx}" cy="${cy}" r="${radius - 4}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
      
      <!-- Symbol text -->
      <text x="${cx}" y="${cy + 10}" 
            font-family="Arial,Helvetica,sans-serif" 
            font-size="${symbol.length > 4 ? 100 : 140}" 
            font-weight="900" 
            fill="white" 
            text-anchor="middle" 
            dominant-baseline="middle"
            filter="url(#shadow)">
        $${symbol}
      </text>
      
      <!-- Small name at bottom -->
      <text x="${cx}" y="${cy + radius - 50}" 
            font-family="Arial,Helvetica,sans-serif" 
            font-size="24" 
            font-weight="700" 
            fill="rgba(255,255,255,0.8)" 
            text-anchor="middle">
        ${name.length > 20 ? name.substring(0, 20) + '…' : name}
      </text>
    </svg>
  `;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return buffer;
}

/**
 * Generate token image via DALL-E API.
 */
export async function generateTokenImageDalle(
  symbol: string,
  name: string,
  apiKey: string,
  baseUrl?: string
): Promise<Buffer> {
  const { default: OpenAI } = await import('openai');
  
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || 'https://api.openai.com/v1',
  });

  const prompt = `A meme-style crypto token logo for "${name}" ($${symbol}). Colorful, cartoon style, circular design with bold text. No text except "$${symbol}". Bright meme aesthetic, suitable for a coin listing. White or transparent background.`;

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data from DALL-E');

  // Resize to 512x512 and convert to PNG buffer
  const buf = await sharp(Buffer.from(b64, 'base64'))
    .resize(512, 512)
    .png()
    .toBuffer();

  return buf;
}

export async function generateTokenImage(
  symbol: string,
  name: string,
  config: ImageGenConfig
): Promise<Buffer> {
  if (config.dalleEnabled && config.openaiApiKey) {
    try {
      return await generateTokenImageDalle(symbol, name, config.openaiApiKey);
    } catch (err) {
      console.warn('DALL-E failed, falling back to programmatic:', err);
    }
  }

  return generateTokenImageProgrammatic(symbol, name);
}

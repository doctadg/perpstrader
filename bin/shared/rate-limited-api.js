"use strict";
// Rate-limited fetch for z.ai API calls
// Use this instead of direct axios.post() to avoid 429 errors
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitedChatCompletion = rateLimitedChatCompletion;
const shared_rate_limiter_1 = require("./shared-rate-limiter");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("./config"));
const config = config_1.default.get();
const API_KEY = config.openrouter.apiKey;
const BASE_URL = config.openrouter.baseUrl;
const DEFAULT_HEADERS = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://perps-trader.ai',
    'X-Title': 'PerpsTrader AI',
};
/**
 * Rate-limited chat completion call to z.ai.
 * All callers should use this instead of direct axios.post().
 * Handles rate limiting, retries, and error logging.
 */
async function rateLimitedChatCompletion(caller, options) {
    await (0, shared_rate_limiter_1.acquire)(caller);
    const { model, messages, temperature = 0.7, max_tokens = 4000, timeout = 60000, systemMessage } = options;
    const allMessages = systemMessage
        ? [{ role: 'system', content: systemMessage }, ...messages]
        : messages;
    const retries = options.retries || 2;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios_1.default.post(`${BASE_URL}/chat/completions`, {
                model: model || config.openrouter.labelingModel,
                messages: allMessages,
                temperature,
                max_tokens,
            }, {
                headers: DEFAULT_HEADERS,
                timeout,
            });
            shared_rate_limiter_1.reportSuccess();
            return response.data;
        }
        catch (error) {
            const status = error?.response?.status;
            if (status === 429) {
                shared_rate_limiter_1.report429();
                if (attempt === retries)
                    throw error;
                const jitter = Math.random() * 2000;
                const backoff = Math.min(5000 * Math.pow(2, attempt - 1) + jitter, 60000);
                await new Promise(r => setTimeout(r, backoff));
            }
            else {
                if (attempt === retries)
                    throw error;
                const backoff = 1000 * attempt;
                await new Promise(r => setTimeout(r, backoff));
            }
        }
    }
    throw new Error('rateLimitedChatCompletion failed after retries');
}

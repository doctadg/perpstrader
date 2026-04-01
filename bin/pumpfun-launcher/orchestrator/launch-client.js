"use strict";
/**
 * HTTP client for printterminal's launcher API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaunchClient = void 0;
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'launch-client' });
class LaunchClient {
    baseUrl;
    constructor(baseUrl = 'http://localhost:3001') {
        this.baseUrl = baseUrl;
    }
    /** Execute a spam launch */
    async spamLaunch(plan, launchIndex = 0) {
        logger.info({ runId: plan.runId, launchIndex }, 'Sending spam-launch request');
        const res = await fetch(`${this.baseUrl}/api/launcher/spam-launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, launchIndex }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`spam-launch failed (${res.status}): ${body}`);
        }
        const data = await res.json();
        logger.info({ runId: data.runId, mint: data.mintPublicKey }, 'Launch response received');
        return data;
    }
    /** Ensure wallet groups exist for buying */
    async ensureWallets(groupName, count) {
        const res = await fetch(`${this.baseUrl}/api/launcher/wallets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupName, count }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`wallets failed (${res.status}): ${body}`);
        }
        return res.json();
    }
    /** Upload metadata to IPFS */
    async uploadMetadata(metadata) {
        const formData = new FormData();
        formData.append('name', metadata.name);
        formData.append('symbol', metadata.symbol);
        formData.append('description', metadata.description);
        const blob = new Blob([metadata.imageBuffer]);
        formData.append('image', blob, metadata.filename);
        const res = await fetch(`${this.baseUrl}/api/launcher/upload`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`upload failed (${res.status}): ${body}`);
        }
        return res.json();
    }
}
exports.LaunchClient = LaunchClient;
//# sourceMappingURL=launch-client.js.map
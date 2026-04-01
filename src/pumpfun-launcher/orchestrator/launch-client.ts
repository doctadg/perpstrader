/**
 * HTTP client for printterminal's launcher API
 */

import pino from 'pino';
import type { Plan } from '../../../shared/launcher-plan-types';

const logger = pino({ name: 'launch-client' });

export interface SpamLaunchResponse {
  runId: string;
  status: string;
  mode: string;
  launchIndex: number;
  mintPublicKey?: string;
  bondingCurvePublicKey?: string;
  message: string;
}

export interface WalletGroupResponse {
  id: string;
  wallets: Array<{ id: string; publicKey: string }>;
}

export interface UploadResponse {
  uri: string;
  metadataUri: string;
}

export class LaunchClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  /** Execute a spam launch */
  async spamLaunch(plan: Plan, launchIndex = 0): Promise<SpamLaunchResponse> {
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

    const data = await res.json() as SpamLaunchResponse;
    logger.info({ runId: data.runId, mint: data.mintPublicKey }, 'Launch response received');
    return data;
  }

  /** Ensure wallet groups exist for buying */
  async ensureWallets(groupName: string, count: number): Promise<WalletGroupResponse> {
    const res = await fetch(`${this.baseUrl}/api/launcher/wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName, count }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`wallets failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<WalletGroupResponse>;
  }

  /** Upload metadata to IPFS */
  async uploadMetadata(metadata: {
    name: string;
    symbol: string;
    description: string;
    imageBuffer: Buffer;
    filename: string;
  }): Promise<UploadResponse> {
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

    return res.json() as Promise<UploadResponse>;
  }
}

import * as fs from 'fs';

export interface PinataConfig {
  pinataJwt: string;
}

export interface UploadResult {
  imageUri: string;   // ipfs://<cid>
  metadataUri: string; // ipfs://<cid>
}

/**
 * Upload a file to IPFS via Pinata.
 */
async function pinataUpload(
  data: Buffer,
  filename: string,
  jwt: string
): Promise<string> {
  const FormData = await import('form-data');
  
  const form = new (FormData as any).default || FormData();
  form.append('file', data, { filename });

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...form.getHeaders(),
    },
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }

  const json = await res.json() as any;
  return `ipfs://${json.IpfsHash}`;
}

/**
 * Build pump.fun metadata JSON.
 */
export function buildMetadata(
  name: string,
  symbol: string,
  description: string,
  imageUri: string
) {
  return {
    name,
    symbol,
    description,
    image: imageUri,
    show_name: true,
    created_on: 'pump.fun',
  };
}

/**
 * Upload token image + metadata to IPFS via Pinata.
 * Returns both IPFS URIs.
 */
export async function uploadToIPFS(
  imageBuffer: Buffer,
  name: string,
  symbol: string,
  description: string,
  config: PinataConfig
): Promise<UploadResult> {
  // Upload image
  const imageUri = await pinataUpload(
    imageBuffer,
    `${symbol}-logo.png`,
    config.pinataJwt
  );

  // Build and upload metadata
  const metadata = buildMetadata(name, symbol, description, imageUri);
  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
  
  const metadataUri = await pinataUpload(
    metadataBuffer,
    `${symbol}-metadata.json`,
    config.pinataJwt
  );

  return { imageUri, metadataUri };
}

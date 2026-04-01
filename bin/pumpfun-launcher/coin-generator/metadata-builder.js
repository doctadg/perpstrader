"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMetadata = buildMetadata;
exports.uploadToIPFS = uploadToIPFS;
/**
 * Upload a file to IPFS via Pinata.
 */
async function pinataUpload(data, filename, jwt) {
    const FormData = await Promise.resolve().then(() => __importStar(require('form-data')));
    const form = new FormData.default || FormData();
    form.append('file', data, { filename });
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${jwt}`,
            ...form.getHeaders(),
        },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pinata upload failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    return `ipfs://${json.IpfsHash}`;
}
/**
 * Build pump.fun metadata JSON.
 */
function buildMetadata(name, symbol, description, imageUri) {
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
async function uploadToIPFS(imageBuffer, name, symbol, description, config) {
    // Upload image
    const imageUri = await pinataUpload(imageBuffer, `${symbol}-logo.png`, config.pinataJwt);
    // Build and upload metadata
    const metadata = buildMetadata(name, symbol, description, imageUri);
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
    const metadataUri = await pinataUpload(metadataBuffer, `${symbol}-metadata.json`, config.pinataJwt);
    return { imageUri, metadataUri };
}
//# sourceMappingURL=metadata-builder.js.map
// lib/pinata.ts
import { encryptJSON, EncryptedPayload } from './crypto';

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

async function pinJSON(obj: unknown, filename = 'data.json') {
  const jwt = process.env.PINATA_JWT!;
  if (!jwt) throw new Error('Missing PINATA_JWT');

  const res = await fetch(PINATA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: filename },
      pinataContent: obj,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pinata error: ${res.status} ${t}`);
  }
  const json = await res.json();
  return json.IpfsHash as string; // "bafy..."
}

/** 平文を暗号化し、暗号文コンテナをIPFSへPinする */
export async function pinEncryptedJSON(plaintext: unknown, filename = 'enc.json') {
  const enc: EncryptedPayload = encryptJSON(plaintext);
  // 保存されるのは暗号文＋メタデータのみ（平文は保存しない）
  const container = { __type: 'enc+json', ...enc };
  return pinJSON(container, filename);
}

/** 互換：平文をそのままPin（必要なら残す） */
export async function pinJSONToIPFS(obj: unknown, filename = 'data.json') {
  return pinJSON(obj, filename);
}


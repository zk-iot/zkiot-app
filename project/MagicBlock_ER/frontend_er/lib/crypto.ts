// lib/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export type EncryptedPayload = {
  v: number;              // schema version
  alg: 'AES-256-GCM';
  iv_b64: string;         // 12 bytes
  tag_b64: string;        // 16 bytes (auth tag)
  ct_b64: string;         // ciphertext
};

function getKey(): Buffer {
  const b64 = process.env.DATA_ENC_KEY_B64;
  if (!b64) throw new Error('Missing DATA_ENC_KEY_B64 (base64 32 bytes)');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error(`DATA_ENC_KEY_B64 must be 32 bytes (got ${key.length})`);
  return key;
}

export function encryptJSON(obj: unknown): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12); // GCM推奨12B
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'AES-256-GCM',
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ct_b64: ct.toString('base64'),
  };
}

export function decryptJSON<T = unknown>(enc: EncryptedPayload): T {
  const key = getKey();
  if (enc.alg !== 'AES-256-GCM') throw new Error('Unsupported algorithm');
  const iv = Buffer.from(enc.iv_b64, 'base64');
  const tag = Buffer.from(enc.tag_b64, 'base64');
  const ct = Buffer.from(enc.ct_b64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}

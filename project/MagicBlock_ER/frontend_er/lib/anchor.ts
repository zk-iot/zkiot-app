// lib/anchor.ts
import { createHash } from 'crypto';

/**
 * Anchorのinstruction discriminator:
 * sha256("global:<ix_name>") の先頭8バイト
 */
export function ixDiscriminator(ixName: string): Buffer {
  const preimage = `global:${ixName}`;
  const h = createHash('sha256').update(preimage).digest();
  return h.subarray(0, 8);
}

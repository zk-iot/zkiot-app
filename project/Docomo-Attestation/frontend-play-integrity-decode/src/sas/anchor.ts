import { createHash } from "crypto";

export type SasPayload = {
  schema: string;
  subject: string; // wallet pubkey
  data: {
    pkg: string;
    verdicts: { app: string; device: string[] };
    ts: number;
    nonce_hash: string;
    jws_hash: string;
  };
  meta?: Record<string, any>;
};

export function canonicalJson(obj: any): string {
  const walk = (x: any): any => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      return Object.keys(x).sort().reduce((acc, k) => {
        acc[k] = walk(x[k]);
        return acc;
      }, {} as any);
    }
    return x;
  };
  return JSON.stringify(walk(obj));
}

export function sha256Hex(input: string | Buffer): string {
  return "0x" + createHash("sha256").update(input).digest("hex");
}

/** オンチェーンに刻む最小アンカー（JSON文字列 & そのオブジェクト） */
export function buildAnchor(sp: SasPayload) {
  const full = canonicalJson(sp);
  const fullHash = sha256Hex(full);

  const anchor = {
    v: 1,
    schema: sp.schema,
    subject: sp.subject,
    data: {
      pkg: sp.data.pkg,
      app: sp.data.verdicts.app,
      dev: sp.data.verdicts.device,
      ts: sp.data.ts,
      nh: sp.data.nonce_hash,
      jh: sp.data.jws_hash,
    },
    h: fullHash,
  };

  const text = canonicalJson(anchor);
  if (Buffer.byteLength(text, "utf8") > 900) throw new Error("anchor too large");
  return { anchor, text };
}

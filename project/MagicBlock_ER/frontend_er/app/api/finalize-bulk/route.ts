import { NextRequest, NextResponse } from 'next/server';
import { pinEncryptedJSON } from '@/lib/pinata';
import { calcWindowRoot, Reading } from '@/lib/merkle';

type Body = {
  devicePubkey: string;
  checkpointPubkey: string;
  readings: Reading[];
  chunkSize?: number;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { devicePubkey, checkpointPubkey, readings, chunkSize = 128 } = (await req.json()) as Body;
    if (!devicePubkey || !checkpointPubkey) return NextResponse.json({ ok: false, error: 'devicePubkey / checkpointPubkey is required' }, { status: 400 });
    if (!Array.isArray(readings) || readings.length === 0) return NextResponse.json({ ok: false, error: 'readings must be a non-empty array' }, { status: 400 });
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) return NextResponse.json({ ok: false, error: 'chunkSize must be > 0' }, { status: 400 });

    const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || 'http://localhost:3000';
    const commitURL = new URL('/api/commit', origin).toString();

    const chunks = chunkArray(readings, chunkSize);
    const results: any[] = [];
    const t0 = Date.now();

    for (let i = 0; i < chunks.length; i++) {
      const batch = chunks[i];

      // 1) Merkle root（平文）
      const { rootHex } = calcWindowRoot(batch);

      // 2) 暗号化してIPFSに保存（暗号文のCIDを得る）
      const cid = await pinEncryptedJSON(
        { batchIndex: i, count: batch.length, readings: batch },
        `batch-${i}.enc.json`
      );

      // 3) /api/commit 呼び出し（MemoにCID:暗号文CID）
      const commitRes = await fetch(commitURL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ devicePubkey, checkpointPubkey, merkleRootHex: rootHex, cid }),
        cache: 'no-store',
      });

      const commitText = await commitRes.text();
      let commitJson: any;
      try { commitJson = JSON.parse(commitText); }
      catch { commitJson = { ok: false, status: commitRes.status, body: commitText }; }

      if (!commitRes.ok || commitJson?.ok === false) {
        results.push({ batch: i + 1, count: batch.length, cid, rootHex, error: commitJson?.error ?? `commit failed (HTTP ${commitRes.status})`, raw: commitJson });
        continue;
        }
      results.push({ batch: i + 1, count: batch.length, cid, rootHex, signature: commitJson.signature, routedVia: commitJson.routedVia, authority: commitJson.authority });
    }

    const t1 = Date.now();
    return NextResponse.json({ ok: true, total: readings.length, chunkSize, batches: results.length, elapsedMs: t1 - t0, results });
  } catch (e: any) {
    console.error('finalize-bulk error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}


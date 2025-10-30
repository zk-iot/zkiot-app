import { NextRequest, NextResponse } from 'next/server';
import { pinJSONToIPFS } from '@/lib/pinata';
import { calcWindowRoot, Reading } from '@/lib/merkle';

type Body = {
  devicePubkey: string;
  checkpointPubkey: string;
  readings: Reading[];   // 512件など
  chunkSize?: number;    // 既定 128
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { devicePubkey, checkpointPubkey, readings, chunkSize = 128 } = (await req.json()) as Body;

    if (!devicePubkey || !checkpointPubkey) {
      return NextResponse.json({ ok: false, error: 'devicePubkey / checkpointPubkey is required' }, { status: 400 });
    }
    if (!Array.isArray(readings) || readings.length === 0) {
      return NextResponse.json({ ok: false, error: 'readings must be a non-empty array' }, { status: 400 });
    }
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      return NextResponse.json({ ok: false, error: 'chunkSize must be > 0' }, { status: 400 });
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      req.nextUrl.origin ||
      'http://localhost:3000';
    const commitURL = new URL('/api/commit', origin).toString();

    const chunks = chunkArray(readings, chunkSize);
    const results: any[] = [];
    const t0 = Date.now();

    for (let i = 0; i < chunks.length; i++) {
      const batch = chunks[i];

      // 1) IPFSにこのバッチだけアップロード
      const cid = await pinJSONToIPFS(
        { batchIndex: i, count: batch.length, readings: batch },
        `batch-${i}.json`
      );

      // 2) Merkle root 計算
      const { rootHex } = calcWindowRoot(batch);

      // 3) /api/commit を呼んでオンチェーン確定（MemoでCIDも残す）
      const commitRes = await fetch(commitURL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          devicePubkey,
          checkpointPubkey,
          merkleRootHex: rootHex,
          cid,
        }),
        cache: 'no-store',
      });

      const commitText = await commitRes.text();
      let commitJson: any;
      try {
        commitJson = JSON.parse(commitText);
      } catch {
        commitJson = { ok: false, status: commitRes.status, body: commitText };
      }

      if (!commitRes.ok || commitJson?.ok === false) {
        // 1件失敗しても全体を返すため、結果にエラーを積む
        results.push({
          batch: i + 1,
          count: batch.length,
          cid,
          rootHex,
          error: commitJson?.error ?? `commit failed (HTTP ${commitRes.status})`,
          raw: commitJson,
        });
        continue;
      }

      results.push({
        batch: i + 1,
        count: batch.length,
        cid,
        rootHex,
        signature: commitJson.signature,
        routedVia: commitJson.routedVia,
        authority: commitJson.authority,
      });
    }

    const t1 = Date.now();

    return NextResponse.json({
      ok: true,
      total: readings.length,
      chunkSize,
      batches: results.length,
      elapsedMs: t1 - t0,
      results,
    });
  } catch (e: any) {
    console.error('finalize-bulk error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

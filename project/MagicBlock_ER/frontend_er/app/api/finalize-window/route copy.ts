import { NextRequest, NextResponse } from 'next/server';
import { pinJSONToIPFS } from '@/lib/pinata';
import { calcWindowRoot, Reading } from '@/lib/merkle';

type Body = {
  windowIndex: number;
  devicePubkey: string;
  checkpointPubkey: string;
  readings: Reading[];
};

export async function POST(req: NextRequest) {
  try {
    const { windowIndex, devicePubkey, checkpointPubkey, readings }: Body = await req.json();

    // 1) IPFS（Pinata）
    const cid = await pinJSONToIPFS({ windowIndex, readings }, `window-${windowIndex}.json`);

    // 2) Merkle
    const { rootHex } = calcWindowRoot(readings as any);

    // 3) commit を同一オリジンの絶対URLで叩く
    //    - 開発: http://localhost:3000
    //    - 本番: req.nextUrl.origin（または NEXT_PUBLIC_APP_ORIGIN）
    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      req.nextUrl.origin || // Next.js Route Handler から取得可
      'http://localhost:3000';

    const commitURL = new URL('/api/commit', origin).toString();

    const commitRes = await fetch(commitURL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // !! 二重の { { ... を修正
      body: JSON.stringify({ devicePubkey, checkpointPubkey, merkleRootHex: rootHex, cid }),
      cache: 'no-store',
    });

    const commitText = await commitRes.text();
    let commitJson: any;
    try { commitJson = JSON.parse(commitText); }
    catch { commitJson = { ok: false, status: commitRes.status, body: commitText }; }

    if (!commitRes.ok || commitJson?.ok === false) {
      const msg = commitJson?.error ?? `commit failed (HTTP ${commitRes.status})`;
      return NextResponse.json({ ok: false, cid, rootHex, error: msg, raw: commitJson }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cid, rootHex, tx: commitJson });
  } catch (e: any) {
    console.error('finalize-window error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}



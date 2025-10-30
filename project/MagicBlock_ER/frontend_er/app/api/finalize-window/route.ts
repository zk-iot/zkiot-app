import { NextRequest, NextResponse } from 'next/server';
import { pinEncryptedJSON } from '@/lib/pinata';
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

    // 1) Merkle root は平文に対して計算（検証可能性を維持）
    const { rootHex } = calcWindowRoot(readings as any);

    // 2) 平文 readngs をサーバ側で暗号化 → IPFSへ
    const cid = await pinEncryptedJSON(
      { windowIndex, readings },           // 平文（サーバ内）→ encrypt → 暗号文JSONをPin
      `window-${windowIndex}.enc.json`
    );

    // 3) 既存の /api/commit へ（CIDは暗号文のCID）
    const commitRes = await fetch(`${process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin}/api/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ devicePubkey, checkpointPubkey, merkleRootHex: rootHex, cid }),
      cache: 'no-store',
    });

    const commitText = await commitRes.text();
    let commitJson: any;
    try { commitJson = JSON.parse(commitText); }
    catch { commitJson = { ok: false, status: commitRes.status, body: commitText }; }

    return NextResponse.json({ ok: true, cid, rootHex, tx: commitJson });
  } catch (e: any) {
    console.error('finalize-window error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}




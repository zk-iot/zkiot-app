// app/api/demo-128x3/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { sendMagicTransaction } from 'magic-router-sdk'; // ← ここがポイント
import { ixDiscriminator } from '@/lib/anchor';
import { pinJSONToIPFS } from '@/lib/pinata';
import { calcWindowRoot, Reading } from '@/lib/merkle';

type Body = {
  devicePubkey?: string;
  checkpointPubkey?: string;
  countPerBatch?: number; // 既定 128
  batches?: number;       // 既定 3
};

function loadSigner(): Keypair {
  const secB58 = process.env.SOLANA_SECRET_BASE58;
  const secArr = process.env.SOLANA_SECRET_KEY;
  if (secB58) {
    const u8 = bs58.decode(secB58);
    // 64Bちょうどでない場合は末尾64Bを採用（ハッカソン簡易対応）
    const trimmed = u8.length === 64 ? u8 : u8.slice(u8.length - 64);
    return Keypair.fromSecretKey(trimmed);
  }
  if (secArr) {
    const u8 = Uint8Array.from(JSON.parse(secArr));
    return u8.length === 64 ? Keypair.fromSecretKey(u8) : Keypair.fromSeed(u8);
  }
  throw new Error('Missing SOLANA_SECRET_BASE58 or SOLANA_SECRET_KEY');
}

function buildCommitIx(
  programId: PublicKey,
  device: PublicKey,
  checkpoint: PublicKey,
  rootHex: string,
  authority: PublicKey,
) {
  const root = Buffer.from(rootHex, 'hex');
  if (root.length !== 32) throw new Error('merkleRoot must be 32 bytes (hex)');
  const keys = [
    { pubkey: device,     isSigner: false, isWritable: false },
    { pubkey: checkpoint, isSigner: false, isWritable: true  },
    { pubkey: authority,  isSigner: true,  isWritable: false },
  ];
  const data = Buffer.concat([ixDiscriminator('commit_checkpoint'), root]);
  return new TransactionInstruction({ programId, keys, data });
}

function buildMemoIx(cid?: string) {
  return new TransactionInstruction({
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    keys: [],
    data: Buffer.from(`CID:${cid ?? ''}`),
  });
}

function genReadings(n: number, startTs = Math.floor(Date.now() / 1000)): Reading[] {
  const arr: Reading[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      ts: startTs + i,
      t_c_x100: 3400 + Math.floor(Math.random() * 250), // 34.00〜36.49℃
      rh_x100: 4500 + Math.floor(Math.random() * 1500), // 45〜60%
      p_pa: 100000 + Math.floor(Math.random() * 500),
      gas: 150 + Math.floor(Math.random() * 30),
    });
  }
  return arr;
}

export async function POST(req: NextRequest) {
  try {
    const {
      devicePubkey = process.env.NEXT_PUBLIC_DEVICE_PUBKEY!,
      checkpointPubkey = process.env.NEXT_PUBLIC_CHECKPOINT_PUBKEY!,
      countPerBatch = 128,
      batches = 3,
    }: Body = await req.json().catch(() => ({}));

    // 接続先は Magic Router（なければ devnet RPC でも動く）
    const rpc = process.env.MAGICBLOCK_ROUTER_URL || process.env.SOLANA_CLUSTER_URL || 'https://devnet-router.magicblock.app';
    const connection = new Connection(rpc, 'confirmed');

    const programId = new PublicKey(process.env.PROGRAM_ID!);
    const device = new PublicKey(devicePubkey);
    const checkpoint = new PublicKey(checkpointPubkey);
    const signer = loadSigner();

    const results: any[] = [];
    const t0 = Date.now();

    for (let i = 0; i < batches; i++) {
      // 1) データ生成（128件）
      const readings = genReadings(countPerBatch, Math.floor(Date.now() / 1000) + i * countPerBatch);

      // 2) IPFSアップロード
      const cid = await pinJSONToIPFS({ windowIndex: i, count: readings.length, readings }, `window-${i}.json`);

      // 3) Merkle root
      const { rootHex } = calcWindowRoot(readings);

      // 4) Tx (Memo + commit_checkpoint)
      const memoIx = buildMemoIx(cid);
      const commitIx = buildCommitIx(programId, device, checkpoint, rootHex, signer.publicKey);

      const tx = new Transaction().add(memoIx, commitIx);
      tx.feePayer = signer.publicKey;

      // 5) Magic Router SDK で送信（内部でルーティング & ブロックハッシュ解決）
      const sig = await sendMagicTransaction(connection, tx, [signer]);

      results.push({ batch: i + 1, count: countPerBatch, cid, rootHex, signature: sig, routedVia: rpc });
    }

    const t1 = Date.now();
    return NextResponse.json({
      ok: true,
      totalBatches: batches,
      perBatch: countPerBatch,
      elapsedMs: t1 - t0,
      results,
    });
  } catch (e: any) {
    console.error('demo-128x3 error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}


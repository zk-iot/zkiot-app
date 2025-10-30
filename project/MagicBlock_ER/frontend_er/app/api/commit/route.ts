// app/api/commit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { ixDiscriminator } from '@/lib/anchor';

/**
 * リクエストBody
 */
type Body = {
  devicePubkey: string;
  checkpointPubkey: string;
  merkleRootHex: string; // 32B hex
  cid?: string;
};

/**
 * Keypair ローダー
 * - SOLANA_SECRET_BASE58（今回これ）を最優先
 * - 次に SOLANA_SECRET_KEY（64/32 要素のJSON配列）
 * - 次に SOLANA_SECRET_SEED（32要素のJSON配列）
 * - 68Bなど「余分」がついた場合は 末尾64B → 先頭64B の順でフォールバック
 */
function loadSignerFromEnv(): Keypair {
  const secB58 = process.env.SOLANA_SECRET_BASE58;
  const secArr = process.env.SOLANA_SECRET_KEY; // JSON配列 [..64] or [..32]
  const seedArr = process.env.SOLANA_SECRET_SEED; // JSON配列 [..32]

  const tryFromU8 = (u8: Uint8Array): Keypair => {
    if (u8.length === 64) return Keypair.fromSecretKey(u8);
    if (u8.length === 32) return Keypair.fromSeed(u8);

    // ハッカソン向けフォールバック（例: 68Bなど）
    if (u8.length > 64) {
      // 末尾64B
      try {
        const tail = u8.slice(u8.length - 64);
        const kp = Keypair.fromSecretKey(tail);
        console.warn(`[commit] secret key len=${u8.length} → use tail64, pubkey=${kp.publicKey.toBase58()}`);
        return kp;
      } catch {}
      // 先頭64B
      try {
        const head = u8.slice(0, 64);
        const kp2 = Keypair.fromSecretKey(head);
        console.warn(`[commit] secret key len=${u8.length} → use head64, pubkey=${kp2.publicKey.toBase58()}`);
        return kp2;
      } catch {}
    }

    throw new Error(`Unsupported key length: ${u8.length} (need 64 secretKey or 32 seed)`);
  };

  // 1) base58 優先（今回の捨て鍵はこちら）
  if (secB58) {
    const u8 = bs58.decode(secB58);
    return tryFromU8(u8);
  }

  // 2) 64/32 の JSON 配列
  if (secArr) {
    const arr: number[] = JSON.parse(secArr);
    return tryFromU8(Uint8Array.from(arr));
  }

  // 3) 32byte seed の JSON 配列
  if (seedArr) {
    const arr: number[] = JSON.parse(seedArr);
    return tryFromU8(Uint8Array.from(arr));
  }

  throw new Error('Missing SOLANA_SECRET_BASE58 or SOLANA_SECRET_KEY/SEED');
}

export async function POST(req: NextRequest) {
  try {
    const rpcUrl = process.env.SOLANA_CLUSTER_URL || process.env.MAGICBLOCK_ROUTER_URL;
    const programIdStr = process.env.PROGRAM_ID;
    if (!rpcUrl) throw new Error('Missing SOLANA_CLUSTER_URL or MAGICBLOCK_ROUTER_URL');
    if (!programIdStr) throw new Error('Missing PROGRAM_ID');

    const { devicePubkey, checkpointPubkey, merkleRootHex, cid }: Body = await req.json();

    // --- 入力検証 ---
    if (!devicePubkey || !checkpointPubkey) throw new Error('devicePubkey / checkpointPubkey required');
    if (!merkleRootHex || merkleRootHex.length !== 64) throw new Error('merkleRootHex must be 32-byte hex (64 chars)');

    // --- 接続 & 署名者 ---
    const conn = new Connection(rpcUrl);
    const signer = loadSignerFromEnv();

    // --- Ixs 作成 ---
    const programId = new PublicKey(programIdStr);
    const device = new PublicKey(devicePubkey);
    const checkpoint = new PublicKey(checkpointPubkey);

    const root = Buffer.from(merkleRootHex, 'hex');
    if (root.length !== 32) throw new Error('merkleRoot must be 32 bytes hex');

    // (任意) CIDをメモで残す（プログラム変更ゼロでCIDをTxに紐付け）
    const memoIx = new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [],
      data: Buffer.from(`CID:${cid ?? ''}`),
    });

    // iaq_er::commit_checkpoint(device, checkpoint, authority) + root
    // Anchorのアカウント順に合わせる：device, checkpoint, authority
    const keys = [
      { pubkey: device, isSigner: false, isWritable: false },
      { pubkey: checkpoint, isSigner: false, isWritable: true },
      { pubkey: signer.publicKey, isSigner: true, isWritable: false }, // authority
    ];
    const data = Buffer.concat([ixDiscriminator('commit_checkpoint'), root]);
    const commitIx = new TransactionInstruction({ programId, keys, data });

    const tx = new Transaction().add(memoIx, commitIx);
    tx.feePayer = signer.publicKey;

    const sig = await sendAndConfirmTransaction(conn, tx, [signer], { commitment: 'confirmed' });

    return NextResponse.json({ ok: true, signature: sig, routedVia: rpcUrl, authority: signer.publicKey.toBase58() });
  } catch (e: any) {
    console.error('commit error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

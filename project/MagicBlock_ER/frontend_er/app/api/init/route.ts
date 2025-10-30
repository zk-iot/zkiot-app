// app/api/init/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, Keypair, PublicKey, Transaction, SystemProgram, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

function ix8(name: string): Buffer {
  const h = crypto.createHash('sha256').update(`global:${name}`).digest();
  return h.subarray(0, 8);
}

function loadSigner(): Keypair {
  const b58 = process.env.SOLANA_SECRET_BASE58;
  const arr = process.env.SOLANA_SECRET_KEY;
  if (b58) return Keypair.fromSecretKey(bs58.decode(b58));
  if (arr)  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(arr)));
  throw new Error('Missing SOLANA_SECRET_BASE58 or SOLANA_SECRET_KEY');
}

function u32le(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
function i32le(n: number) { const b = Buffer.alloc(4); b.writeInt32LE(n | 0);  return b; }

// AnchorのInitializeDevice引数: ThresholdConfig { max_co2_ppm: u32, t_min_c_x100: i32, t_max_c_x100: i32, rh_max_x100: u32 }
function buildInitializeData(cfg: {max_co2_ppm:number; t_min_c_x100:number; t_max_c_x100:number; rh_max_x100:number}) {
  return Buffer.concat([
    ix8('initialize_device'),
    u32le(cfg.max_co2_ppm),
    i32le(cfg.t_min_c_x100),
    i32le(cfg.t_max_c_x100),
    u32le(cfg.rh_max_x100),
  ]);
}

export async function POST(_req: NextRequest) {
  try {
    const rpcUrl = process.env.SOLANA_CLUSTER_URL!;
    const conn = new Connection(rpcUrl);
    const payer = loadSigner();

    // PDA計算（authority = payer）
    const [devicePda, deviceBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('device'), payer.publicKey.toBuffer()],
      PROGRAM_ID
    );
    const [feedPda, feedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('feed'), devicePda.toBuffer()],
      PROGRAM_ID
    );
    const [scorePda, scoreBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('score'), devicePda.toBuffer()],
      PROGRAM_ID
    );
    const [cpPda, cpBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('cp'), devicePda.toBuffer()],
      PROGRAM_ID
    );

    // しきい値（例：温度 0.00～37.00℃, RH ≤ 85% (= 8500), CO2 ≤ 1000ppm）
    const cfg = { max_co2_ppm: 1000, t_min_c_x100: 0, t_max_c_x100: 3700, rh_max_x100: 8500 };
    const data = buildInitializeData(cfg);

    // accounts: authority, device(init), feed(init), score(init), checkpoint(init), system_program
    const keys = [
      { pubkey: payer.publicKey, isSigner: true,  isWritable: true },  // authority & payer
      { pubkey: devicePda,       isSigner: false, isWritable: true },  // device
      { pubkey: feedPda,         isSigner: false, isWritable: true },  // feed
      { pubkey: scorePda,        isSigner: false, isWritable: true },  // score
      { pubkey: cpPda,           isSigner: false, isWritable: true },  // checkpoint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;

    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' });

    return NextResponse.json({
      ok: true,
      signature: sig,
      authority: payer.publicKey.toBase58(),
      devicePda: devicePda.toBase58(),
      feedPda: feedPda.toBase58(),
      scorePda: scorePda.toBase58(),
      checkpointPda: cpPda.toBase58(),
      bumps: { deviceBump, feedBump, scoreBump, cpBump },
      cfg,
    });
  } catch (e: any) {
    console.error('init error', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

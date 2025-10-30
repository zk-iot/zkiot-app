'use client';

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';

// ===============================
// 設定（必要に応じて変更）
// ===============================
export const PROGRAM_ID = new PublicKey('DMStNBL5mqqdzscVnFXnZKia1Bd1sE8mB1sjvRkKipBD');
export const CLUSTER_URL = 'https://api.devnet.solana.com';

// IDL（tsconfig: "resolveJsonModule": true）
import RAW_IDL from '@/lib/anchor/idl/counter.json';
export const IDL = RAW_IDL as unknown as Idl;

// ===============================
// Wallet ユーティリティ
// ===============================
export type WalletLike = {
  address?: string;                               // Privy v3 は address を持つ
  publicKey?: PublicKey | { toBase58(): string }; // Phantom 等
  signTransaction?: (tx: any) => Promise<any>;
  signAllTransactions?: (txs: any[]) => Promise<any[]>;
};

// Privy/Phantom などを Anchor.Wallet に薄ラップ
export function toAnchorWalletOrNull(w?: WalletLike | null): anchor.Wallet | null {
  if (!w) return null;

  let pk: PublicKey | null = null;
  if (w.publicKey instanceof PublicKey) pk = w.publicKey;
  else if (w.publicKey && 'toBase58' in w.publicKey) pk = new PublicKey(w.publicKey.toBase58());
  else if (w.address) pk = new PublicKey(w.address);

  if (!pk || !w.signTransaction || !w.signAllTransactions) return null;

  return {
    publicKey: pk,
    signTransaction: w.signTransaction.bind(w),
    signAllTransactions: w.signAllTransactions.bind(w),
  } as unknown as anchor.Wallet;
}

/** window.solana(Phantom) から Anchor.Wallet を作る（無ければ null） */
export async function phantomWalletOrNull(): Promise<anchor.Wallet | null> {
  if (typeof window === 'undefined') return null;
  // @ts-ignore
  const ph = window?.solana;
  if (!ph) return null;
  try {
    // Phantom 側に未接続なら接続要求
    if (!ph.isConnected) {
      await ph.connect?.();
    }
    const pk =
      ph.publicKey instanceof PublicKey
        ? ph.publicKey
        : ph.publicKey?.toBase58
        ? new PublicKey(ph.publicKey.toBase58())
        : null;

    if (!pk || !ph.signTransaction || !ph.signAllTransactions) return null;

    const aw: anchor.Wallet = {
      publicKey: pk,
      signTransaction: ph.signTransaction.bind(ph),
      signAllTransactions: ph.signAllTransactions.bind(ph),
    } as unknown as anchor.Wallet;

    return aw;
  } catch {
    return null;
  }
}

// ===============================
// Provider / Program
// ===============================
export function getConnection(): Connection {
  return new Connection(CLUSTER_URL, 'confirmed');
}

/** 読み取り専用 Provider（内部では本物の Keypair を使うので _bn エラーが出ない） */
export function getReadOnlyProvider(): anchor.AnchorProvider {
  const connection = getConnection();

  // ダミー鍵（公開鍵だけ実質使用）
  const kp = Keypair.generate();

  // Anchor の Wallet shape + NodeWallet の payer を満たす
  const dummyWallet: anchor.Wallet & { payer: Keypair } = {
    publicKey: kp.publicKey,
    payer: kp,
    // 読み取り専用なので no-op 実装でOK
    async signTransaction<T>(tx: T): Promise<T> { return tx; },
    async signAllTransactions<T>(txs: T[]): Promise<T[]> { return txs; },
  };

  return new anchor.AnchorProvider(connection, dummyWallet, {
    commitment: 'confirmed',
  });
}


/** 署名可能 Provider */
export function getSignerProvider(wallet: anchor.Wallet): anchor.AnchorProvider {
  const connection = getConnection();
  return new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

/** Program 生成（v0.30+ / v0.29 両対応） */
function makeProgram(idl: any, programId: PublicKey, provider: anchor.AnchorProvider): anchor.Program {
  const ProgramCtor: any = (anchor as any).Program;
  try {
    // 新: (idl, programId, provider)
    return new ProgramCtor(idl, programId, provider) as anchor.Program;
  } catch {
    // 旧: (idl, provider, programId)
    return new ProgramCtor(idl, provider as any, programId) as anchor.Program;
  }
}

// ===============================
// Workspaces
// ===============================

/** 読み取り専用 Workspace（常に取得成功） */
export function getReadWorkspace() {
  const provider = getReadOnlyProvider();
  anchor.setProvider(provider);
  const program = makeProgram(IDL, PROGRAM_ID, provider);
  return { connection: provider.connection, provider, program, PROGRAM_ID };
}

/**
 * 署名可能 Workspace（優先順: Privy wallet → Phantom）
 * どちらも署名不可なら null
 */
export async function getSignerWorkspace(privyLike?: WalletLike | null) {
  // 1) Privy 由来で signTransaction/signAllTransactions を持つ場合
  const fromPrivy = toAnchorWalletOrNull(privyLike);
  if (fromPrivy) {
    const provider = getSignerProvider(fromPrivy);
    anchor.setProvider(provider);
    const program = makeProgram(IDL, PROGRAM_ID, provider);
    return { connection: provider.connection, provider, program, PROGRAM_ID };
  }

  // 2) Phantom にフォールバック
  const phantom = await phantomWalletOrNull();
  if (phantom) {
    const provider = getSignerProvider(phantom);
    anchor.setProvider(provider);
    const program = makeProgram(IDL, PROGRAM_ID, provider);
    return { connection: provider.connection, provider, program, PROGRAM_ID };
  }

  // 3) どちらもダメ
  return null;
}





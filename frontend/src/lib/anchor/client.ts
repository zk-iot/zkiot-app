"use client";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import RAW_IDL from "./idl/counter.json";
import type { Idl } from "@coral-xyz/anchor";

// ===== Cluster / Program =====
export const CLUSTER_URL = "https://api.devnet.solana.com";

// IDL から Program ID を取得（address または metadata.address）
const IDL_ADDRESS =
  (RAW_IDL as any).address ?? (RAW_IDL as any)?.metadata?.address;
if (!IDL_ADDRESS) {
  throw new Error(
    "IDL に program address がありません。Playground から正しい IDL を保存してください。"
  );
}
export const PROGRAM_ID = new PublicKey(IDL_ADDRESS);
export const IDL = RAW_IDL as unknown as Idl;

// ===== Connection =====
export function getConnection(): Connection {
  return new Connection(CLUSTER_URL, "confirmed");
}

// ===== Wallet helpers =====
export type WalletLike = {
  address?: string;
  publicKey?: PublicKey | { toBase58(): string };
  signTransaction?: (tx: any) => Promise<any>;
  signAllTransactions?: (txs: any[]) => Promise<any[]>;
};

// Privy/Phantom などを Anchor.Wallet へ薄ラップ（署名が両方揃っていないと null）
export function toAnchorWalletOrNull(
  w?: WalletLike | null
): anchor.Wallet | null {
  if (!w) return null;
  let pk: PublicKey | null = null;
  if (w.publicKey instanceof PublicKey) pk = w.publicKey;
  else if (w.publicKey && "toBase58" in w.publicKey)
    pk = new PublicKey(w.publicKey.toBase58());
  else if (w.address) pk = new PublicKey(w.address);
  if (!pk || !w.signTransaction || !w.signAllTransactions) return null;

  return {
    publicKey: pk,
    signTransaction: w.signTransaction.bind(w),
    signAllTransactions: w.signAllTransactions.bind(w),
  } as unknown as anchor.Wallet;
}

// Phantom から Anchor.Wallet を作る
export async function phantomWalletOrNull(): Promise<anchor.Wallet | null> {
  if (typeof window === "undefined") return null;
  // @ts-ignore
  const ph = window?.solana;
  if (!ph) return null;
  try {
    if (!ph.isConnected) await ph.connect?.();
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

// ===== Providers / Program =====

// 読み取り専用 Provider（ダミー wallet を自前実装）
export function getReadOnlyProvider(): anchor.AnchorProvider {
  const connection = getConnection();
  const kp = Keypair.generate();
  const dummyWallet: anchor.Wallet & { payer: Keypair } = {
    publicKey: kp.publicKey,
    payer: kp,
    async signTransaction<T>(tx: T): Promise<T> {
      return tx;
    },
    async signAllTransactions<T>(txs: T[]): Promise<T[]> {
      return txs;
    },
  };
  return new anchor.AnchorProvider(connection, dummyWallet, {
    commitment: "confirmed",
  });
}

// 署名可能 Provider
export function getSignerProvider(
  wallet: anchor.Wallet
): anchor.AnchorProvider {
  const connection = getConnection();
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

// Program 生成（v0.29/v0.30 互換）
function makeProgram(
  idl: any,
  programId: PublicKey,
  provider: anchor.AnchorProvider
): anchor.Program {
  const ProgramCtor: any = (anchor as any).Program;
  try {
    return new ProgramCtor(idl, programId, provider) as anchor.Program;
  } catch {
    return new ProgramCtor(idl, provider as any, programId) as anchor.Program;
  }
}

// ===== Workspaces =====
export function getReadWorkspace() {
  const provider = getReadOnlyProvider();
  anchor.setProvider(provider);
  const program = makeProgram(IDL, PROGRAM_ID, provider);
  return { connection: provider.connection, provider, program, PROGRAM_ID };
}

// Privy → Phantom の順で署名可能 workspace を返す
export async function getSignerWorkspace(privyLike?: WalletLike | null) {
  const fromPrivy = toAnchorWalletOrNull(privyLike);
  if (fromPrivy) {
    const provider = getSignerProvider(fromPrivy);
    anchor.setProvider(provider);
    const program = makeProgram(IDL, PROGRAM_ID, provider);
    return { connection: provider.connection, provider, program, PROGRAM_ID };
  }
  const phantom = await phantomWalletOrNull();
  if (phantom) {
    const provider = getSignerProvider(phantom);
    anchor.setProvider(provider);
    const program = makeProgram(IDL, PROGRAM_ID, provider);
    return { connection: provider.connection, provider, program, PROGRAM_ID };
  }
  return null;
}





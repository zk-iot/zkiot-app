import "dotenv/config";
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { buildAnchor, SasPayload } from "./anchor";
import { createMemoInstruction } from "@solana/spl-memo";

export async function issueAttestation(sp: SasPayload) {
  const rpc = process.env.RPC_URL || "https://api.devnet.solana.com";
  const secret = process.env.ISSUER_SECRET;
  if (!secret) throw new Error("ISSUER_SECRET missing");

  const issuer = Keypair.fromSecretKey(bs58.decode(secret));
  const conn = new Connection(rpc, "confirmed");

  const { text, anchor } = buildAnchor(sp);

  // @solana/spl-memo でメモ命令を作成（v1 Memo program を参照）
  const ix = createMemoInstruction(text, []); // 第二引数に署名者を渡す必要はありません（MVP簡易）

  const tx = new Transaction().add(ix);
  tx.feePayer = issuer.publicKey;

  const sig = await sendAndConfirmTransaction(conn, tx, [issuer], {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return { txSig: sig, anchor, issuer: issuer.publicKey.toBase58() };
}


import { Connection } from "@solana/web3.js";

export async function fetchTxLogs(rpc: string, txSig: string) {
  const conn = new Connection(rpc, "confirmed");
  const tx = await conn.getTransaction(txSig, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error("tx not found");
  return tx.meta?.logMessages ?? [];
}

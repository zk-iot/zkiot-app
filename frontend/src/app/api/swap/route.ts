// app/api/swap/route.ts
import {
  Connection,
  Keypair,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

export async function POST() {
  if (!PRIVATE_KEY) {
    return new Response(JSON.stringify({ success: false, error: "PRIVATE_KEY not set" }), { status: 500 });
  }

  try {
    const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
    const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

    // Quote取得 (0.001 SOL)
    const quoteRes = await fetch(
      "https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50"
    );
    const quoteResponse = await quoteRes.json();

    const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
      }),
    });
    const { swapTransaction } = await swapRes.json();

    const transactionBuf = Buffer.from(swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    transaction.sign([wallet]);

    const latestBlockhash = await connection.getLatestBlockhash();
    const rawTx = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTx);

    await connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: txid,
    });

    return Response.json({
      success: true,
      txUrl: `https://solscan.io/tx/${txid}`,
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
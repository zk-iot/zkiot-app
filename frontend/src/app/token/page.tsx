"use client";

import { useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";

// === 各トークンの情報 ===
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const OSC_MINT = new PublicKey("EEiXbtiaSJasfKNih4UBcozFAjehMphnUVbpCtvuYqxk");
const OSC_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"); // Custom Token Program

declare global {
  interface Window {
    solana?: any;
  }
}

export default function Home() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [oscBalance, setOscBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getWalletInfo = async () => {
      try {
        const provider = window.solana;
        if (!provider?.isPhantom) {
          alert("Phantom Wallet is not installed.");
          setLoading(false);
          return;
        }

        // Connect to wallet
        const resp = await provider.connect();
        const pubKey = new PublicKey(resp.publicKey.toString());
        setPublicKey(pubKey.toBase58());

        // Connect to Solana via Helius (自身のAPIキーに差し替えてください)
        const heliusUrl = "https://mainnet.helius-rpc.com/?api-key=32ce7024-335d-4ffd-9d8e-2008cf29614f";
        const connection = new Connection(heliusUrl, "confirmed");

        // === SOL残高 ===
        const lamports = await connection.getBalance(pubKey);
        setSolBalance(lamports / 1e9);

        // === USDC残高（小数6桁） ===
        try {
          const usdcATA = await getAssociatedTokenAddress(USDC_MINT, pubKey);
          const usdcAccount = await getAccount(connection, usdcATA);
          setUsdcBalance(Number(usdcAccount.amount) / 1e6);
        } catch {
          setUsdcBalance(0);
        }

        // === OSC残高（小数9桁、Custom Token Program） ===
        try {
          const oscATA = await getAssociatedTokenAddress(
            OSC_MINT,
            pubKey,
            false,
            OSC_PROGRAM_ID
          );
          const oscAccount = await getAccount(
            connection,
            oscATA,
            undefined,
            OSC_PROGRAM_ID
          );
          setOscBalance(Number(oscAccount.amount) / 1e9);
        } catch (e) {
          console.warn("Failed to fetch OSC token:", e);
          setOscBalance(0);
        }

      } catch (error) {
        console.error("Error fetching wallet data:", error);
      } finally {
        setLoading(false);
      }
    };

    getWalletInfo();
  }, []);

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Wallet Balances</h1>

      {loading ? (
        <p>Connecting to wallet...</p>
      ) : publicKey ? (
        <div className="p-4 rounded-xl shadow-lg border space-y-3">
          <p className="text-sm break-all">Wallet: {publicKey}</p>
          <p className="text-lg font-medium">SOL: {solBalance?.toFixed(4)} SOL</p>
          <p className="text-lg font-medium">USDC: {usdcBalance?.toFixed(2)} USDC</p>
          <p className="text-lg font-medium">OSC: {oscBalance?.toFixed(4)} OpenSourceCity</p>
        </div>
      ) : (
        <p>Could not connect to Wallet.</p>
      )}
    </main>
  );
}







'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';

const TAG = '[SOL-DEMO]';

export default function SolDemoPage() {
  // ── Devnet 接続（環境変数があれば使用）
  const RPC_URL =
    process.env.NEXT_PUBLIC_RPC_URL ||
    clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_CLUSTER as any) || 'devnet');
  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), [RPC_URL]);

  // ── ブラウザ内だけで使う一時ウォレット
  const [wallet, setWallet] = useState<Keypair | null>(null);
  const [airdropped, setAirdropped] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState<'idle' | 'airdrop' | 'send'>('idle');
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bal, setBal] = useState<number | null>(null);

  // 初期化：一時キーを作成
  useEffect(() => {
    const kp = Keypair.generate();
    setWallet(kp);
    console.groupCollapsed(`${TAG} Boot`);
    console.log(`${TAG} RPC_URL=`, RPC_URL);
    console.log(`${TAG} tmp wallet=`, kp.publicKey.toBase58());
    console.groupEnd();
  }, [RPC_URL]);

  // 残高取得
  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      const lamports = await connection.getBalance(wallet.publicKey, 'confirmed');
      setBal(lamports / LAMPORTS_PER_SOL);
    } catch (e) {
      console.warn(`${TAG} getBalance ERR`, e);
    }
  }, [connection, wallet]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Airdrop → 1 SOL
  const doAirdrop = useCallback(async () => {
    if (!wallet) return;
    setErr(null);
    setLastTx(null);
    setBusy('airdrop');
    console.groupCollapsed(`${TAG} airdrop start`);
    try {
      console.log(`${TAG} request airdrop 1 SOL to`, wallet.publicKey.toBase58());
      const sig = await connection.requestAirdrop(wallet.publicKey, 1 * LAMPORTS_PER_SOL);
      console.log(`${TAG} sig=`, sig);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`${TAG} airdrop confirmed`);
      setAirdropped(true);
      await refreshBalance();
      setLastTx(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    } catch (e: any) {
      console.error(`${TAG} airdrop ERR:`, e);
      setErr(e.message || String(e));
    } finally {
      console.groupEnd();
      setBusy('idle');
    }
  }, [connection, wallet, refreshBalance]);

  // Send SOL（0.01 SOL）
  const sendSol = useCallback(async () => {
    if (!wallet) return;
    setErr(null);
    setLastTx(null);
    setBusy('send');
    console.groupCollapsed(`${TAG} send start`);
    try {
      // 送金先（空なら自分宛て・デモでも Tx が発行される）
      const dstStr = recipient.trim() || wallet.publicKey.toBase58();
      let to: PublicKey;
      try {
        to = new PublicKey(dstStr);
      } catch {
        throw new Error('Recipient is not a valid Solana address.');
      }

      // Tx 作成
      const ix = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: to,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      });
      const tx = new Transaction().add(ix);

      console.log(`${TAG} feePayer=`, wallet.publicKey.toBase58());
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
        skipPreflight: false,
        commitment: 'confirmed',
      });
      console.log(`${TAG} sent sig=`, sig);
      setLastTx(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      await refreshBalance();
    } catch (e: any) {
      console.error(`${TAG} send ERR:`, e);
      setErr(e.message || String(e));
    } finally {
      console.groupEnd();
      setBusy('idle');
    }
  }, [connection, wallet, recipient, refreshBalance]);

  return (
    <main className="mx-auto max-w-xl p-6 space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Devnet • SOL Transfer Demo (No Wallet Required)</h1>
        <p className="text-sm text-neutral-400">
          Temporary address:&nbsp;
          <code className="text-neutral-200">{wallet?.publicKey.toBase58() || '—'}</code>
        </p>
        <p className="text-sm text-neutral-400">Balance: {bal == null ? '—' : `${bal.toFixed(4)} SOL`}</p>
      </section>

      <section className="space-y-3">
        <button
          onClick={doAirdrop}
          disabled={!wallet || busy !== 'idle'}
          className="rounded-2xl px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy === 'airdrop' ? 'Airdropping…' : '1 SOL Airdrop'}
        </button>

        <label className="block text-sm mt-4">
          Recipient (optional)
          <input
            className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
            placeholder="Leave empty to send to self (demo)"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>

        <button
          onClick={sendSol}
          disabled={!wallet || busy !== 'idle' || !airdropped}
          className="rounded-2xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy === 'send' ? 'Sending…' : 'Send 0.01 SOL'}
        </button>

        {lastTx && (
          <p className="text-sm">
            ✅ Tx:&nbsp;
            <a href={lastTx} target="_blank" className="text-emerald-400 underline" rel="noreferrer">
              View on Explorer
            </a>
          </p>
        )}
        {err && <p className="text-sm text-red-400">Error: {err}</p>}
      </section>

      <section className="text-sm text-neutral-400">
        <h2 className="text-base font-semibold text-neutral-200 mb-2">Notes</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>No Phantom/Privy required. Everything signs in-browser with a temporary keypair.</li>
          <li>
            RPC:&nbsp;<code>{RPC_URL}</code>
          </li>
          <li>Works reliably on Devnet and avoids “invalid chain / e is not iterable”.</li>
        </ul>
      </section>
    </main>
  );
}



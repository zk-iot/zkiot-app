"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";

import {
  getReadWorkspace,
  getSignerWorkspace,
  PROGRAM_ID,
  type WalletLike,
} from "@/lib/anchor/client";

export default function CounterPage() {
  const { ready: readyAuth, authenticated, login, logout } = usePrivy();
  const { ready: readySol, wallets } = useSolanaWallets();
  const privyWallet = wallets?.[0] as unknown as WalletLike | undefined;

  // 読み取り用 workspace
  const readWs = useMemo(() => getReadWorkspace(), []);

  // 表示用 state
  const [authority, setAuthority] = useState<PublicKey | null>(null);
  const [counterPda, setCounterPda] = useState<PublicKey | null>(null);
  const [count, setCount] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 実署名者に合わせて owner/PDA を決定して処理を実行
  const withSigner = async (
    fn: (ctx: {
      ws: NonNullable<Awaited<ReturnType<typeof getSignerWorkspace>>>;
      owner: PublicKey;
      counter: PublicKey;
    }) => Promise<void>
  ) => {
    setLoading(true);
    setErr(null);
    setTxSig(null);
    try {
      const ws = await getSignerWorkspace(privyWallet ?? null);
      if (!ws) throw new Error("No signable Solana wallet (Privy/Phantom).");

      const owner = ws.provider.wallet.publicKey;
      const [counter] = PublicKey.findProgramAddressSync(
        [owner.toBuffer()], // seeds = [authority] に一致
        PROGRAM_ID
      );

      // 表示も同期
      setAuthority(owner);
      setCounterPda(counter);

      await fn({ ws, owner, counter });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  // 読み取り（read-only）
  const readFor = async (pda: PublicKey) => {
    setLoading(true);
    setErr(null);
    try {
      const acc = await (readWs.program.account as any)["counter"].fetch(pda);
      setCount(acc.count.toString());
    } catch (e: any) {
      setCount(null);
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const read = async () => {
    if (!counterPda) return;
    await readFor(counterPda);
  };

  useEffect(() => {
    // ログイン済みで、かつ PDA がわかっていれば自動で read
    if (readyAuth && readySol && counterPda) read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyAuth, readySol, counterPda]);

  // tx: create
  const createCounter = async () => {
    await withSigner(async ({ ws, owner, counter }) => {
      const tx = await (ws.program.methods as any)
        .createCounter()
        .accounts({
          authority: owner,
          counter,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setTxSig(tx);
      await readFor(counter);
    });
  };

  // tx: update (+1)
  const updateCounter = async () => {
    await withSigner(async ({ ws, owner, counter }) => {
      const tx = await (ws.program.methods as any)
        .updateCounter()
        .accounts({
          authority: owner,
          counter,
        })
        .rpc();
      setTxSig(tx);
      await readFor(counter);
    });
  };

  const network = "devnet";

  return (
    <main className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Counter (PDA by authority)</h1>

      <div className="text-sm opacity-80 space-y-1">
        <div>
          Auth ready: {String(readyAuth)} / Sol ready: {String(readySol)}
        </div>
        <div>Authenticated: {String(authenticated)}</div>
        <div>
          Program ID:{" "}
          <span className="font-mono break-all">
            {PROGRAM_ID.toBase58()}
          </span>
        </div>
        <div>
          Authority:{" "}
          {authority ? authority.toBase58() : "(not decided yet)"}
        </div>
        <div>PDA(counter): {counterPda ? counterPda.toBase58() : "-"}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!authenticated ? (
          <button
            className="px-3 py-2 rounded-2xl shadow border"
            onClick={() => login()}
          >
            Login
          </button>
        ) : (
          <button
            className="px-3 py-2 rounded-2xl shadow border"
            onClick={() => logout()}
          >
            Logout
          </button>
        )}

        <button
          className="px-3 py-2 rounded-2xl shadow border"
          onClick={createCounter}
          disabled={loading}
          title="Create PDA counter for the current signer"
        >
          Create
        </button>

        <button
          className="px-3 py-2 rounded-2xl shadow border"
          onClick={updateCounter}
          disabled={loading}
          title="Increment the counter by 1"
        >
          Update (+1)
        </button>

        <button
          className="px-3 py-2 rounded-2xl shadow border"
          onClick={read}
          disabled={!counterPda || loading}
        >
          Read
        </button>
      </div>

      <div className="text-sm space-y-2">
        {loading && <div>Loading...</div>}
        {typeof count === "string" && (
          <div>
            count: <span className="font-mono">{count}</span>
          </div>
        )}
        {txSig && (
          <div className="break-all">
            tx:{" "}
            <a
              className="underline"
              target="_blank"
              href={`https://explorer.solana.com/tx/${txSig}?cluster=${network}`}
            >
              {txSig}
            </a>
          </div>
        )}
        {err && <div className="text-red-500 break-words">Error: {err}</div>}
      </div>
    </main>
  );
}







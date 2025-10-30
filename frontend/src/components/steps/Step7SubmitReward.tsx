// components/steps/Step7SubmitReward.tsx
"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

const LS_PROOF = "zk:proof";
const LS_PUBLIC = "zk:public";

const VK_URL = "/artifacts/verification_key.json"; // 内部で読み込む（UIに出さない）
const PROOF_URL = "/artifacts/proof.json";         // フォールバック（任意）
const PUBLIC_URL = "/artifacts/public.json";       // フォールバック（任意）

const TAG = "[STEP7]";

// ★ Demo 用：固定シード（32 bytes）で常に同じアドレスを使用
const DEMO_SEED = new Uint8Array([
  9, 8, 7, 6, 5, 4, 3, 2,
  1, 0, 11, 22, 33, 44, 55, 66,
  77, 88, 99, 101, 111, 121, 131, 141,
  151, 161, 171, 181, 191, 201, 211, 221,
]);

export default function Step7SubmitReward({
  onPrev,
}: {
  onPrev: () => void;
}) {
  // ─────────────────────────────
  // 1) ZK Verify セクション
  // ─────────────────────────────
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const publicInputRef = useRef<HTMLInputElement | null>(null);

  const [proofText, setProofText] = useState<string | null>(null);
  const [publicText, setPublicText] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Step6 で保存された proof/public を自動ロード（あれば）
  useEffect(() => {
    const p = localStorage.getItem(LS_PROOF);
    const pub = localStorage.getItem(LS_PUBLIC);
    if (p) setProofText(p);
    if (pub) setPublicText(pub);
  }, []);

  const onFile = async (
    file: File,
    setter: (s: string) => void,
    label: string
  ) => {
    try {
      const text = await file.text();
      JSON.parse(text); // 形式チェック
      setter(text);
      setMessage(`${label} loaded: ${file.name}`);
    } catch {
      setMessage(`Failed to parse ${label}. Please select a valid JSON file.`);
    }
  };

  const loadFromPublic = async (url: string, setter: (s: string) => void, label: string) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setMessage(`${label} not found at ${url}`);
        return;
      }
      const text = await res.text();
      JSON.parse(text);
      setter(text);
      setMessage(`${label} loaded from ${url}`);
    } catch {
      setMessage(`Failed to load ${label} from ${url}`);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setResult(null);
    setMessage(null);

    try {
      // 1) verification_key.json を内部で取得（UIには出さない）
      const vkText = await fetchRequiredText(VK_URL, "verification_key.json");

      // 2) proof/public は state → localStorage → public の順で解決
      const pText =
        proofText ??
        localStorage.getItem(LS_PROOF) ??
        (await fetchOptionalText(PROOF_URL));
      const pubText =
        publicText ??
        localStorage.getItem(LS_PUBLIC) ??
        (await fetchOptionalText(PUBLIC_URL));

      if (!pText || !pubText) {
        throw new Error("Missing proof.json or public.json. Please prepare them in Step 6 or upload here.");
      }

      // 3) snarkjs 読み込み（ESM/Default 両対応）
      const mod = await import("snarkjs");
      const snarkjs: any = (mod as any).default ?? mod;
      const { groth16 } = snarkjs;

      // 4) 検証
      const vk = JSON.parse(vkText);
      const proof = JSON.parse(pText);
      const publicSignals = JSON.parse(pubText);

      const ok = await groth16.verify(vk, publicSignals, proof);
      setResult(ok ? "ok" : "fail");
      setMessage(ok ? "Valid proof." : "Invalid proof.");
      console.log(`${TAG} verify result =`, ok);
    } catch (e: any) {
      console.error(`${TAG} verify ERR:`, e);
      setResult("fail");
      setMessage(e?.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  // ─────────────────────────────
  // 2) Verify OK 後に表示する「受け取り（Devnet デモ）」セクション
  //    - 拡張/Privy不要：固定 Keypair で Airdrop → 0.01 SOL 送金
  // ─────────────────────────────
  const RPC_URL =
    process.env.NEXT_PUBLIC_RPC_URL ||
    clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_CLUSTER as any) || "devnet");
  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), [RPC_URL]);

  const [tmpWallet, setTmpWallet] = useState<Keypair | null>(null);
  const [airdropped, setAirdropped] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState<"idle" | "airdrop" | "send">("idle");
  const [txUrl, setTxUrl] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  // Verify OK → 固定シードから決定的に Keypair を生成
  useEffect(() => {
    if (result === "ok") {
      const fixedDemoKeypair = Keypair.fromSeed(DEMO_SEED);
      setTmpWallet(fixedDemoKeypair);
      setAirdropped(false);
      setBalance(null);
      setTxUrl(null);
      setClaimMsg("Your proof is valid. You can now claim the reward (demo).");
      console.log(`${TAG} tmp wallet =`, fixedDemoKeypair.publicKey.toBase58());
    }
  }, [result]);

  const refreshBalance = useCallback(async () => {
    if (!tmpWallet) return;
    try {
      const lamports = await connection.getBalance(tmpWallet.publicKey, "confirmed");
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (e) {
      console.warn(`${TAG} getBalance ERR`, e);
    }
  }, [connection, tmpWallet]);

  useEffect(() => {
    if (tmpWallet) refreshBalance();
  }, [tmpWallet, refreshBalance]);

  const airdrop = useCallback(async () => {
    if (!tmpWallet) return;
    setBusy("airdrop");
    setTxUrl(null);
    setClaimMsg(null);
    try {
      console.log(`${TAG} request airdrop →`, tmpWallet.publicKey.toBase58());
      const sig = await connection.requestAirdrop(tmpWallet.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      setAirdropped(true);
      await refreshBalance();
      setTxUrl(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      setClaimMsg("Reward claimed (Devnet demo). You can withdraw a small amount to see an on-chain transaction.");
    } catch (e: any) {
      console.error(`${TAG} airdrop ERR:`, e);
      setClaimMsg(e?.message || "Airdrop failed.");
    } finally {
      setBusy("idle");
    }
  }, [connection, tmpWallet, refreshBalance]);

  const withdraw = useCallback(async () => {
    if (!tmpWallet) return;
    setBusy("send");
    setTxUrl(null);
    setClaimMsg(null);
    try {
      const toStr = recipient.trim() || tmpWallet.publicKey.toBase58();
      const to = new PublicKey(toStr);
      const ix = SystemProgram.transfer({
        fromPubkey: tmpWallet.publicKey,
        toPubkey: to,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      });
      const tx = new Transaction().add(ix);
      const sig = await sendAndConfirmTransaction(connection, tx, [tmpWallet], {
        skipPreflight: false,
        commitment: "confirmed",
      });
      await refreshBalance();
      setTxUrl(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      setClaimMsg("Withdrawal completed. Check the explorer link below.");
    } catch (e: any) {
      console.error(`${TAG} withdraw ERR:`, e);
      setClaimMsg(e?.message || "Send failed.");
    } finally {
      setBusy("idle");
    }
  }, [connection, tmpWallet, recipient, refreshBalance]);

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-2">STEP 7 • Verify Proof & Claim (Demo)</h2>
      <p className="text-white/70 mb-4">
        First, verify your proof. If it’s valid, you can <span className="text-white">claim a demo reward</span> (Devnet SOL) and optionally withdraw a small amount to see a real on-chain transaction.
      </p>

      {/* Replace（Upload）UI：proof.json */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[140px]">proof.json</span>
        <button
          onClick={() => proofInputRef.current?.click()}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
        >
          {proofText ? "Replace…" : "Upload…"}
        </button>
        <button
          onClick={() => loadFromPublic(PROOF_URL, setProofText, "proof.json")}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
        >
          Load from /public
        </button>
        <span className={["text-xs", proofText ? "text-green-400" : "text-white/40"].join(" ")}>
          {proofText ? "Loaded" : "Not loaded"}
        </span>
        <input
          ref={proofInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f, setProofText, "proof.json");
          }}
        />
      </div>

      {/* Replace（Upload）UI：public.json */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="min-w-[140px]">public.json</span>
        <button
          onClick={() => publicInputRef.current?.click()}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
        >
          {publicText ? "Replace…" : "Upload…"}
        </button>
        <button
          onClick={() => loadFromPublic(PUBLIC_URL, setPublicText, "public.json")}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
        >
          Load from /public
        </button>
        <span className={["text-xs", publicText ? "text-green-400" : "text-white/40"].join(" ")}>
          {publicText ? "Loaded" : "Not loaded"}
        </span>
        <input
          ref={publicInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f, setPublicText, "public.json");
          }}
        />
      </div>

      {/* Verify ボタン（明るく・常時表示） */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={verify}
          disabled={verifying}
          className={[
            "rounded-xl px-4 py-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            verifying ? "bg-blue-800/40 text-white/70 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer",
          ].join(" ")}
        >
          {verifying ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Verifying…
            </span>
          ) : (
            "Verify"
          )}
        </button>

        {result === "ok" && <span className="text-green-400 text-sm">✅ Valid proof — You can now claim the reward.</span>}
        {result === "fail" && <span className="text-red-400 text-sm">❌ Invalid proof</span>}
      </div>

      {message && <div className="mt-3 text-sm text-white/70">{message}</div>}

      {/* Verify 成功後の Claim UI（固定アドレス利用） */}
      {result === "ok" && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold mb-1">Claim Reward (Devnet Demo)</h3>
          <p className="text-white/70 mb-3">
            Your ZK proof is valid. In this demo, you can claim <b>1 SOL</b> (Devnet airdrop) to a fixed demo wallet and then withdraw a small amount to any address.
          </p>

          <div className="text-sm text-white/70 mb-2">
            Demo wallet:{" "}
            <code className="text-white">{tmpWallet?.publicKey.toBase58() ?? "—"}</code>
            {" • "}Balance: <span className="text-white">{balance == null ? "—" : `${balance.toFixed(4)} SOL`}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={airdrop}
              disabled={!tmpWallet || busy !== "idle"}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-white disabled:opacity-50"
            >
              {busy === "airdrop" ? "Airdropping…" : "Claim 1 SOL (Devnet)"}
            </button>

            <input
              className="w-full sm:w-[360px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              placeholder="Recipient (optional, leave empty to send to self)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <button
            onClick={withdraw}
            disabled={!tmpWallet || busy !== "idle"}   // ← airdropped 判定を削除
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50"
            >
            {busy === "send" ? "Sending…" : "Withdraw 0.01 SOL"}
            </button>
          </div>

          {txUrl && (
            <div className="mt-3 text-sm">
              ✅ Tx:&nbsp;
              <a href={txUrl} target="_blank" className="text-emerald-400 underline" rel="noreferrer">
                View on Explorer
              </a>
            </div>
          )}
          {claimMsg && <div className="mt-2 text-sm text-white/70">{claimMsg}</div>}

          <p className="mt-4 text-xs text-white/50">
            Story: Your proof passed verification, so you’re eligible to receive funds. This demo simulates the reward by airdropping Devnet SOL to a fixed demo wallet and letting you withdraw a small portion, producing a real on-chain transaction you can inspect.
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onPrev}
          className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-white/15"
        >
          Back
        </button>
        <span className="text-white/60 text-sm">{result === "ok" ? "Reward available (demo)" : "Verification only"}</span>
      </div>
    </Card>
  );
}

/* ───────── helpers ───────── */

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent align-[-2px]" />
  );
}

async function fetchRequiredText(url: string, label: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${label} not found at ${url}`);
  }
  const text = await res.text();
  if (!text?.trim()) {
    throw new Error(`${label} is empty at ${url}`);
  }
  return text;
}

async function fetchOptionalText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    return text?.trim() ? text : null;
  } catch {
    return null;
  }
}


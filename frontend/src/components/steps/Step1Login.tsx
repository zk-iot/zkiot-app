// components/steps/Step1Login.tsx
"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { usePrivy, useLogin, useConnectWallet } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";

export default function Step1Login({
  onNext,
}: {
  onNext: () => void;
}) {
  const { ready: readyAuth, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const { connectWallet } = useConnectWallet();

  // Solana ウォレット（Phantom/Embedded含む）
  const { wallets: solWallets, ready: readySol } = useSolanaWallets();
  const solAddress = useMemo(() => solWallets?.[0]?.address ?? null, [solWallets]);

  // 画面表示と同じ “弱い” 判定
  const authed = authenticated === true;
  const solConnected = !!solAddress;

  // ボタン活性化は初期化完了時
  const ready = readyAuth && readySol;

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-2">STEP 1 • Login</h2>
      <p className="text-white/70 mb-4">Please connect wallet</p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => login()} disabled={!ready}>
          ✉ Login (opens modal)
        </Button>

        <Button onClick={() => connectWallet()} disabled={!ready}>
          🪙 Connect Wallet
        </Button>

        {authed && (
          <Button onClick={() => logout()} variant="secondary">
            Logout
          </Button>
        )}
      </div>

      {/* 状態表示（あなたの確認用にそのまま） */}
      <div className="mt-6 text-sm text-white/80">
        <div>Authenticated: <span className="font-mono">{String(authed)}</span></div>
        <div>Solana Connected: <span className="font-mono">{solConnected ? "true" : "false"}</span></div>
        {solConnected && (
          <div className="mt-1 truncate">
            Address: <span className="font-mono">{solAddress}</span>
          </div>
        )}
      </div>

      {/* Next：2つとも true のときだけ「表示」して onNext() を呼ぶ */}
      {authed && solConnected && (
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={onNext}
            className="relative z-20 inline-flex items-center rounded-lg bg-blue-500 px-5 py-2 
                       font-semibold text-black shadow hover:bg-blue-400 focus:outline-none 
                       focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Next
          </button>
        </div>
      )}
    </Card>
  );
}



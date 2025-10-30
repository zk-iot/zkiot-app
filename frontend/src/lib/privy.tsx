'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

// Auth core (EVM/common)
import { PrivyProvider, usePrivy, useLogin, useLogout } from '@privy-io/react-auth';

// Solana-specific hooks/connectors
import { useWallets as useSolanaWallets, toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';

declare global { interface Window { solana?: any } }

type AppProviderProps = { children: React.ReactNode };

/**
 * App-level Privy provider
 * - Enables email/wallet login
 * - Creates embedded Solana wallet on login
 * - Enables external Solana wallets (e.g. Phantom)
 */

export function PrivyAppProvider({ children }: AppProviderProps) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['wallet', 'email', 'github', 'google'],
        embeddedWallets: {
          solana: {
            // ✅ 外部(Phantom)を優先したいので自動生成はOFF
            createOnLogin: 'off',
          },
        },
        externalWallets: {
          solana: {
            // ✅ Solana コネクタを有効化（Phantom 等）
            connectors: toSolanaWalletConnectors(),
          },
        },
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
          walletChainType: 'solana-only',
          walletList: ['phantom', 'detected_wallets'],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}


// ──────────────────────────────────────────────────────────────────────────────
// Address selection helpers
// ──────────────────────────────────────────────────────────────────────────────

type PreferredSource = 'embedded' | 'external' | 'any';

/** Pick a Solana address from Privy state deterministically. */
function pickPrivySolanaAddress(
  solanaWallets: any[] | undefined,
  user: any,
  preferred: PreferredSource = 'embedded'
): string | null {
  const list = Array.isArray(solanaWallets) ? solanaWallets : [];

  const byType = (t: PreferredSource) =>
    list.find(
      (w: any) =>
        (w?.walletClientType === t || w?.type === t) && typeof w?.address === 'string'
    )?.address as string | undefined;

  if (preferred === 'embedded') {
    const a = byType('embedded');
    if (a) return a;
  }
  if (preferred === 'external') {
    const a = byType('external');
    if (a) return a;
  }

  // any: first Solana wallet
  const any = list.find((w: any) => typeof w?.address === 'string')?.address;
  if (any) return any as string;

  // Fallback: search within user objects
  const all = [
    ...(user?.wallets ?? []),
    ...(user?.linkedAccounts ?? []),
    ...(user?.accounts ?? []),
  ];
  const hit = all.find((x: any) => {
    const chainOk =
      x?.chain === 'solana' ||
      x?.chainType === 'solana' ||
      (typeof x?.chainId === 'string' && x.chainId.startsWith('solana:'));
    return chainOk && typeof x?.address === 'string';
  });
  return hit?.address ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

type UsePrivySolanaOptions = {
  /**
   * Source preference for picking a wallet address
   * - 'embedded': pick embedded wallet if available (recommended)
   * - 'external': pick external wallet (e.g. Phantom)
   * - 'any': fallback behavior
   */
  preferredSource?: PreferredSource;
  /** If 'hybrid', fall back to window.solana when no Privy wallet is available. */
  mode?: 'privy-only' | 'hybrid';
  /** Number of 1s-retries to wait for wallet to appear after login. */
  retries?: number; // default 10
};

/**
 * One-stop Solana wallet hook using Privy v3.
 * - Waits for readiness
 * - Picks deterministic address (embedded/external)
 * - Optional Phantom fallback
 * - Provides Connection & balance
 */
export function usePrivySolana(opts: UsePrivySolanaOptions = {}) {
  const preferredSource: PreferredSource = opts.preferredSource ?? 'embedded';
  const mode = opts.mode ?? 'privy-only';
  const maxRetries = Math.max(0, opts.retries ?? 10);

  const { ready: readyAuth, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { ready: readySolana, wallets: solanaWallets } = useSolanaWallets();

  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const tries = useRef(0);

  const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet') as
    | 'devnet'
    | 'mainnet-beta'
    | 'testnet';
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER);

  const connection = useMemo(
    () => new Connection(RPC_URL, 'confirmed'),
    [RPC_URL]
  );

  useEffect(() => {
    let stop = false;

    async function resolveAddressOnce(): Promise<string | null> {
      const fromPrivy = pickPrivySolanaAddress(
        solanaWallets,
        user,
        preferredSource
      );
      if (fromPrivy) return fromPrivy;

      if (
        mode === 'hybrid' &&
        typeof window !== 'undefined' &&
        window.solana?.publicKey
      ) {
        try {
          return window.solana.publicKey.toBase58();
        } catch {
          /* noop */
        }
      }
      return null;
    }

    async function run() {
      if (!readyAuth || !readySolana) return;
      setLoading(true);
      try {
        while (!stop) {
          const addr = await resolveAddressOnce();
          if (addr) {
            setAddress(addr);
            try {
              const lamports = await connection.getBalance(new PublicKey(addr));
              setBalance(lamports / LAMPORTS_PER_SOL);
            } catch {
              setBalance(null);
            }
            return;
          }
          if (tries.current >= maxRetries) {
            setAddress(null);
            setBalance(null);
            return;
          }
          tries.current += 1;
          await new Promise((r) => setTimeout(r, 1000));
        }
      } finally {
        if (!stop) setLoading(false);
      }
    }

    run();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyAuth, readySolana, user, solanaWallets, connection, preferredSource, mode]);

  const shortAddress = !address ? '' : `${address.slice(0, 4)}…${address.slice(-4)}`;
  const ready = readyAuth && readySolana;

  // helpful debug: which source was used
  const source = address
    ? pickPrivySolanaAddress(solanaWallets, user, 'embedded') === address
      ? 'embedded'
      : pickPrivySolanaAddress(solanaWallets, user, 'external') === address
      ? 'external'
      : 'unknown'
    : 'unknown';

  return { ready, authenticated, login, logout, address, shortAddress, balance, loading, source, connection } as const;
}

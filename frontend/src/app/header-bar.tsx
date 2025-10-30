// src/app/header-bar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePrivySolana } from '@/lib/privy';

export default function HeaderBar() {
  const { ready, authenticated, login, logout, shortAddress, balance, loading, address } =
    usePrivySolana({ mode: 'privy-only', retries: 10 });

  return (
   <header className="p-4 bg-gray-800 text-white">
  <nav className="mx-auto flex max-w-6xl items-center justify-between">
    {/* 左側：ロゴ + zk-IoT */}
   <Link href="/" className="flex items-center gap-3">
  <div className="flex items-center justify-center bg-gray-700 rounded-lg p-1">
    <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded" />
  </div>
  <span className="text-lg font-semibold tracking-wide text-white">
    zk-IoT
  </span>
</Link>


    {/* 右側：ウォレット情報とボタン */}
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex items-center gap-2 rounded-full bg-gray-700 px-3 py-1 text-sm">
        {loading || !ready ? (
          <span className="opacity-80">Loading…</span>
        ) : address ? (
          <>
            <span className="font-mono">{shortAddress}</span>
            <span className="opacity-80">{balance?.toFixed(3) ?? '--'} SOL</span>
          </>
        ) : (
          <span className="opacity-70">Not connected</span>
        )}
      </div>

      {authenticated ? (
        <button
          onClick={logout}
          className="rounded-md bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
        >
          Logout
        </button>
      ) : (
        <button
          onClick={login}
          className="rounded-md bg-indigo-600 px-3 py-1 text-sm hover:bg-indigo-500"
        >
          Login
        </button>
      )}
    </div>
  </nav>
</header>

  );
}

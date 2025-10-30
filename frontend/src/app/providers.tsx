// src/app/providers.tsx
'use client';

import { useEffect, useState } from 'react';
import { PrivyAppProvider } from '@/lib/privy';

export default function Providers({ children }: { children: React.ReactNode }) {
  // マウント完了まで描画を遅らせ、SSR/CSRの不整合を回避
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return <PrivyAppProvider>{children}</PrivyAppProvider>;
}

// src/app/layout.tsx
import '@/app/globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import HeaderBar from './header-bar';

export const metadata: Metadata = {
  title: 'zk-IoT',
  description: 'Next.js App Router + Privy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <HeaderBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}

// components/steps/Step6ZKProof.tsx
"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PROOF_URL = "/artifacts/proof.json";
const PUBLIC_URL = "/artifacts/public.json";
const LS_PROOF = "zk:proof";
const LS_PUBLIC = "zk:public";

type Stage = 0 | 1 | 2 | 3 | 4; // 0 idle, 1 loading, 2 fetching, 3 saving, 4 done

export default function Step6ZKProof({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  const [stage, setStage] = useState<Stage>(0);
  const [error, setError] = useState<string | null>(null);
  const [proofText, setProofText] = useState<string | null>(null);
  const [publicText, setPublicText] = useState<string | null>(null);

  const generating = stage > 0 && stage < 4;
  const ok = stage === 4;

  const proofSize = useMemo(
    () => (proofText ? new TextEncoder().encode(proofText).length : null),
    [proofText]
  );
  const publicSize = useMemo(
    () => (publicText ? new TextEncoder().encode(publicText).length : null),
    [publicText]
  );

  const percent = useMemo(() => {
    switch (stage) {
      case 0:
        return 0;
      case 1:
        return 30;
      case 2:
        return 65;
      case 3:
        return 90;
      case 4:
        return 100;
    }
  }, [stage]);

  const start = async () => {
    setError(null);
    setStage(1); // loading…

    try {
      // 少し演出
      await wait(300);

      setStage(2); // fetching…
      const [proofFetched, publicFetched] = await Promise.all([
        fetchMaybe(PROOF_URL),
        fetchMaybe(PUBLIC_URL),
      ]);

      // 無ければデモ用ダミー
      const proofStr =
        proofFetched ??
        JSON.stringify(
          {
            protocol: "groth16",
            curve: "bn128",
            pi_a: ["0x00", "0x00", "0x01"],
            pi_b: [
              ["0x00", "0x00"],
              ["0x00", "0x00"],
              ["0x00", "0x00"],
            ],
            pi_c: ["0x00", "0x00", "0x01"],
          },
          null,
          2
        );
      const publicStr =
        publicFetched ??
        JSON.stringify(
          {
            // demo signals
            signals: Array.from({ length: 6 }, (_, i) => String(3700 + i * 3)),
          },
          null,
          2
        );

      setProofText(proofStr);
      setPublicText(publicStr);

      setStage(3); // saving…
      await wait(350);

      try {
        localStorage.setItem(LS_PROOF, proofStr);
        localStorage.setItem(LS_PUBLIC, publicStr);
      } catch {
        /* ignore */
      }

      await wait(240);
      setStage(4); // done
    } catch (e: any) {
      setError(e?.message || "Failed to prepare files");
      setStage(0);
    }
  };

  const download = (name: string, content: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadProof = () => {
    const str = proofText ?? localStorage.getItem(LS_PROOF);
    if (str) download("proof.json", str);
  };
  const downloadPublic = () => {
    const str = publicText ?? localStorage.getItem(LS_PUBLIC);
    if (str) download("public.json", str);
  };

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-2">STEP 6 • Generate Proof Files</h2>
      <p className="text-white/70 mb-4">
        Prepare <code>proof.json</code> and <code>public.json</code> for the next step.
      </p>

      {/* 主ボタン：濃いめ & 明確に押せる */}
      <div className="flex items-center gap-3">
        <button
          onClick={start}
          disabled={generating}
          className={[
            "rounded-xl px-4 py-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            generating
              ? "bg-blue-800/40 text-white/60 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer",
          ].join(" ")}
          title="Generate Proof (demo)"
        >
          {generating ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Preparing…
            </span>
          ) : ok ? (
            "Re-prepare"
          ) : (
            "Generate Proof"
          )}
        </button>

        {ok && <span className="text-green-400 text-sm">✅ Ready</span>}
      </div>

      {/* 進捗バー */}
      <div className="mt-4 h-2 w-full rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full bg-blue-600"
          initial={{ width: "0%" }}
          animate={{ width: `${percent}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>

      {/* ステップ・ログ（動き） */}
      <div className="mt-3 grid gap-2 text-sm">
        <LogRow active={stage >= 1} done={stage > 1} label="Loading artifacts" />
        <LogRow active={stage >= 2} done={stage > 2} label="Fetching proof/public" />
        <LogRow active={stage >= 3} done={stage > 3} label="Saving files" />
        <LogRow active={stage >= 4} done={stage > 4} label="Done" />
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      {/* 完了カード（サイズとDL） */}
      <AnimatePresence>
        {ok && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 grid gap-2 sm:grid-cols-2"
          >
            <FileCard
              title="proof.json"
              size={proofSize}
              onDownload={downloadProof}
            />
            <FileCard
              title="public.json"
              size={publicSize}
              onDownload={downloadPublic}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* フッター */}
      <div className="mt-6 flex items-center justify-between">
  {/* Back: ルーター遷移せず onPrev を呼ぶだけ */}
  <button
    type="button"
    onClick={() => onPrev?.()}
    className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
  >
    Back
  </button>

  {/* Next: /next へリンクしない。ok の時だけ onNext を実行 */}
  <button
    type="button"
    onClick={() => ok && onNext?.()}
    disabled={!ok}
    className={[
      "rounded-xl px-4 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
      ok
        ? "bg-white/10 text-white hover:bg-blue-600 hover:text-white cursor-pointer"
        : "bg-white/5 text-white/50 cursor-not-allowed",
    ].join(" ")}
    aria-disabled={!ok}
  >
    Next
  </button>
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

function LogRow({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-white/80">
      <span
        className={[
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
          done
            ? "bg-green-500/20 text-green-300"
            : active
            ? "bg-blue-500/20 text-blue-300"
            : "bg-white/10 text-white/40",
        ].join(" ")}
      >
        {done ? "✓" : active ? "…" : "•"}
      </span>
      <span className={done ? "text-white/60 line-through" : active ? "text-white/90" : "text-white/50"}>
        {label}
      </span>
    </div>
  );
}

function FileCard({
  title,
  size,
  onDownload,
}: {
  title: string;
  size: number | null;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/15 p-3 bg-white/5">
      <div className="text-sm text-white/80 mb-2">{title}</div>
      <div className="text-xs text-white/60">Size: {size ?? "-"} bytes</div>
      <button
        onClick={onDownload}
        className="mt-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-blue-600 hover:text-white transition-colors"
      >
        Download {title}
      </button>
    </div>
  );
}

async function fetchMaybe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    return text?.trim() ? text : null;
  } catch {
    return null;
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

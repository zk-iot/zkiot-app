// components/steps/Step3Template.tsx
"use client";
import { Card } from "@/components/ui/Card";
import { useState } from "react";
import { cn } from "@/lib/core";

const templates = [
  { id: "voc",    title: "Factory VOC Threshold", desc: "Monitor VOC threshold in factory (recommended)", default: true },
  { id: "water",  title: "Water Quality",         desc: "pH / turbidity / contamination" },
  { id: "temp",   title: "Supply Chain Temp",     desc: "Cold-chain temperature" },
  { id: "energy", title: "Energy Consumption",    desc: "Power usage metering" },
  { id: "custom", title: "Custom Configuration",  desc: "Define your own rules" },
];

export default function Step3Template({
  onNext,
  onPrev,
  onSelect,
}: {
  onNext: () => void;
  onPrev: () => void;
  onSelect: (id: string) => void;
}) {
  // 初期値で voc を選択
  const [selected, setSelected] = useState<string>("voc");

  const pick = (id: string) => {
    setSelected(id);
    onSelect(id);
  };

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-2">STEP 3 • Select Template</h2>

      <div className="grid md:grid-cols-2 gap-3">
        {templates.map((t) => {
          const active = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-pressed={active}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                active
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-white/10 hover:border-white/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.title}</div>
                {active && <span className="text-xs text-blue-400">Selected</span>}
              </div>
              <div className="mt-1 text-sm text-white/60">{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* ✅ Nextは常時表示。カスタムButtonを使わず素のbuttonで強制表示 */}
      <div className="mt-6 flex items-center justify-end">
        <button
          type="button"
          onClick={onNext}
          className="
            inline-flex items-center justify-center
            rounded-xl px-4 py-2 text-sm font-semibold
            bg-blue-500 text-black hover:bg-blue-400
            border border-blue-400/50
          "
          style={{ display: "inline-flex" }} // どんな継承でも可視化を保証
        >
          Next
        </button>
      </div>
    </Card>
  );
}

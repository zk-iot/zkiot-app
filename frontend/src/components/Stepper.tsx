// components/Stepper.tsx
"use client";
import { cn } from "@/lib/core";

const steps = [
  "Login",
  "Select Sensor",
  "Select Template",
  "Start Measurement",
  "Disclosure Policy",
  "Generate Proof",
  "Submit & Reward"
];

export function Stepper({
  current,
  onNavigate
}: {
  current: number;           // 0-based
  onNavigate?: (i: number) => void; // click to jump
}) {
  const clickable = typeof onNavigate === "function";

  return (
    <ol
      className="grid grid-cols-7 gap-2 text-xs"
      role="tablist"
      aria-label="Progress"
    >
      {steps.map((s, i) => {
        const active = i === current;
        const done = i < current;

        return (
          <li key={s} className="w-full" role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? "step" : undefined}
              onClick={() => clickable && onNavigate!(i)}
              className={cn(
                "w-full rounded-xl border px-3 py-2 text-center transition",
                done
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                  : active
                  ? "border-white/25 bg-white/5 text-white"
                  : "border-white/10 bg-black/20 text-white/40",
                clickable ? "hover:border-white/30 cursor-pointer" : "cursor-default"
              )}
            >
              {s}
            </button>
          </li>
        );
      })}
    </ol>
  );
}


// components/charts/InlineSparkline.tsx
"use client";
import { useMemo } from "react";

export function InlineSparkline({ data }: { data: number[] }) {
  const path = useMemo(() => {
    if (!data.length) return "";
    const w = 240;
    const h = 60;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const norm = (v: number) =>
      h - ((v - min) / Math.max(1e-6, max - min)) * (h - 6) - 3;
    const step = w / (data.length - 1);
    return data
      .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step},${norm(v)}`)
      .join(" ");
  }, [data]);

  return (
    <svg width="240" height="60" className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke="url(#g)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

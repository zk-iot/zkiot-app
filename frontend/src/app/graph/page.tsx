// app/graph/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ChartPage() {
  const router = useRouter();

  // ------- state -------
  const [values, setValues] = useState<number[]>([20, 22, 21, 23, 24, 22, 21]);
  const [live, setLive] = useState<boolean>(true); // start ON for demo
  const [threshold, setThreshold] = useState<number>(50);
  const [breach, setBreach] = useState<boolean>(false);

  // latest threshold for timer callback
  const thresholdRef = useRef(threshold);
  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  // timer (600ms)
  useInterval(() => {
    setValues((prev) => {
      const safePrev = Array.isArray(prev) && prev.length > 0 ? prev : [50];
      const lastVal = safePrev[safePrev.length - 1] ?? 50;

      // random walk ±4
      const delta = Math.random() * 8 - 4;
      const nextValRaw = lastVal + delta;
      const nextVal = clamp(isFinite(nextValRaw) ? nextValRaw : lastVal, 0, 100);

      const nextSeries = [...safePrev.slice(-49), nextVal];
      const th = Number(thresholdRef.current) || 0;
      setBreach(nextVal > th);
      return nextSeries;
    });
  }, live ? 600 : null);

  const data = useMemo(
    () => values.map((v, i) => ({ idx: i, value: Math.round(v * 100) / 100 })),
    [values]
  );

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
      <h2 className="text-xl font-semibold mb-2">STEP 4 • Live Dashboard</h2>
      <p className="text-white/70 mb-4">
        Real-time sensor values with auto threshold detection.
      </p>

      <div className="grid md:grid-cols-3 gap-4 items-center">
        {/* Chart */}
        <div className="md:col-span-2 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis
                dataKey="idx"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.25)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.25)" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.25)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.25)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(20,20,24,0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                itemStyle={{ color: "#fff" }}
              />
              <ReferenceLine y={threshold} stroke="#60a5fa" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Threshold
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="text-white/80">{Math.round(threshold)}</div>
          </div>

          <div className="text-sm">
            Status:
            {breach ? (
              <span className="text-red-400"> Above threshold</span>
            ) : (
              <span className="text-blue-400"> Normal</span>
            )}
          </div>

          <div className="text-sm flex items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
              />
              Live update
            </label>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Back
        </button>
        <button
          onClick={() => router.push("/step5")}
          className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ------------ utils ------------ */

function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

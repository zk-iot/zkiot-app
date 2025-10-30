"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";

export function RealtimeLineChart({
  values,
  threshold,
  height = 220,
}: {
  values: number[];
  threshold: number;
  height?: number;
}) {
  const data = useMemo(
    () =>
      values.map((v, i) => ({
        i,
        value: Number.isFinite(v) ? v : 0,
      })),
    [values]
  );

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="i"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            formatter={(v: any) => [v, "value"]}
            labelFormatter={(i) => `index: ${i}`}
          />
          <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

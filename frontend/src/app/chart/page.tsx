// app/iot/page.tsx
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { IClientOptions, ISubscriptionGrant, MqttClient } from "mqtt";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Msg = { topic: string; payload: string; ts: number };

const MAX_SERIES = 4;
const MAX_POINTS = 50;

type ViewMode = "absolute" | "relative";

export default function IoTDemoPage() {
  const [status, setStatus] =
    useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [topic, setTopic] = useState("devices/test_0914/telemetry");
  const [subscribed, setSubscribed] = useState(false);
  const [paused, setPaused] = useState(false);

  // ▼ 表示用オプション
  const [viewMode, setViewMode] = useState<ViewMode>("relative"); // ← 初期値をrelativeに
  const [zoom, setZoom] = useState<number>(100); // ← 100x = 0.1が10に見える

  const [labels, setLabels] = useState<string[]>([]);
  const [series, setSeries] = useState<number[][]>([]);

  const clientRef = useRef<MqttClient | null>(null);

  // 接続
  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        setStatus("connecting");

        const clientId = `web-${crypto.randomUUID()}`;
        const res = await fetch(`/api/iot-presign?clientId=${clientId}`, { cache: "no-store" });
        const data = await res.json();
        if (!data?.url) throw new Error("presign failed");
        const url: string = data.url;

        const mqttAny = await import("mqtt");
        const mqtt = (mqttAny as any).default ?? mqttAny;

        const opts: IClientOptions = {
          protocolVersion: 4,
          clean: true,
          connectTimeout: 30_000,
          reconnectPeriod: 3_000,
        };

        const client: MqttClient = mqtt.connect(url, opts);
        clientRef.current = client;

        client.on("connect", () => {
          if (disposed) return;
          setStatus("connected");
        });

        client.on("message", (t: string, payload: Uint8Array | Buffer) => {
          if (disposed || paused) return;

          const arr = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
          const text = new TextDecoder().decode(arr);

          const extracted = extractUpToFourNumbers(text);
          if (!extracted) return;

          if (labels.length === 0) {
            setLabels(extracted.labels);
            setSeries(Array.from({ length: extracted.values.length }, () => []));
          }

          setSeries((prev) => {
            const next = [...prev];
            if (next.length !== extracted.values.length) {
              setLabels(extracted.labels);
              while (next.length < extracted.values.length) next.push([]);
              while (next.length > extracted.values.length) next.pop();
            }
            for (let i = 0; i < extracted.values.length; i++) {
              const a = next[i] ?? [];
              a.push(extracted.values[i]);
              if (a.length > MAX_POINTS) a.shift();
              next[i] = a;
            }
            return next;
          });
        });

        client.on("error", (e) => {
          console.error("client error:", e);
          if (!disposed) setStatus("error");
        });
      } catch (e) {
        console.error("connect/init error:", e);
        setStatus("error");
      }
    };

    run();

    return () => {
      disposed = true;
      clientRef.current?.end(true);
      clientRef.current = null;
    };
  }, [paused, labels.length]);

  // 購読開始/停止
  const handleStart = () => {
    const client = clientRef.current;
    if (!client || status !== "connected") return;
    if (subscribed) { setPaused(false); return; }
    client.subscribe(topic, { qos: 0 }, (err: Error | null, _granted?: ISubscriptionGrant[]) => {
      if (err) {
        console.error("subscribe error:", err);
        setStatus("error");
        return;
      }
      setSubscribed(true);
      setPaused(false);
    });
  };
  const handleStop = () => {
    const client = clientRef.current;
    if (!client || !subscribed) { setPaused(true); return; }
    client.unsubscribe(topic, undefined, (err?: Error) => {
      if (err) {
        console.error("unsubscribe error:", err);
        return;
      }
      setSubscribed(false);
      setPaused(true);
    });
  };

  const togglePause = () => setPaused((p) => !p);
  const clearCharts = () => { setSeries([]); setLabels([]); };
  const disconnect = () => {
    clientRef.current?.end(true);
    clientRef.current = null;
    setSubscribed(false);
    setPaused(false);
    setStatus("idle");
    clearCharts();
  };

  // ▼ 表示用に変換（Absolute=そのまま / Relative=基準からの差分×Zoom）
  const displaySeries = useMemo(() => {
    if (series.length === 0) return [];
    if (viewMode === "absolute" || zoom === 1) return series;

    // relative: 各系列の基準値を「最初の値（または先頭近傍の中央値）」として差分表示
    return series.map((arr) => {
      if (arr.length === 0) return arr;
      const base = median(arr.slice(0, Math.min(5, arr.length))); // 先頭〜5点の中央値
      return arr.map((v) => (v - base) * zoom);
    });
  }, [series, viewMode, zoom]);

  // Recharts用データ（行ごとに idx + 各系列）
  const chartData = useMemo(() => {
    const len = displaySeries.reduce((m, s) => Math.max(m, s.length), 0);
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, number | undefined> = { idx: i };
      for (let k = 0; k < displaySeries.length; k++) {
        const key = labels[k] ?? `v${k + 1}`;
        const off = len - displaySeries[k].length;
        const v = displaySeries[k][i - off];
        row[key] = Number.isFinite(v) ? (v as number) : undefined;
      }
      return row;
    });
  }, [displaySeries, labels]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">MQTT – 4 Series Charts (Zoom & Relative)</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">Status: {status}</span>
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">Subscribed: {String(subscribed)}</span>
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">Paused: {String(paused)}</span>
      </div>

      {/* コントロール群 */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="border rounded-xl px-3 py-2 font-mono w-full sm:w-auto"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="topic"
        />
        <button onClick={handleStart} className="px-3 py-2 rounded-xl border">Start</button>
        <button onClick={handleStop} className="px-3 py-2 rounded-xl border">Stop</button>
        <button onClick={togglePause} className="px-3 py-2 rounded-xl border">
          {paused ? "Resume" : "Pause"}
        </button>
        <button onClick={clearCharts} className="px-3 py-2 rounded-xl border">Clear</button>
        <button onClick={disconnect} className="px-3 py-2 rounded-xl border">Disconnect</button>

        {/* 表示モード */}
        <div className="flex items-center gap-2 ml-2">
          <label className="text-sm">View:</label>
          <select
            className="border rounded-lg px-2 py-1"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="absolute">Absolute</option>
            <option value="relative">Relative (Δ × Zoom)</option>
          </select>
        </div>

        {/* ズーム（倍率） */}
        <div className="flex items-center gap-2">
          <label className="text-sm">Zoom: </label>
          <input
            type="range"
            min={1}
            max={200}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span className="text-sm w-10 text-right">{zoom}x</span>
        </div>
      </div>

      {/* 4つのミニチャート */}
      {displaySeries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displaySeries.map((_, i) => {
            const key = labels[i] ?? `v${i + 1}`;
            return (
              <MiniChart
                key={key}
                title={`${key}${viewMode === "relative" ? " (Δ×" + zoom + "x)" : ""}`}
                data={chartData}
                dataKey={key}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-gray-500">まだデータ系列がありません。メッセージを受信すると自動で表示されます。</div>
      )}
    </div>
  );
}

/** JSON文字列から最大4つの数値を { labels, values } にして返す */
function extractUpToFourNumbers(jsonText: string): { labels: string[]; values: number[] } | null {
  try {
    const obj = JSON.parse(jsonText);
  if (Array.isArray(obj)) {
      const nums = obj.filter((x) => typeof x === "number").slice(0, MAX_SERIES) as number[];
      if (!nums.length) return null;
      const labels = nums.map((_, i) => `v${i + 1}`);
      return { labels, values: nums };
    }
    const entries = Object.entries(obj)
      .filter(([, v]) => typeof v === "number")
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, MAX_SERIES);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => k);
    const values = entries.map(([, v]) => (v as number));
    return { labels, values };
  } catch {
    return null;
  }
}

/** 単一系列ミニチャート */
function MiniChart({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: Array<Record<string, number | undefined>>;
  dataKey: string;
}) {
  // 表示域をデータに合わせて少し余白を取る
  const [yMin, yMax] = useMemo(() => {
    const vals = data.map((d) => d[dataKey]).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return [0, 1] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min || 1) * 0.1; // 10% マージン
    return [min - pad, max + pad] as const;
  }, [data, dataKey]);

  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="idx" hide />
            <YAxis domain={[yMin, yMax]} width={32} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey={dataKey} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// 先頭数点の中央値（外れ値に強い基準）
function median(nums: number[]) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}


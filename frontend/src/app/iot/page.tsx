"use client";

import { useEffect, useRef, useState } from "react";
import type { IClientOptions, ISubscriptionGrant, MqttClient } from "mqtt";

type Msg = { topic: string; payload: string; ts: number };

export default function IoTDemoPage() {
  const [status, setStatus] =
    useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [topic, setTopic] = useState("devices/test_0914/telemetry");
  const [subscribed, setSubscribed] = useState(false);
  const [paused, setPaused] = useState(false);

  const clientRef = useRef<MqttClient | null>(null);

  // 最初に接続（署名URL取得 → connect）
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

        // パッケージ名のみを動的import（v4/v5どちらでもOK）
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
          if (disposed) return;
          if (paused) return; // ★ 一時停止中は無視
          const arr = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
          const text = new TextDecoder().decode(arr);
          setMessages((prev) => [{ topic: t, payload: text, ts: Date.now() }, ...prev].slice(0, 200));
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
  }, []);

  // 購読開始
  const handleStart = () => {
    const client = clientRef.current;
    if (!client || status !== "connected") return;
    if (subscribed) { setPaused(false); return; } // 既に購読中→ポーズ解除だけ
    client.subscribe(topic, { qos: 0 }, (err: Error | null, _granted?: ISubscriptionGrant[]) => {
      if (err) {
        console.error("subscribe error:", err);
        setStatus("error");
        return;
      }
      setSubscribed(true);
      setPaused(false);
      console.log("subscribed:", topic);
    });
  };

  // 購読停止（接続は維持）
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
      console.log("unsubscribed:", topic);
    });
  };

  // 一時停止/再開（購読は維持）
  const togglePause = () => setPaused((p) => !p);

  // メッセージ消去
  const clearMessages = () => setMessages([]);

  // 切断（完全停止）
  const disconnect = () => {
    clientRef.current?.end(true);
    clientRef.current = null;
    setSubscribed(false);
    setPaused(false);
    setStatus("idle");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">AWS IoT MQTT (WebSocket) Live</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">
          Status: {status}
        </span>
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">
          Subscribed: {String(subscribed)}
        </span>
        <span className="px-3 py-1 rounded-2xl text-sm bg-gray-100">
          Paused: {String(paused)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded-xl px-3 py-2 font-mono w-full sm:w-auto"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="topic"
        />
        <button onClick={handleStart} className="px-3 py-2 rounded-xl border">Start (subscribe)</button>
        <button onClick={handleStop} className="px-3 py-2 rounded-xl border">Stop (unsubscribe)</button>
        <button onClick={togglePause} className="px-3 py-2 rounded-xl border">
          {paused ? "Resume (unpause)" : "Pause (no render)"}
        </button>
        <button onClick={clearMessages} className="px-3 py-2 rounded-xl border">Clear</button>
        <button onClick={disconnect} className="px-3 py-2 rounded-xl border">Disconnect</button>
      </div>

      <div className="space-y-3">
        {messages.slice(0, 50).map((m) => (
          <div key={m.ts + m.topic} className="p-3 rounded-xl border">
            <div className="text-xs text-gray-500">{new Date(m.ts).toLocaleString()}</div>
            <div className="text-sm font-mono mt-1">topic: {m.topic}</div>
            <pre className="whitespace-pre-wrap break-words text-sm mt-2">{m.payload}</pre>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-gray-500">まだメッセージはありません。デバイスから publish されるとここに表示されます。</div>
        )}
      </div>
    </div>
  );
}



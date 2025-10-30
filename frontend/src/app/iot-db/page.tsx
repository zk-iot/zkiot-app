"use client";

import { useEffect, useRef, useState } from "react";
import type { IClientOptions, ISubscriptionGrant, MqttClient } from "mqtt";

type Msg = { topic: string; payload: string; ts: number };

export default function IoTDashboardPage() {
  const [status, setStatus] =
    useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [topic, setTopic] = useState("devices/test_0914/telemetry");
  const [subscribed, setSubscribed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    let disposed = false;
    const run = async () => {
      try {
        setStatus("connecting");
        const clientId = `web-${crypto.randomUUID()}`;
        const res = await fetch(`/api/aws-iot?clientId=${clientId}`, { cache: "no-store" });
        const data = await res.json();
        if (!data?.url) throw new Error("presign failed");

        const mqttAny = await import("mqtt");
        const mqtt = (mqttAny as any).default ?? mqttAny;

        const opts: IClientOptions = {
          protocolVersion: 4,
          clean: true,
          connectTimeout: 30_000,
          reconnectPeriod: 3_000,
        };

        const client: MqttClient = mqtt.connect(data.url, opts);
        clientRef.current = client;

        client.on("connect", () => {
          if (disposed) return;
          setStatus("connected");
        });

        client.on("message", (t: string, payload: Uint8Array | Buffer) => {
          if (disposed || paused) return;
          const text = new TextDecoder().decode(payload);
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
  }, [paused]);

  const handleStart = () => {
    const client = clientRef.current;
    if (!client || status !== "connected") return;
    if (subscribed) { setPaused(false); return; }
    client.subscribe(topic, { qos: 0 }, (err: Error | null, _granted?: ISubscriptionGrant[]) => {
      if (err) { console.error("subscribe error:", err); setStatus("error"); return; }
      setSubscribed(true); setPaused(false);
    });
  };

  const handleStop = () => {
    const client = clientRef.current;
    if (!client || !subscribed) { setPaused(true); return; }
    client.unsubscribe(topic, undefined, (err?: Error) => {
      if (err) { console.error("unsubscribe error:", err); return; }
      setSubscribed(false); setPaused(true);
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">AWS IoT MQTT Dashboard</h1>
      <div className="flex gap-2">
        <span>Status: {status}</span>
        <span>Subscribed: {String(subscribed)}</span>
        <span>Paused: {String(paused)}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded-xl px-3 py-2 font-mono w-full sm:w-auto"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="topic"
        />
        <button onClick={handleStart} className="px-3 py-2 rounded-xl border">Start</button>
        <button onClick={handleStop} className="px-3 py-2 rounded-xl border">Stop</button>
      </div>

      <div className="space-y-3">
        {messages.slice(0, 20).map((m) => (
          <div key={m.ts + m.topic} className="p-3 rounded-xl border">
            <div className="text-xs text-gray-500">{new Date(m.ts).toLocaleString()}</div>
            <div className="text-sm font-mono mt-1">topic: {m.topic}</div>
            <pre className="whitespace-pre-wrap break-words text-sm mt-2">{m.payload}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

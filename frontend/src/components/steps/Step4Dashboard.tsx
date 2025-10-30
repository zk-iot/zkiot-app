// components/steps/Step4Dashboard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { IClientOptions, ISubscriptionGrant, MqttClient } from "mqtt";
import { Card } from "@/components/ui/Card";

type Msg = { topic: string; payload: string; ts: number };

// Demo default topic (change as you like)
const DEFAULT_TOPIC = "devices/test_0914/telemetry";
const TAG = "[MQTT]";

export default function Step4Dashboard({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  const [status, setStatus] =
    useState<"idle" | "connecting" | "connected" | "reconnecting" | "offline" | "closed" | "error">("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showNextCta, setShowNextCta] = useState(false); // Stop後に最下部で表示

  const clientRef = useRef<MqttClient | null>(null);
  const desiredSubscribedRef = useRef(false); // ← 望ましい購読状態（Start/Stopで更新）
  const topicRef = useRef(DEFAULT_TOPIC);

  // Connect on mount (presign → mqtt.connect). Keep connection alive.
  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        setStatus("connecting");
        console.log(TAG, "connecting…");

        const clientId = `web-${crypto.randomUUID()}`;
        const res = await fetch(`/api/iot-presign?clientId=${clientId}`, { cache: "no-store" });
        const data = await res.json();
        if (!data?.url) throw new Error("presign failed");
        const url: string = data.url;

        const mqttAny = (await import("mqtt")) as any;
        const mqtt = mqttAny.default ?? mqttAny;

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
          console.log(TAG, "connected");
          setStatus("connected");
          // 望ましい購読状態なら再購読（初回/再接続の両方で実行）
          if (desiredSubscribedRef.current && !subscribed) {
            doSubscribe(topicRef.current);
          }
        });

        client.on("reconnect", () => {
          if (disposed) return;
          console.log(TAG, "reconnecting…");
          setStatus("reconnecting");
          setSubscribed(false); // Clean sessionのため購読は消える想定
        });

        client.on("close", () => {
          if (disposed) return;
          console.log(TAG, "close");
          setStatus("closed");
          setSubscribed(false);
        });

        client.on("offline", () => {
          if (disposed) return;
          console.log(TAG, "offline");
          setStatus("offline");
        });

        client.on("end", () => {
          if (disposed) return;
          console.log(TAG, "end");
        });

        client.on("error", (e) => {
          console.error(TAG, "client error:", e);
          if (!disposed) setStatus("error");
        });

        client.on("message", (t: string, payload: Uint8Array | Buffer) => {
          if (disposed) return;
          const arr = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
          const text = new TextDecoder().decode(arr);
          // 受信自体は常にバッファへ（pausedでも最新50件は保持）
          setMessages((prev) => [{ topic: t, payload: text, ts: Date.now() }, ...prev].slice(0, 200));
          // paused中はレンダリングしない -> 今回は setMessages だけで十分（描画は下側で制御）
        });
      } catch (e) {
        console.error(TAG, "connect/init error:", e);
        setStatus("error");
      }
    };

    run();

    return () => {
      disposed = true;
      clientRef.current?.end(true);
      clientRef.current = null;
      console.log(TAG, "disposed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe helper
  const doSubscribe = (topic: string) => {
    const client = clientRef.current;
    if (!client) return;
    console.log(TAG, "subscribe ->", topic);
    client.subscribe(topic, { qos: 0 }, (err: Error | null, granted?: ISubscriptionGrant[]) => {
      if (err) {
        console.error(TAG, "subscribe error:", err);
        setStatus("error");
        setSubscribed(false);
        return;
      }
      console.log(TAG, "subscribed grants:", granted);
      setSubscribed(true);
      setPaused(false);
      setShowNextCta(false);
    });
  };

  // Unsubscribe helper
  const doUnsubscribe = (topic: string) => {
    const client = clientRef.current;
    if (!client) {
      setSubscribed(false);
      setPaused(true);
      setShowNextCta(true);
      return;
    }
    console.log(TAG, "unsubscribe ->", topic);
    client.unsubscribe(topic, undefined, (err?: Error) => {
      if (err) {
        console.error(TAG, "unsubscribe error:", err);
        return;
      }
      setSubscribed(false);
      setPaused(true);
      setShowNextCta(true);
    });
  };

  // Start: mark desired state & subscribe (or connect後に自動再購読)
  const handleStart = () => {
    desiredSubscribedRef.current = true;
    setShowNextCta(false);
    const client = clientRef.current;
    if (client && status === "connected" && !subscribed) {
      doSubscribe(topicRef.current);
    } else {
      console.log(TAG, "queued subscribe (will run on connect/reconnect)");
    }
  };

  // Stop: mark desired state false & unsubscribe
  const handleStop = () => {
    desiredSubscribedRef.current = false;
    doUnsubscribe(topicRef.current);
  };

  const togglePause = () => setPaused((p) => !p);
  const clearMessages = () => setMessages([]);

  const btn =
    "px-3 py-2 rounded-xl border border-white/20 bg-white/5 text-white/90 " +
    "cursor-pointer transition-colors select-none " +
    "hover:bg-blue-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
    "active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

  const chip =
    "px-3 py-1 rounded-2xl text-sm bg-white/10 text-white border border-white/10";

  // 表示用の配列（pausedなら空を渡して描画を止める）
  const visibleMessages = paused ? [] : messages.slice(0, 50);

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-2">STEP 4 • AWS IoT MQTT (WebSocket)</h2>
      <p className="text-white/70 mb-4">
        Connected on load. Press <strong>Start</strong> to subscribe and render telemetry.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={chip}>Status: {status}</span>
        <span className={chip}>Subscribed: {String(subscribed)}</span>
        <span className={chip}>Paused: {String(paused)}</span>
        <span className={chip}>
          Topic: <code className="font-mono">{DEFAULT_TOPIC}</code>
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button onClick={handleStart} className={btn} title="Subscribe to the demo topic">
          Start
        </button>
        <button onClick={handleStop} className={btn} title="Unsubscribe but keep connection">
          Stop
        </button>
        <button onClick={togglePause} className={btn}>
          {paused ? "Resume (unpause)" : "Pause (no render)"}
        </button>
        <button onClick={clearMessages} className={btn}>
          Clear
        </button>
      </div>

      <div className="space-y-3">
        {visibleMessages.map((m) => (
          <div key={m.ts + m.topic} className="p-3 rounded-xl border border-white/15">
            <div className="text-xs text-white/50">{new Date(m.ts).toLocaleString()}</div>
            <div className="text-sm font-mono mt-1">topic: {m.topic}</div>
            <pre className="whitespace-pre-wrap break-words text-sm mt-2">{m.payload}</pre>
          </div>
        ))}
        {!visibleMessages.length && (
          <div className="text-white/50">
            {paused
              ? "Paused. Press Resume to render incoming messages."
              : "No messages yet. Press Start and publish from your device."}
          </div>
        )}
      </div>

      {/* Footer: Back is always visible, Next appears only after Stop */}
      <div className="mt-6 flex items-center justify-between">
  {/* Back は onPrev を呼ぶだけのボタンに */}
  <button
    type="button"
    onClick={() => onPrev?.()}
    className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
  >
    Back
  </button>

  {/* Stop 後だけ表示。/next へ遷移はしないで onNext を実行 */}
  {showNextCta && (
    <button
      type="button"
      onClick={() => onNext?.()}
      className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 inline-flex"
      aria-label="Go to next chapter and save data"
      title="Go to next chapter and save data"
    >
      Next • Save Data
    </button>
  )}
</div>
    </Card>
  );
}


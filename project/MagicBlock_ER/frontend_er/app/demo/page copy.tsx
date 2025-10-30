"use client";
import React, { useMemo, useRef, useState } from "react";

// Demo UI: 512件のJSONをアップロード→128件ごとに分割→/api/finalize-bulkへPOST
// Next.js (App Router) + TypeScript + Tailwind 前提
// ファイル配置: app/demo/page.tsx に置いて動かす想定

export default function DemoPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonText, setJsonText] = useState<string>("");
  const [readings, setReadings] = useState<any[] | null>(null);
  const [device, setDevice] = useState<string>(process.env.NEXT_PUBLIC_DEVICE_PUBKEY || "");
  const [checkpoint, setCheckpoint] = useState<string>(process.env.NEXT_PUBLIC_CHECKPOINT_PUBKEY || "");
  const [chunk, setChunk] = useState<number>(128);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string>("");

  const total = readings?.length ?? 0;
  const batches = useMemo(() => (total && chunk ? Math.ceil(total / chunk) : 0), [total, chunk]);

  const handleChooseFile = async (file: File) => {
    setError("");
    setResult(null);
    const text = await file.text();
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      // パターン1: { devicePubkey, checkpointPubkey, chunkSize, readings: [...] }
      if (parsed && Array.isArray(parsed.readings)) {
        setReadings(parsed.readings);
        if (parsed.devicePubkey) setDevice(parsed.devicePubkey);
        if (parsed.checkpointPubkey) setCheckpoint(parsed.checkpointPubkey);
        if (parsed.chunkSize) setChunk(Number(parsed.chunkSize) || 128);
        return;
      }
      // パターン2: 単なる配列 [...]
      if (Array.isArray(parsed)) {
        setReadings(parsed);
        return;
      }
      throw new Error("JSON must be an array of readings or an object with { readings: [...] }");
    } catch (e: any) {
      setError(`JSON parse error: ${e?.message ?? e}`);
      setReadings(null);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleChooseFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleChooseFile(file);
  };

  const submit = async () => {
    try {
      setError("");
      setResult(null);
      if (!readings || readings.length === 0) throw new Error("Please upload readings JSON first");
      if (!device || !checkpoint) throw new Error("Device / Checkpoint PDA is required");
      if (chunk <= 0) throw new Error("chunkSize must be > 0");

      setSubmitting(true);
      const body = { devicePubkey: device, checkpointPubkey: checkpoint, chunkSize: chunk, readings };
      const res = await fetch("/api/finalize-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { ok: false, status: res.status, raw: text }; }
      if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">DePIN Demo: Upload JSON → 128-chunk ER commits</h1>
        <p className="text-sm text-gray-600">512件などの配列JSONをアップロードし、128件ごとに分割して IPFS→Merkle→commit (ER/L1) を連続実行します。</p>
      </header>

      {/* 入力 */}
      <section className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm font-medium">Device PDA</div>
          <input className="w-full border rounded p-2 font-mono" value={device} onChange={e=>setDevice(e.target.value)} placeholder="Device PDA"/>
        </label>
        <label className="block">
          <div className="text-sm font-medium">Checkpoint PDA</div>
          <input className="w-full border rounded p-2 font-mono" value={checkpoint} onChange={e=>setCheckpoint(e.target.value)} placeholder="Checkpoint PDA"/>
        </label>
      </section>

      <section className="grid md:grid-cols-3 gap-4 items-end">
        <label className="block">
          <div className="text-sm font-medium">Chunk Size（既定128）</div>
          <input type="number" min={1} className="w-full border rounded p-2" value={chunk} onChange={e=> setChunk(Number.isFinite(+e.target.value) ? parseInt(e.target.value, 10) : 128)} />
        </label>
        <div className="md:col-span-2">
          <div className="text-sm font-medium">JSONファイルをドロップ / 選択</div>
          <div onDrop={onDrop} onDragOver={(e)=>e.preventDefault()} className="border-2 border-dashed rounded p-4 text-sm text-gray-600 flex items-center justify-between gap-3">
            <div className="truncate">{readings ? `${total} readings loaded` : "Drop .json here or choose file"}</div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 border rounded" onClick={()=> fileInputRef.current?.click()}>Choose File</button>
              <input type="file" accept="application/json" ref={fileInputRef} className="hidden" onChange={onFileChange} />
            </div>
          </div>
        </div>
      </section>

      {/* プレビュー */}
      {readings && (
        <section className="space-y-2">
          <div className="text-sm text-gray-700">合計: <b>{total}</b> 件 / チャンク: <b>{chunk}</b> 件 → バッチ数: <b>{batches}</b></div>
          <details className="bg-gray-50 rounded p-3">
            <summary className="cursor-pointer text-sm">先頭5件プレビュー</summary>
            <pre className="text-xs overflow-x-auto mt-2">{JSON.stringify(readings.slice(0,5), null, 2)}</pre>
          </details>
        </section>
      )}

      {/* 実行ボタン */}
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={submitting || !readings} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
          {submitting ? "Submitting…" : "Run finalize-bulk"}
        </button>
        {submitting && <span className="text-sm text-gray-600">処理中…（数十秒かかる場合があります）</span>}
      </div>

      {/* 結果 / エラー */}
      {error && (
        <div className="text-red-600 text-sm">
          <div className="font-semibold mt-2">Error</div>
          <pre className="bg-red-50 p-3 rounded overflow-x-auto whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {result && (
        <section className="space-y-2">
          <div className="text-sm font-semibold">Result</div>
          <div className="text-sm text-gray-700">Total: {result.total} / Chunk: {result.chunkSize} / Batches: {result.batches} / Elapsed: {result.elapsedMs} ms</div>
          <div className="space-y-3">
            {Array.isArray(result.results) && result.results.map((r:any, idx:number)=> (
              <div key={idx} className="border rounded p-3 text-sm">
                <div className="font-medium">Batch {r.batch} — {r.count} items</div>
                <div className="mt-1">CID: {r.cid ? (<a className="underline" target="_blank" rel="noreferrer" href={`https://ipfs.io/ipfs/${r.cid}`}>{r.cid}</a>) : "-"}</div>
                <div>Root: <span className="font-mono break-all">{r.rootHex}</span></div>
                <div>Signature: {r.signature ? (<a className="underline" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${r.signature}?cluster=devnet`}>{r.signature}</a>) : "-"}</div>
                {r.executedOn && <div>Executed On: <b>{r.executedOn}</b></div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* JSONテキスト（任意で直接編集） */}
      <details className="bg-gray-50 rounded p-3">
        <summary className="cursor-pointer text-sm">アップロードしたJSON（読み取り専用ではありません）</summary>
        <textarea className="w-full border rounded p-2 mt-2 font-mono text-xs" rows={10} value={jsonText} onChange={(e)=> setJsonText(e.target.value)} onBlur={()=>{
          try{
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed)) setReadings(parsed);
            else if (parsed && Array.isArray(parsed.readings)) setReadings(parsed.readings);
          } catch {}
        }} />
      </details>
    </main>
  );
}

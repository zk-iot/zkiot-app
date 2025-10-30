'use client';
import { useEffect, useState } from 'react';

type Reading = {
  t_c_x100: number; // 温度 ×100
  rh_x100: number;  // 湿度 ×100
  p_pa: number;     // 気圧
  gas: number;      // ガス
  ts: number;       // UNIX秒
};

// .env（NEXT_PUBLIC_～）から読み込み（未設定なら見本値）
const ENV_DEVICE = process.env.NEXT_PUBLIC_DEVICE_PUBKEY ?? '5rDfR3p3zZhc4Lh13xAq5uNPNhJ3UfsX7BpyEYYkXYk3';
const ENV_CHECKPOINT = process.env.NEXT_PUBLIC_CHECKPOINT_PUBKEY ?? 'Fv2aHs6jJqW1oZAW4a8mLkJtWzGmHfUPgcAQ8eMJp5sG';

function makeSample(ok = true): Reading[] {
  const now = Math.floor(Date.now() / 1000);
  if (ok) {
    // 36.5℃/36.8℃ (≤37℃)
    return [
      { t_c_x100: 3650, rh_x100: 4500, p_pa: 101325, gas: 180, ts: now },
      { t_c_x100: 3680, rh_x100: 4600, p_pa: 101320, gas: 185, ts: now + 60 },
    ];
  }
  // 38.1℃ を含む（>37℃）
  return [
    { t_c_x100: 3810, rh_x100: 4700, p_pa: 101300, gas: 200, ts: now },
    { t_c_x100: 3650, rh_x100: 4500, p_pa: 101325, gas: 180, ts: now + 60 },
  ];
}

export default function Page() {
  // 初期値を「環境変数 or 見本値」でプリセット
  const [devicePubkey, setDevice] = useState<string>(ENV_DEVICE);
  const [checkpointPubkey, setCheckpoint] = useState<string>(ENV_CHECKPOINT);
  const [windowIndex, setWindowIndex] = useState<number>(0);
  const [json, setJson] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // ページ初回表示時にサンプル（≤37℃）を自動投入
  useEffect(() => {
    setJson(JSON.stringify(makeSample(true)));
  }, []);

  const setSampleOK = () => setJson(JSON.stringify(makeSample(true)));
  const setSampleNG = () => setJson(JSON.stringify(makeSample(false)));
  const prettyJSON = () => {
    try {
      setJson(JSON.stringify(JSON.parse(json), null, 2));
    } catch {
      // 無視（パース不能でも落とさない）
    }
  };

  const onFinalize = async () => {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      let readings: Reading[];
      try {
        readings = JSON.parse(json);
        if (!Array.isArray(readings)) throw new Error('Readings JSON must be an array');
      } catch (e: any) {
        throw new Error(`Readings JSON parse error: ${e?.message ?? e}`);
      }

      const res = await fetch('/api/finalize-window', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ devicePubkey, checkpointPubkey, windowIndex, readings }),
      });

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { ok: false, status: res.status, body: text }; }
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">DePIN Window Finalizer</h1>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="text-sm font-medium">Device PDA</div>
          <input className="w-full border rounded p-2" value={devicePubkey} onChange={e=>setDevice(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm font-medium">Checkpoint PDA</div>
          <input className="w-full border rounded p-2" value={checkpointPubkey} onChange={e=>setCheckpoint(e.target.value)} />
        </label>
      </div>

      <label className="block">
        <div className="text-sm font-medium">Window Index</div>
        <input
          type="number"
          className="w-full border rounded p-2"
          value={windowIndex}
          onChange={e=>setWindowIndex(Number.isFinite(+e.target.value) ? parseInt(e.target.value, 10) : 0)}
        />
      </label>

      <div className="flex items-center gap-2">
        <button onClick={setSampleOK} className="px-3 py-1 border rounded">Sample ≤37℃</button>
        <button onClick={setSampleNG} className="px-3 py-1 border rounded">Sample {'>'}37℃</button>
        <button onClick={prettyJSON} className="px-3 py-1 border rounded">Pretty JSON</button>
      </div>

      <label className="block">
        <div className="text-sm font-medium">Readings JSON（このウィンドウの生データ配列）</div>
        <textarea className="w-full border rounded p-2 font-mono" rows={8} value={json} onChange={e=>setJson(e.target.value)} />
      </label>

      <button
        onClick={onFinalize}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? 'Finalizing…' : 'Finalize Window (Pinata → Merkle → Commit)'}
      </button>

      {error && (
        <div className="text-red-600 text-sm">
          <div className="font-semibold mt-3">Error</div>
          <pre className="bg-red-50 p-3 rounded">{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 text-sm">
          <div className="font-semibold">Result</div>
          <pre className="bg-gray-50 p-3 rounded overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
          {result?.cid && (
            <div className="mt-2">
              IPFS: <a className="underline" href={`https://ipfs.io/ipfs/${result.cid}`} target="_blank" rel="noreferrer">{result.cid}</a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}


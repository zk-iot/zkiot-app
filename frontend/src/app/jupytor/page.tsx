"use client";
import { useState } from "react";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [txUrl, setTxUrl] = useState("");
  const [error, setError] = useState("");

  const handleSwap = async () => {
    setError("");
    setTxUrl("");
    setLoading(true);
    try {
      const res = await fetch("/api/swap", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTxUrl(data.txUrl);
      } else {
        setError(data.error || "Unknown error");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">SOL → USDC Swap</h1>
      <p className="text-sm text-gray-600">This will swap 0.001 SOL to USDC via Jupiter API.</p>
      <button
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        onClick={handleSwap}
        disabled={loading}
      >
        {loading ? "Swapping..." : "Swap SOL → USDC"}
      </button>
      {txUrl && (
        <p className="text-green-600">
          ✅ Success! View on: <a href={txUrl} target="_blank" className="underline">{txUrl}</a>
        </p>
      )}
      {error && <p className="text-red-600">❌ {error}</p>}
    </main>
  );
}
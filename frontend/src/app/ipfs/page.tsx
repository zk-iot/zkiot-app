"use client";

import { useState, useRef, ChangeEvent } from "react";
import Image from 'next/image';

export default function PinataFileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [cid, setCid] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputFile = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setCid("");
    setUrl("");
    setError(null);
  };

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const data = new FormData();
      data.append("file", file);

      const res = await fetch("/api/pinata", {
        method: "POST",
        body: data,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || "Upload failed");
      }

      const { cid, url } = await res.json();
      setCid(cid);
      setUrl(url);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Upload File to IPFS via Pinata</h1>

      <input
        type="file"
        ref={inputFile}
        onChange={handleChange}
        accept="image/*"
      />

      <br />
      <button
        onClick={uploadFile}
        disabled={!file || uploading}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "#0070f3",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
      >
        {uploading ? "Uploading..." : "Upload to IPFS"}
      </button>

      {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}

      {url && (
        <div style={{ marginTop: "2rem" }}>
          <p><strong>URL:</strong> <a href={url} target="_blank">{url}</a></p>
          <Image
           src={url}
           alt="Uploaded content"
           width={300}             // 実際の画像に合わせて調整可能
           height={300}            // 仮で同じにしています
           style={{ marginTop: "1rem", height: "auto" }}
          />
        </div>
      )}

      {cid && (
        <div style={{ marginTop: "1rem" }}>
          <p><strong>CID:</strong> {cid}</p>
        </div>
      )}
    </main>
  );
}
# Magic Block ER × DePIN — 128‑chunk zk acceleration

We split IoT sensor data into **fixed 128‑record chunks**, then perform **IPFS → Merkle Root → Solana commit**. This makes **circom/circomjs proving and verification fast *today***, so users experience **near‑instant Verify** after uploading data.

---

## ✨ Why 128?

* **Smaller circuits are faster**: In circom, constraints scale with circuit size. Instead of a single giant circuit (e.g., 10,000 records), running **128‑record circuits × N** keeps **compile/setup/prove/verify** costs low.
* **Parallel throughput**: Identical 128‑record circuits are easy to run **horizontally in parallel**, cutting end‑to‑end latency.
* **Trusted setup relief**: Phase 2 (circuit‑specific) grows costly for huge circuits. With a **fixed 128‑record template**, keys can be reused and failures are cheap to recover.
* **Immediate UX**: Chunks are independent, so we can **prove → verify → finalize** from the first chunk onward. Users feel “I uploaded and got verified right away.”

> See circom’s flow in [Getting Started / Proving Circuits](https://docs.circom.io/getting-started/proving-circuits/). Keeping circuits small directly reduces end‑to‑end latency in real systems.

---

## 🧩 Architecture

```
[ Sensors ] → [ Next.js /finalize-bulk ] → [ IPFS (CID) ]
                                   ↘  keccak Merkle Root
                                    ↘  Solana: commit_checkpoint(root) + Memo(CID)
```

* **Off‑chain**: Each 128‑record batch is pinned to IPFS (Pinata).
* **Integrity**: We build a keccak256 Merkle tree to compute `rootHex`.
* **On‑chain**: We call `iaq_er::commit_checkpoint(root)`. The Tx Memo stores the **CID** for traceability across off‑/on‑chain.
* **ER‑ready**: The submission path can be swapped to Magic Router SDK/API to execute on **Ephemeral Rollups (ER)**.

---

## ✅ What’s included

* `app/api/init/route.ts` — Initialize PDAs (`device/feed/score/checkpoint`).
* `app/api/finalize-window/route.ts` — Finalize any single window (IPFS → Merkle → commit).
* `app/api/finalize-bulk/route.ts` — **Split array into 128‑record chunks** and commit sequentially.
* `app/api/commit/route.ts` — Send Memo(CID) + `commit_checkpoint(root)`.
* `app/demo/page.tsx` — Upload UI (JSON → 128‑split → result list with CID/Root/Tx).
* `lib/pinata.ts`, `lib/merkle.ts`, `lib/anchor.ts` — Utilities.
* `programs/iaq_er` — Anchor program (`commit_checkpoint`, etc.).

---

## 🏁 Quick Start

### 1) Env

`.env.local`

```
# Solana / Program
PROGRAM_ID=H3vSYcufhZHyfhsVXUwfsMmov1XVfKhLSD6CuoNpecCp
SOLANA_CLUSTER_URL=https://api.devnet.solana.com
SOLANA_SECRET_BASE58=<your devnet keypair base58>
# MAGICBLOCK_ROUTER_URL=https://<router-endpoint>   # (optional: run on ER)

# IPFS (Pinata)
PINATA_JWT=<your pinata jwt>

# UI defaults
NEXT_PUBLIC_DEVICE_PUBKEY=<from /api/init>
NEXT_PUBLIC_CHECKPOINT_PUBKEY=<from /api/init>
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

### 2) Install

```
npm i
```

### 3) Initialize PDAs (one‑time)

```
curl -X POST http://localhost:3000/api/init
```

> Take `devicePda` / `checkpointPda` from the response and set them in `.env.local` or the UI.

### 4) Frontend demo

```
npm run dev
```

Open `http://localhost:3000/demo`. Upload a JSON file (e.g., `readings_512.json`). The UI will **split into 128‑record chunks**, then display **CID / Root / Tx Sig** for each commit.

### 5) API: single window

One window with 512 records in a single commit:

```bash
curl -X POST http://localhost:3000/api/finalize-window \
  -H 'content-type: application/json' \
  -d '{
    "devicePubkey":"<Device PDA>",
    "checkpointPubkey":"<Checkpoint PDA>",
    "windowIndex":0,
    "readings":[ ...512 readings... ]
  }'
```

### 6) API: 128‑chunk × N commits (recommended)

Create `finalize_bulk_input.json`:

```json
{
  "devicePubkey": "<Device PDA>",
  "checkpointPubkey": "<Checkpoint PDA>",
  "chunkSize": 128,
  "readings": [ /* 512+ readings array */ ]
}
```

Send:

```bash
curl -X POST http://localhost:3000/api/finalize-bulk \
  -H "content-type: application/json" \
  --data-binary @finalize_bulk_input.json
```

---

## 🔐 Verifiability 

* **Tx Memo stores the CID**, so anyone can fetch the IPFS JSON and cross‑check the on‑chain reference.
* **`rootHex`** can be recomputed independently and compared with the on‑chain commitment.
* **Partial finality**: Because we finalize 128‑record chunks, the **first batch verifies quickly**, delivering an immediate user experience.

---

## 🧠 zk rationale (circom/circomjs)

* **Fixed 128‑record circuits** keep **compile, Phase‑2 setup, key gen, proving, and verification** cheap compared to giant circuits.
* **Parallelism** reduces wall‑clock latency. For 10,000 records, run **78 jobs of 128** in parallel.
* **Fail‑fast & cheap retry** on a single chunk; easier participation for lighter nodes.
* Users feel **upload → verify** almost instantly — aligning with DePIN’s real‑world needs (scale, fairness, immediacy).

---

## 🔧 Swap to ER (optional)

* Replace the submit path (currently `/api/commit`) with **Magic Router SDK/API** to execute on ER and surface `executedOn: 'ER'`.
* Send Memo + `commit_checkpoint` as a two‑instruction transaction via `sendMany(...)`.

---

## 🛠 Troubleshooting

* `AccountNotInitialized` → Run `/api/init` first and use the returned PDAs.
* `bad secret key size` → Prefer `.env.local` **base58 (SOLANA_SECRET_BASE58)**. If using an array, ensure 64 elements.
* `404 /api/finalize-bulk` → Ensure the endpoint is present (see code in this repo).
* Slow IPFS → You may switch from Pinata to web3.storage if needed.

---

## 🗣 60‑sec Pitch

> We split sensor data into **fixed 128‑record chunks**, pin each to IPFS, commit the **Merkle Root** to Solana, and keep the **CID in the Tx Memo** for verifiable linkage. **128‑chunk circuits** make circom/circomjs proving and verification **fast today**. Instead of running a massive 10,000‑record circuit once, we run **128×N** in parallel and finalize incrementally — reducing trusted‑setup burden and delivering a **near‑instant Verify** experience.

---

## License

MIT

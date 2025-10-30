# Mobile‑Attested zk‑IoT with Proof‑to‑Pay — **MVP**

> **Device Attestation (Google Play Integrity) × Sensor‑side/Edge ZK × Minimal On‑Chain Evidence (Solana)**
> Share **pass/fail only** — no raw data leaves the device. Designed for **non‑overlapping, serial integration** with **Docomo**’s ID / distribution / network trust layer.

---

## TL;DR 

* **Docomo’s lane**: *Who measured it* — device authenticity (SIM/eSIM), distribution/KYC at scale, carrier‑grade network.
* **Our +α**: *What requirement was met* — translate business rules into **ZK claims** and anchor **pass/fail** on‑chain.
* Devices **do not export raw sensor data**. Pre‑process at the edge → produce a **ZK claim** → publish **pass/fail only** as a minimal on‑chain anchor (SAS/Memo).

---

## Why it matters 

* **Privacy‑by‑Design**: Only pass/fail is shared; source data (sensor traces, location history) never leaves the device.
* **Operational realism**: Offline‑first patterns (store‑and‑forward, re‑prove on failure). Templates for domain claims. Optional policy connectors (insurance/finance) can be added later.
* **Extensible**: Clean separation — Docomo covers **who measured**; we cover **what passed** with domain ZK + minimal evidence.

---

## Non‑overlapping value 

* **Docomo**: Mobile ID / attestation, user distribution & KYC, network‑layer reliability.
* **Us**: Domain‑specific **verifiable‑claim design**, **edge ZK generation**, **minimal on‑chain evidence** (anchor only).
* **Summary**: **Docomo = “who measured”**, **Us = “what requirement passed.”**

---

## Architecture (MVP)

```
[Android] ─ Play Integrity Token (JWE/JWS) ─▶ [Next.js/Express API]
   │                    └ Decode on server (prod) / Dummy for this demo
   ▼
 sasPayload (minimal summary: pkg/app/device/ts/nonce_hash/jws_hash)
   │
   └─▶ [Solana Devnet: Memo Program]  ← write minimal anchor (TxSig = attestation ID)
```

> For the hackathon MVP we anchor to **Memo Program** (zero external deps). Later we can swap `issue.ts` to the official **SAS SDK** without changing the `anchor.ts` normalization.

---

## Repository layout (key files)

```
/app/api/... or /src/index.ts    # API entry (Express/Next). This repo uses Express.
/src/sas/anchor.ts               # Canonicalize + hash sasPayload (core of MVP)
/src/sas/issue.ts                # Issue minimal on‑chain anchor (get TxSig)
/android (optional)              # Android app to obtain Play Integrity token
.env                              # ISSUER_SECRET (devnet key), RPC_URL
```

---

## Quick Start 

### 0) Install dependencies

```bash
npm i
npm i @solana/web3.js @solana/spl-memo bs58 dotenv
```

### 1) Issuer key (devnet)

Put these in **.env** (already prepared during setup):

```env
ISSUER_SECRET=<Base58 secret>   # 64 bytes (seed||pub) encoded in Base58
RPC_URL=https://api.devnet.solana.com
```

If needed, top up devnet SOL via faucet.

### 2) Start the server

```bash
npm run server:dev
# → ✅ Server listening on http://localhost:3000
```

### 3) Issue with dummy JSON (works without Android)

**Windows (cmd) one‑liner**:

```cmd
curl -X POST http://localhost:3000/api/sas/issue -H "Content-Type: application/json" -d "{\"sasPayload\": {\"schema\": \"android.play.integrity.v1\", \"subject\": \"USER_WALLET_PUBKEY\", \"data\": {\"pkg\": \"com.example.myapplication\", \"verdicts\": {\"app\": \"PLAY_RECOGNIZED\", \"device\": [\"MEETS_DEVICE_INTEGRITY\"]}, \"ts\": 1739779200123, \"nonce_hash\": \"0x3f2a8c0b9d7e4e1a5c0f2e9d1b7a3c6d8e0f11223344556677889900aabbccdd\", \"jws_hash\": \"0x9e5b7a6c1d2e3f40516273849abcdeff00112233445566778899aabbccddeeff\"}, \"meta\": {\"taskId\": \"A-123\"}}}"
```

**Expected response**

```json
{
  "ok": true,
  "txSig": "2HXyJ4No...",
  "anchor": { "v":1, "schema":"android.play.integrity.v1", "subject":"USER_WALLET_PUBKEY", ... },
  "issuer": "EnPp2DZK..."
}
```

Open `txSig` in **Solana Explorer (Devnet)** → see **Program: Memo** with the anchored JSON.

---

## Android PoC (optional for live demo)

* **Buttons**: `Get Attestation` (Play Integrity) → `Decode on server` (dummy or real)
* **Endpoints**:
  `serverUrl = http://<PC-IP>:3000/api/attest`
  `decodeEndpoint = http://<PC-IP>:3000/api/decode` (dummy acceptable for MVP)
* **Output**: Build **sasPayload** → POST to `/api/sas/issue` → display **TxSig** on screen.

> Dev tips: allow HTTP during development (`usesCleartextTraffic=true`) or use an HTTPS tunnel (ngrok). Ensure **Cloud Project Number** matches Play Console if using real decoding.

---

## Security model (MVP)

* **Device authenticity**: Google Play Integrity (JWE/JWS) verified/decoded on server.
* **Linkage**: `nonce_hash` + `jws_hash` minimally tie the ZK claim to the attestation token.
* **On‑chain**: Record a **minimal anchor** only—canonicalized subset + full‑payload hash `h`—preserving privacy.
  Off‑chain evidence can be re‑joined via `h` when needed.

---

## Operational notes

* **RPC**: Devnet (`https://api.devnet.solana.com`)
* **Memo Program ID**: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
* **Minimal fields required**: `pkg`, `app`, `device[]`, `ts`, `nonce_hash`, `jws_hash`



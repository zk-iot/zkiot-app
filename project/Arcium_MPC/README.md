# zkIoT SLA — Minimal Encrypted SLA Checks on Solana (Arcium + Anchor)

**TL;DR:** We turn raw IoT data into **5 encrypted window summaries** and verify **“Pass ≥ X%?”** via **Arcium MPC**.  
On-chain sees only ciphertext + a single boolean result. **No raw data ever leaves the client.**  
Tiny, gas-friendly, and production-viable.

---

## Why this matters 

- **Everything is public on Solana — but it doesn’t have to be.** This project shows a **practical, minimal** way to integrate Arcium’s encrypted compute into a real use case: **SLA verification** for IoT fleets.
- **Credible neutrality:** IoT vendors prove reliability **without revealing** customer/device telemetry.
- **On-chain enforcement with off-chain privacy:** A clean separation that still unlocks **programmatic payouts**, **slashing**, or **access gating** based on a private check.

---

## What it does

- Client aggregates a CSV into **5 numbers** per time window:
  - `unique_ts, valid, anomalies, expect, budget`
- Client encrypts these with **RescueCipher** (each → 32 bytes).
- The program queues Arcium with **strict, compact args** and receives one encrypted output:
  - **Boolean pass/fail** (or an encrypted payout), plus a nonce.
- Client decrypts the result; the chain only sees the **single bit of truth**.

> Outcome: **“SLA ≥ X%?”** revealed; **everything else stays secret.**

---

## Why Arcium (and why now)

- **Encrypted supercomputer for Solana:** Fast, scalable MPC that fits the L1’s throughput expectations.
- **Design space unlock:** Any decision rule (SLA policy, ZK-like guardrails, reputation) while keeping inputs confidential.
- **Production viability:** We aggressively minimized tx size, stack usage, and account bloat to survive real-world constraints.

---


## Architecture (bite-size)

1. **Client (off-chain):**
   - Read CSV → aggregate **5 numbers**
   - x25519 → shared secret with MXE
   - Encrypt values (RescueCipher) → `[u8; 32] × 5`
   - Send to program (queue)

2. **Arcium (MPC inside):**
   - Decrypt → apply SLA policy (e.g., anomalies gate, pass ratio)
   - Re-encrypt result for client key → return via callback

3. **Program (on-chain):**
   - Emits event with (ciphertext, nonce)
   - Stores no plaintext

4. **Client:**
   - Decrypt result → **pass/fail** (or payout amount)

---

## Demo (localnet first — no token waste)

**One time:**
```bash
# 0) Localnet
solana-test-validator --reset --quiet &
sleep 5
solana config set --url http://127.0.0.1:8899
solana airdrop 10

# 1) Install (yarn only)
yarn install
```

**Build & deploy:**
```bash
# 2) Build Arcium circuits
arcium build

# 3) Build Anchor
anchor build

# 4) Deploy to localnet
anchor deploy --provider.cluster localnet
```

**Run E2E:**
```bash
# 5) Use provided sample
CSV=./tests/sample.csv npx ts-node --transpile-only tests/payout_window.ts
```

What you’ll see:
- Comp-def init/finalize
- MXE key exchange
- Encrypt 5 values → queue → finalize
- **Event with encrypted result**
- **Client decrypts → “SLA pass” or “payout”**

> Switch to devnet later by changing `ANCHOR_PROVIDER_URL` and keeping **yarn** as the package manager.

---

## Keeping it tiny (Solana constraints)

- Each encrypted datum is **32 bytes**.
- We send **just 5** + pubkey + nonce; the whole tx stays within the **~1232-byte** payload.
- Avoid giant stack vars in circuits or program code (common source of “stack offset exceeded 4096” errors).
- Pack multiple fields into a **single struct** when possible to shave arguments.

---

## Security/Privacy posture

- **No raw telemetry** ever on-chain or visible to operators.
- Only the **boolean** (or payout) is revealed; everything else remains encrypted.
- Replace SLA policy inside the circuit to match your domain rules without changing the on-chain API.

---


## Repo map

```
.
├─ Anchor.toml                 # yarn, localnet/devnet set
├─ programs/
│  └─ zkiot_mpc/src/lib.rs     # Anchor program (queues + callbacks)
├─ encrypted-ixs/
│  └─ src/lib.rs               # Arcium circuit (SLA policy)
├─ tests/
│  ├─ sample.csv               # Example data
│  └─ payout_window.ts         # E2E script
└─ README.md
```

---

## License

MIT (or your preference).

---



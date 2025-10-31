# zkIoT – Mobile-Attested, Privacy-Preserving IoT Proofs on Solana

> **Show proofs, not secrets.**
> Device attestation (mobile & hardware) × edge ZK/MPC × minimal on-chain anchors (Solana)

---

## Overview

zkIoT is an **IoT platform that allows verification of facts (pass/fail)** without exposing raw data.
It ensures **authenticity of real devices** using Google Play Integrity / ATECC608A, executes **ZK/MPC** at the edge, and records **only minimal proofs (Merkle Root / Memo / cNFT receipt)** on Solana.

* **Device → Proof**: Generate pass/fail results without revealing raw logs
* **Verify → Pay**: Automatic settlement upon success (via Actions/Blinks integration)
* **Composable**: Integrates with SAS / Magic Block ER / Arcium / Metaplex

---

## 1. Repositories & Demo Apps

| Purpose                                 | Link                   |
| --------------------------------------- | ---------------------- |
| **Main Hackathon App**                  | `apps/hackathon`       |
| **Core Program**                        | `programs/zkiot_core`  |
| **Mobile-Attested zk-IoT (SAS)**        | `apps/mobile-attested` |
| **128-Chunk zk Accel (Magic Block ER)** | `apps/zk-128`          |
| **Private SLA via MPC (Arcium)**        | `apps/mpc-sla`         |
| **Receipts as cNFT (Metaplex)**         | `apps/receipts`        |

---

## 2. Architecture Overview

| Layer              | Tech                                         | Description                                                                            |
| ------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Attestation**    | Google Play Integrity, ATECC608A, SAS        | Proves *who measured it* (mobile/IoT authenticity); anchors device identity on Solana. |
| **Edge Compute**   | ZK (circom/circomjs, 128-record template)    | Generates pass/fail claims without exposing raw data; small, reusable circuits.        |
| **Private SLA**    | Arcium MPC                                   | Computes `Pass ≥ X%` on encrypted metrics; outputs only a boolean (or payout).         |
| **Data Integrity** | IPFS (Pinata) + keccak Merkle Tree           | Pins chunked data; produces CID and Merkle root for on-chain reference.                |
| **On-Chain**       | Anchor, iaq_er::commit_checkpoint, Memo(CID) | Commits Merkle root; stores minimal references; triggers actions (Verify → Pay).       |
| **Receipts / UX**  | Metaplex compressed NFTs, Actions/Blinks     | Issues low-cost pass/fail receipts; enables one-click verification & payments.         |

---

## 3. Track-Specific Submissions

### SAS (Solana Attestation Service)

* **Goal**: Enable L1 verification of “who measured it” (device/IoT authenticity)
* **Deliverables**: Attested payload → SAS verification → `commit_checkpoint` integration

### Privy

* **Goal**: Simplify user/key management and provide a **shareable verification link UX**
* **Deliverables**: Privy-integrated verification view (displays pass/fail only)

### Magic Block (Ephemeral Rollups / Router)

* **Goal**: Route 128-chunk submissions through **ER** to optimize throughput
* **Deliverables**: Replace `/api/commit` destination with **Magic Router SDK/API**

### Arcium (Secure Computation / MPC)

* **Goal**: Use only **five encrypted metrics** to determine **SLA: Pass≥X%** privately
* **Deliverables**: `encrypted-ixs` (circuits), `zkiot_mpc` (queue/callback)

### Metaplex (Compressed NFTs)

* **Goal**: Issue and distribute pass/fail receipts cost-effectively via **state compression**
* **Deliverables**: Implement `receipt.mint_compressed()` and verification UI




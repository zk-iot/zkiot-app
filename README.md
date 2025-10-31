# zkIoT – Protect Privacy while Proving Compliance

> **Show proofs, not secrets.**


---

## Overview

Every time you need to build trust, you’re asked for detailed data, endless paperwork and emails, and even on-site checks. With overseas partners, explanations drag on; internal approvals and payments get delayed. You want to protect secrets, yet disclosure costs and audit workload keep growing.

zk-IoT lets you show only the fact of compliance—without exposing data—via a shareable link. Partners can verify in one click, approvals get shorter, and payments run Pass→Pay under pre-agreed terms. Audits respond instantly with verifiable history. — Keep secrets inside. Distribute only trust.

---

## 1. Repositories & Demo Apps

| Purpose                                 | Link                   |
| --------------------------------------- | ---------------------- |
| **Main Hackathon App**                  | `frontend`       |
| **Mobile-Attested zk-IoT (SAS)**        | `project/Docomo-Attestation` |
| **128-Chunk zk Accel (Magic Block ER)** | `project/Docomo-Attestation8`          |
| **Private SLA via MPC (Arcium)**        | `project/Docomo-Attestation`         |
| **Demo Web**                            | `apps/receipts`        |

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

### Magic Block (Ephemeral Rollups / Router)

* **Goal**: Route 128-chunk submissions through **ER** to optimize throughput
* **Deliverables**: Replace `/api/commit` destination with **Magic Router SDK/API**

### Arcium (Secure Computation / MPC)

* **Goal**: Use only **five encrypted metrics** to determine **SLA: Pass≥X%** privately
* **Deliverables**: `encrypted-ixs` (circuits), `zkiot_mpc` (queue/callback)

### Privy (Wallets)

* **Goal**: Simplify user/key management and provide a **shareable verification link UX**
* **Deliverables**: Privy-integrated verification view (displays pass/fail only)

### Metaplex (Compressed NFTs)

* **Goal**: Issue and distribute pass/fail receipts cost-effectively via **state compression**
* **Deliverables**: Implement `receipt.mint_compressed()` and verification UI

### Metaplex (RPC)

* **Goal**: Issue and distribute pass/fail receipts cost-effectively via **state compression**
* **Deliverables**: Implement `receipt.mint_compressed()` and verification UI

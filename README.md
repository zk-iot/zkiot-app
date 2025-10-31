# zkIoT – Protect Privacy while Proving Compliance

> **Encrypted sensor data in, share a simple proof out — no raw data revealed.**

<img src="https://github.com/user-attachments/assets/cf77cb35-6af1-41ad-bc17-0e9b623dd7e7" width="800" />


---

## Overview

Every time you need to build trust, you’re asked for detailed data, endless paperwork and emails, and even on-site checks. With overseas partners, explanations drag on; internal approvals and payments get delayed. You want to protect secrets, yet disclosure costs and audit workload keep growing.

zk-IoT lets you show only the fact of compliance—without exposing data—via a shareable link. Partners can verify in one click, approvals get shorter, and payments run Pass→Pay under pre-agreed terms. Audits respond instantly with verifiable history. — Keep secrets inside. Distribute only trust.

---

## 1. Repositories & Demo Apps

| Purpose                                 | Link                   |
| --------------------------------------- | ---------------------- |
| **Main Hackathon App**                  | [frontend](https://github.com/zk-iot/zkiot-app/tree/main/frontend)      |
| **Mobile-Attested zk-IoT (SAS)**        | [project/Docomo-Attestation](https://github.com/zk-iot/zkiot-app/tree/main/project/Docomo-Attestation) |
| **128-Chunk zk Accel (Magic Block ER)** | [project/MagicBlock_ER](https://app.zk-iot.xyz/](https://github.com/zk-iot/zkiot-app/tree/main/project/MagicBlock_ER))         |
| **Private SLA via MPC (Arcium)**        | [project/Arcium_MPC](https://app.zk-iot.xyz](https://github.com/zk-iot/zkiot-app/tree/main/project/Arcium_MPC)/)        |
| **Demo App** 　　　　　　　　　　　　　　　| [Demo App](https://app.zk-iot.xyz/) |

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
| **Token**          | SPL Tokens, Actions/Blinks                   | Automates pass→pay and programmable payouts for verified proofs.                            |

---

## 3. Track-Specific Submissions

### SAS (Solana Attestation Service)

* **Goal**: Enable L1 verification of “who measured it” (device/IoT authenticity)
* **Deliverables**: Attested payload → SAS verification → `commit_checkpoint` integration
* **Link▶**:https://github.com/zk-iot/zkiot-app/tree/main/project/Docomo-Attestation/frontend-play-integrity-decode/src/sas
* **Transaction▶**:https://explorer.solana.com/tx/XS9Tgp3kzKrHZGZkaLQCkPcVk8s5eYWEBU99PL2fDyfze4y1zT4jHfCzSrz4rem4vTQQVJ2282gU3HZKJoS1V3G?cluster=devnet


### Magic Block (Ephemeral Rollups / Router)

* **Goal**: Route 128-chunk submissions through **ER** to optimize throughput
* **Deliverables**: Replace `/api/commit` destination with **Magic Router SDK/API**
* **Link▶**:https://github.com/zk-iot/zkiot-app/blob/main/project/MagicBlock_ER/iaq_er/programs/iaq_er/src/lib.rs
* **Transaction▶**:https://explorer.solana.com/tx/emjaKVvNhX2e8gyd8j6tbtmeDxLQXS5u81anifiwRD1kiVV69CcANNxv3X1Zpvf2fhx6gQ3yikfV7kxA8UYVvYb?cluster=devnet

### Arcium (Secure Computation / MPC)

* **Goal**: Use only **five encrypted metrics** to determine **SLA: Pass≥X%** privately
* **Deliverables**: `encrypted-ixs` (circuits), `zkiot_mpc` (queue/callback)
* **Link▶**:https://github.com/zk-iot/zkiot-app/tree/main/project/Arcium_MPC

### Privy (Wallets)

* **Goal**: Simplify user/key management and provide a **shareable verification link UX**
* **Deliverables**: ntegrated Google Auth and Email authentication via Privy for smooth user onboarding and verification.
* **Link▶**:https://github.com/zk-iot/zkiot-app/blob/main/frontend/src/lib/privy.tsx

### Metaplex (Compressed NFTs)

* **Goal**: Issue and distribute pass/fail receipts cost-effectively via **state compression**
* **Deliverables**: Implement `receipt.mint_compressed()` and verification UI
* **Link▶**:https://github.com/zk-iot/zkiot-app/blob/main/frontend/src/app/api/mint/route.ts

### Triton One (RPC)
* **Goal**: Provide high-performance RPC endpoints to read minimal on-chain anchors  from Solana for zkIoT verifiers.
* **Deliverables**: RPC method examples for querying commit_checkpoint events, sample indexer script.


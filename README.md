# zkIoT – Mobile‑Attested, Privacy‑Preserving IoT Proofs on Solana

> **Show proofs, not secrets.**  
> Device attestation (mobile & hardware) × edge ZK/ MPC × minimal on‑chain anchors (Solana).

---

## 概要
zkIoT は、**生データを開示せず**に「基準を満たした事実（pass/fail）」だけを検証可能にする IoT プラットフォームです。Google Play Integrity / ATECC608A による**実デバイスの真正性**を担保し、エッジで **ZK/MPC** を実行。Solana には **最小限の証跡（Merkle Root / Memo / cNFT レシート）** のみを記録します。

- **Device → Proof**: 生ログを出さずに合否を生成
- **Verify → Pay**: 合格で自動清算（Actions/Blinks 連携）
- **Composable**: SAS / Magic Block ER / Arcium / Metaplex と統合

---

## 1. Repositories & Demo Apps

| Purpose | Link | Overview |
|---|---|---|
| **Main Hackathon App** | `apps/hackathon` | Next.js demo for upload → 128‑split → CID/Root/Tx; Verify UI for SAS / receipts. |
| **Core Program** | `programs/zkiot_core` | Anchor program: `commit_checkpoint`, receipts (compressed NFT), events. |
| **Mobile‑Attested zk‑IoT (SAS)** | `apps/mobile-attested` | Play Integrity / ATECC608A → SAS → minimal on‑chain anchor. |
| **128‑Chunk zk Accel (Magic Block ER)** | `apps/zk-128` | 128‑record split; IPFS → Merkle → Solana; ER‑ready submit path. |
| **Private SLA via MPC (Arcium)** | `apps/mpc-sla` | Encrypt 5 metrics → Arcium MPC checks Pass≥X% → on‑chain boolean. |
| **Receipts as cNFT (Metaplex)** | `apps/receipts` | Mint compressed pass/fail receipts; share link / QR for buyers. |

### Demo
- `/demo` — JSON upload → 128 split → results (CID / Root / Tx)
- `/verify` — Verify SAS / cNFT receipt link

---

## 2. Architecture Overview

| Layer | Tech | What It Does |
|---|---|---|
| **Attestation** | Google Play Integrity, ATECC608A, SAS | Proves *who measured it* (mobile/IoT authenticity); anchors device identity on Solana. |
| **Edge Compute** | ZK (circom/circomjs, 128‑record template) | Creates pass/fail claims without exposing raw data; small, reusable circuits. |
| **Private SLA** | Arcium MPC | Computes `Pass ≥ X%` on encrypted metrics; outputs only a boolean (or payout). |
| **Data Integrity** | IPFS (Pinata) + keccak Merkle Tree | Pins chunked data; produces CID and Merkle root for on‑chain reference. |
| **On‑Chain** | Anchor, iaq_er::commit_checkpoint, Memo(CID) | Commits Merkle root; stores minimal references; triggers actions (Verify → Pay). |
| **Receipts / UX** | Metaplex compressed NFTs, Actions/Blinks | Issues low‑cost pass/fail receipts; one‑click verification & payments. |

---

## 3. Track‑Specific Submissions

### SAS（Solana Attestation Service）
- **Goal**: 「誰が測ったか」を L1 で検証可能に（端末/IoT の真正性）
- **Deliverables**: attested payload → SAS 検証 → `commit_checkpoint` 連携

### Privy
- **Goal**: ユーザ管理/鍵管理を簡素化し、**共有リンクで検証**できる UX を提供
- **Deliverables**: Privy 連携の検証ビュー（pass/fail のみ表示）

### Magic Block（Ephemeral Rollups / Router）
- **Goal**: 128‑chunk 提出を **ER** にルーティングしてスループット最適化
- **Deliverables**: `/api/commit` の送信先を **Magic Router SDK/API** にスワップ

### Arcium（秘密計算 / MPC）
- **Goal**: **5 値メトリクス**のみで **SLA: Pass≥X%** を暗号のまま判定
- **Deliverables**: `encrypted-ixs`（回路）、`zkiot_mpc`（キュー/コールバック）

### Metaplex（Compressed NFTs）
- **Goal**: 合否レシートを **state compression** で安価に発行・配布
- **Deliverables**: `receipt.mint_compressed()` 実装と検証 UI

---

> この README は提出用の最小構成です。各リポジトリ/デモのリンク・環境変数・起動手順は `README.<project>.md` に分割して追記してください。


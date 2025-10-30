// 実行例: CSV=./tests/sample.csv npx ts-node --transpile-only tests/zkiot_mpc.ts
// 依存: yarn add -D ts-node @types/node ; yarn add csv-parse @coral-xyz/anchor @solana/web3.js @arcium-hq/client

import * as anchor from "@coral-xyz/anchor";
import type { Program, IdlEvents } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ZkiotMpc } from "../target/types/zkiot_mpc";
import {
  awaitComputationFinalization,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  // uploadCircuit,  // ← 再アップロードは使わない
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { parse } from "csv-parse/sync";

/* ========= 固定名 ========= */
const IX_NAME = "iot_score";

/* ========= パラメータ ========= */
const EXPECT_SAMPLES = 60;
const BUDGET = 100;
const THRESH_DTEMP = 1000;
const THRESH_DPRESS = 150;

// ★重要: Raw回路は「既に存在」前提。アップロードは完全スキップ。
const TRY_UPLOAD_RAW = true;

// Anchorマクロ用に .arcis は programs/zkiot_mpc/build/iot_score_testnet.arcis に配置済みであること
const RAW_CIRCUIT_PATH = "programs/zkiot_mpc/build/iot_score_testnet.arcis";

// Raw回路アカウントの目安Lamports（既存なら不足時のみ補填）
const RAW_ACC_MIN_LAMPORTS = 0.2 * anchor.web3.LAMPORTS_PER_SOL;

/* ========= CSV 集計 ========= */

type Row = {
  deviceId: string;
  ts: string;
  g_i: string;
  h_i: string;
  p_i: string;
  t_i: string;
};

function computeWindowSummary(csvPath: string) {
  const text = fs.readFileSync(csvPath, "utf8");
  const rows: Row[] = parse(text, { columns: true, trim: true });
  rows.sort((a, b) => Number(a.ts) - Number(b.ts));

  const filtered =
    rows.length > 0 && "deviceId" in rows[0]
      ? rows.filter((r) => (r.deviceId || "").trim() === "test_0914")
      : rows;

  let unique_ts = 0;
  let lastTs: number | null = null;
  for (const r of filtered) {
    const ts = Number(r.ts) >>> 0;
    if (lastTs === null || ts !== lastTs) {
      unique_ts += 1;
      lastTs = ts;
    }
  }

  let anomalies = 0;
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    const dt = Math.abs((Number(curr.t_i) | 0) - (Number(prev.t_i) | 0));
    const dp = Math.abs((Number(curr.p_i) | 0) - (Number(prev.p_i) | 0));
    if (dt > THRESH_DTEMP) anomalies += 1;
    if (dp > THRESH_DPRESS) anomalies += 1;
  }

  const valid = filtered.length;
  return { unique_ts, valid, anomalies, expect: EXPECT_SAMPLES, budget: BUDGET };
}

function toBigints(s: { unique_ts: number; valid: number; anomalies: number; expect: number; budget: number; }): bigint[] {
  return [
    BigInt(s.unique_ts >>> 0),
    BigInt(s.valid >>> 0),
    BigInt(s.anomalies >>> 0),
    BigInt(s.expect >>> 0),
    BigInt(s.budget >>> 0),
  ];
}

function encryptAsBytes32(cipher: any, nums: bigint[], nonce: Uint8Array): number[][] {
  const ct: Uint8Array[] = cipher.encrypt(nums, nonce);
  return ct.map((u8) => Array.from(u8));
}

function randomNonce16(): Uint8Array {
  return anchor.web3.Keypair.generate().publicKey.toBytes().slice(0, 16);
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

/* ========= PDA ヘルパ ========= */

function deriveCompDefPda(programId: PublicKey, ixName: string): PublicKey {
  const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const off = getCompDefAccOffset(ixName);
  const arciumPid = getArciumProgAddress();
  return PublicKey.findProgramAddressSync([baseSeed, programId.toBuffer(), off], arciumPid)[0];
}

// RawCircuitAccount: [baseSeed, programId, offset(4LE), rawIndex(1B)]
function deriveRawCircuitAccount(programId: PublicKey, ixName: string, rawIndex = 0): PublicKey {
  const baseSeed = getArciumAccountBaseSeed("RawCircuitAccount");
  const off = getCompDefAccOffset(ixName);
  const arciumPid = getArciumProgAddress();
  const idx = Buffer.from([rawIndex & 0xff]);
  return PublicKey.findProgramAddressSync([baseSeed, programId.toBuffer(), off, idx], arciumPid)[0];
}

/* ========= Rawアカウントの残高確保（不足時のみ）========= */

async function ensureRawCircuitFunded(
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  rawAcc: PublicKey,
  minLamports = RAW_ACC_MIN_LAMPORTS
) {
  const info = await provider.connection.getAccountInfo(rawAcc);
  const cur = info ? info.lamports : 0;
  if (cur >= minLamports) {
    console.log("raw circuit account already sufficiently funded.");
    return;
  }
  const need = Math.ceil(minLamports - cur);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: rawAcc,
      lamports: need,
    })
  );
  const sig = await provider.sendAndConfirm(tx, [owner], { commitment: "confirmed" });
  console.log(`✓ funded raw circuit account (+${(need / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL): ${sig}`);
}

/* ========= 実行 ========= */

(async () => {
  try {
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const program = (anchor.workspace as any).ZkiotMpc as Program<ZkiotMpc>;

    console.log("RPC:", (provider.connection as any)._rpcEndpoint);
    console.log("Program:", program.programId.toBase58());

    // comp-def PDA
    const compDefPDA = deriveCompDefPda(program.programId, IX_NAME);
    const compDefInfo = await provider.connection.getAccountInfo(compDefPDA);
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    if (!compDefInfo) {
      console.log("comp-def not found → init…");
      const sig = await program.methods
        .initIotScoreCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
      console.log("init comp-def sig:", sig);
    } else {
      console.log("comp-def exists:", compDefPDA.toBase58());
    }

    // Raw回路アカウント（index=0 を既存前提で使用）
    const rawAcc = deriveRawCircuitAccount(program.programId, IX_NAME, 0);
    console.log("rawCircuitAccount:", rawAcc.toBase58());
    await ensureRawCircuitFunded(provider, owner, rawAcc, RAW_ACC_MIN_LAMPORTS);

    // ★アップロードは完全スキップ（既存Rawをそのまま使う）
    if (TRY_UPLOAD_RAW) {
      console.log("※ 現在は再アップロードを禁止しています。TRY_UPLOAD_RAW=false のままにしてください。");
    } else {
      console.log("TRY_UPLOAD_RAW=false → upload をスキップ");
      // 念のため .arcis が Anchor マクロ用の場所にあるか確認
      if (!fs.existsSync(RAW_CIRCUIT_PATH)) {
        console.warn(`WARN: ${RAW_CIRCUIT_PATH} が見つかりません。anchor build 前に配置してください。`);
      }
    }

    // comp-def finalize（冪等）
    const offLE = Buffer.from(getCompDefAccOffset(IX_NAME)).readUInt32LE();
    const finalizeTx = await buildFinalizeCompDefTx(provider, offLE, program.programId);
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = blockhash;
    finalizeTx.lastValidBlockHeight = lastValidBlockHeight;
    finalizeTx.sign(owner);
    await provider.sendAndConfirm(finalizeTx, [owner], { commitment: "confirmed" });
    console.log("✓ comp-def finalized");

    // MXE鍵交換
    const mxePubKey = await getMXEPublicKey(provider, program.programId);
    if (!mxePubKey) throw new Error("MXE public key is null.");
    const sk = x25519.utils.randomSecretKey();
    const pk = x25519.getPublicKey(sk);
    const shared = x25519.getSharedSecret(sk, mxePubKey);
    const cipher = new RescueCipher(shared);

    // CSV → サマリ5値 → 暗号化
    const csvPath = process.env.CSV || "./tests/sample.csv";
    const summary = computeWindowSummary(csvPath);
    console.log("Summary:", summary);

    const nums = toBigints(summary);
    const nonce = randomNonce16();
    const ciphertexts = encryptAsBytes32(cipher, nums, nonce); // number[5][32]

    // イベント待ち（IotEvent / 180秒）
    type Events = IdlEvents<(typeof program)["idl"]>;
    const awaitEvent = async <E extends keyof Events>(name: E, timeoutMs = 180_000): Promise<Events[E]> => {
      let id: number;
      let timer: NodeJS.Timeout;
      const ev = await new Promise<Events[E]>((res, rej) => {
        id = program.addEventListener(name as any, (e) => {
          if (timer) clearTimeout(timer);
          res(e);
        });
        timer = setTimeout(() => {
          program.removeEventListener(id).catch(() => {});
          rej(new Error(`Event ${String(name)} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      await program.removeEventListener(id);
      return ev;
    };
    const iotEventP = awaitEvent("iotEvent" as any);

    // queue に必要なPDA類
    const rnd8 = anchor.web3.Keypair.generate().publicKey.toBytes().slice(0, 8);
    const computationOffset = new anchor.BN(Buffer.from(rnd8).readBigUInt64LE().toString());

    const computationAccount = getComputationAccAddress(program.programId, computationOffset);
    const mxeAccount = getMXEAccAddress(program.programId);
    const mempoolAccount = getMempoolAccAddress(program.programId);
    const executingPool = getExecutingPoolAccAddress(program.programId);

    // cluster
    const mxeAcc = await program.account.mxeAccount.fetch(mxeAccount);
    const clusterOffset: number | null = (mxeAcc as any).cluster ?? null;
    if (clusterOffset === null) throw new Error("MXE account has no cluster set.");
    const clusterAccount = getClusterAccAddress(clusterOffset);

    console.log("computationAccount:", computationAccount.toBase58());
    console.log("clusterAccount    :", clusterAccount.toBase58());
    console.log("mempoolAccount    :", mempoolAccount.toBase58());
    console.log("executingPool     :", executingPool.toBase58());
    console.log("compDefAccount    :", compDefPDA.toBase58());

    // queue（引数順：ciphertexts, pubkey, nonce → Rust側シグネチャと一致）
    try {
      const queueSig = await program.methods
        .iotScore(
          computationOffset,
          ciphertexts as any,
          Array.from(pk),
          new anchor.BN(deserializeLE(Uint8Array.from(nonce)).toString())
        )
        .accountsPartial({
          computationAccount,
          clusterAccount,
          mxeAccount,
          mempoolAccount,
          executingPool,
          compDefAccount: compDefPDA,
        })
        .rpc();
      console.log("queue sig:", queueSig);
    } catch (e: any) {
      // デバッグ補助: AnchorのSendTransactionErrorを可視化
      if (e && e.logs) {
        console.error("Queue failed with logs:\n", e.logs.join("\n"));
      }
      throw e;
    }

    // finalize → 復号
    const finalizeSig = await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed");
    console.log("finalize sig:", finalizeSig);

    const ev: any = await iotEventP;
    const payoutNums: number[] = Array.isArray(ev.payout) ? ev.payout : Array.from(ev.payout as Uint8Array);
    const nonceNums: number[] = Array.isArray(ev.nonce) ? ev.nonce : Array.from(ev.nonce as Uint8Array);
    const decrypted = (cipher as any).decrypt([Uint8Array.from(payoutNums)], Uint8Array.from(nonceNums))[0];

    console.log("iot_score payout (decrypted):", decrypted.toString());
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

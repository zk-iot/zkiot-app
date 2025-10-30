import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";

/**
 * 目的:
 *  - TempAtMost37Array(n) 用の input.json を生成する
 *  - 入力は:
 *      (A) ローカルの生JSON (readings配列: {t_c_x100,...})
 *      (B) 暗号化IPFS(JSON)のCID + ローカル鍵（AES-256-GCM）
 *  - 長さNに自動整形 (サンプリング/パディング)
 *
 * 使い方(例):
 *  # A) 生JSONから (N=48)
 *  npx tsx scripts/build_input.ts ^
 *    --source local ^
 *    --input data\\readings_37.json ^
 *    --n 48 ^
 *    --out build\\input.json
 *
 *  # B) 暗号化IPFSから (N=128)
 *  npx tsx scripts/build_input.ts ^
 *    --source ipfs ^
 *    --cid bafy... ^
 *    --key .\\keys\\key_9E3FfX_1760429700.bin ^
 *    --n 128 ^
 *    --out build\\input.json
 */

type Reading = {
  t_c_x100: number;
  rh_x100?: number;
  p_pa?: number;
  gas?: number;
  ts?: number;
  deviceOwner?: string;
};

type EncPayload = {
  schema: string;              // "iaq_reading_v1_enc"
  alg: "AES-256-GCM";
  hash: string;                // "keccak256_le" など
  root: string;                // 参考: Merkle root (未使用)
  window: { device: string; start: number; end: number; count: number };
  enc: { nonce: string; tag: string; ciphertext: string };
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const source = get("--source"); // "local" | "ipfs"
  const input = get("--input");   // local json path
  const cid = get("--cid");       // ipfs cid
  const keyPath = get("--key");   // aes key path
  const nStr = get("--n") || "48";
  const out = get("--out") || "build/input.json";
  const allowClip = argv.includes("--clip"); // >3700 を 3700 に丸める（デフォルト: エラー）
  const pinataGateway = get("--pinata") || process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";

  if (!source || !["local", "ipfs"].includes(source)) {
    throw new Error("--source local|ipfs を指定してください");
  }
  if (source === "local" && !input) throw new Error("--input <path/to/readings.json> が必要です");
  if (source === "ipfs" && (!cid || !keyPath)) throw new Error("--cid と --key が必要です (IPFS暗号化JSON)");

  const N = parseInt(nStr, 10);
  if (!(N > 0)) throw new Error("--n は正の整数で指定してください");

  return { source, input, cid, keyPath, N, out, allowClip, pinataGateway };
}

function loadLocalReadings(p: string): Reading[] {
  const txt = fs.readFileSync(path.resolve(p!), "utf-8");
  const data = JSON.parse(txt);
  if (!Array.isArray(data)) throw new Error("入力JSONが配列ではありません");
  return data as Reading[];
}

async function fetchEncJsonFromIpfs(cid: string, pinataGateway: string): Promise<EncPayload> {
  const url = `${pinataGateway.replace(/\/+$/, "")}/${cid}`;
  const res = await axios.get(url, { timeout: 60000 });
  return res.data as EncPayload;
}

function decryptAesGcm(key: Buffer, nonceB64: string, tagB64: string, ciphertextB64: string): Buffer {
  const nonce = Buffer.from(nonceB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function toInt(val: any): number {
  if (typeof val === "number") return (val | 0);
  const n = Number(val);
  if (!Number.isFinite(n)) throw new Error(`数値に変換できません: ${val}`);
  return n | 0;
}

function sampleToLength<T>(arr: T[], N: number): T[] {
  if (arr.length === N) return arr;
  if (arr.length < N) {
    // pad with zeros
    const pad = Array(N - arr.length).fill(0 as any);
    return arr.concat(pad);
  }
  // 等間隔サンプリング
  const step = arr.length / N;
  const out: T[] = [];
  for (let i = 0; i < N; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  return out;
}

function validateTemps(vals: number[], allowClip: boolean) {
  for (let i = 0; i < vals.length; i++) {
    if (!Number.isInteger(vals[i])) throw new Error(`tScaled[${i}] が整数ではありません: ${vals[i]}`);
    if (vals[i] < 0) throw new Error(`tScaled[${i}] が負です: ${vals[i]}`);
    if (vals[i] > 3700) {
      if (allowClip) {
        vals[i] = 3700;
      } else {
        throw new Error(`tScaled[${i}] > 3700 を検出（--clip を付ければ 3700 に丸めます）。値: ${vals[i]}`);
      }
    }
  }
}

async function main() {
  const { source, input, cid, keyPath, N, out, allowClip, pinataGateway } = parseArgs();

  let readings: Reading[] = [];

  if (source === "local") {
    readings = loadLocalReadings(input!);
  } else {
    // IPFS 暗号化JSONを取得 → 復号 → 平文JSONから leaves を得る
    const enc = await fetchEncJsonFromIpfs(cid!, pinataGateway);
    if (enc.alg !== "AES-256-GCM") throw new Error(`未知のalg: ${enc.alg}`);
    const key = fs.readFileSync(path.resolve(keyPath!));
    const plainBuf = decryptAesGcm(key, enc.enc.nonce, enc.enc.tag, enc.enc.ciphertext);
    const plain = JSON.parse(plainBuf.toString("utf-8"));
    // plain は Step1 の平文構造（schema: iaq_reading_v1 / leaves: Reading[]）
    if (!plain?.leaves || !Array.isArray(plain.leaves)) {
      throw new Error("復号したJSONに leaves 配列がありません（schemaを確認）");
    }
    readings = plain.leaves as Reading[];
  }

  // t_c_x100 を抽出して N に整形
  const arr = readings.map(r => toInt(r.t_c_x100));
  const tScaled = sampleToLength(arr, N);

  // 検証（>3700 を許容/丸めは --clip で明示）
  validateTemps(tScaled, allowClip);

  // circom の入力形式に合わせて書き出し
  const inputJson = { tScaled };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(inputJson, null, 2));
  console.log(`✅ wrote ${out}`);
  console.log(`   length(tScaled) = ${tScaled.length}, max = ${Math.max(...tScaled)}, min = ${Math.min(...tScaled)}`);
  console.log(`   source = ${source}${source === "ipfs" ? ` (cid=${cid})` : ` (file=${input})`}`);
}

main().catch(e => { console.error(e); process.exit(1); });

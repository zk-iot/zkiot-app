import express from "express";
import cors from "cors";
import { sha256 } from "js-sha256";
import { issueAttestation } from "./sas/issue";
import type { SasPayload } from "./sas/anchor";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/** ヘルスチェック */
app.get("/", (_req, res) => {
  res.json({ ok: true, msg: "Play Integrity MVP server is running" });
});

/** Android からの受け口：JWS と（あれば）payload_json を受け取る */
app.post("/api/attest", (req, res) => {
  try {
    const jws: string = req.body?.jws;
    const payloadJson: string | undefined = req.body?.payload_json;
    const walletPubkey: string | undefined = req.body?.wallet_pubkey;
    const taskId: string | undefined = req.body?.task_id;

    if (!jws || typeof jws !== "string") {
      return res.status(400).json({ ok: false, error: "jws missing" });
    }

    // 1) 元トークンのハッシュ（オンチェーン照合フック）
    const jws_hash = "0x" + sha256.create().update(jws).hex();

    // 2) 端末で抜いた JSON から要点だけ（あれば）
    let pkg = "";
    let verdictApp = "";
    let verdictDevice: string[] = [];
    let ts = Date.now();
    let nonce_hash = "";

    if (payloadJson && typeof payloadJson === "string") {
      try {
        const p = JSON.parse(payloadJson);
        pkg =
          p?.requestDetails?.requestPackageName ??
          p?.appIntegrity?.packageName ??
          "";
        verdictApp = p?.appIntegrity?.appRecognitionVerdict ?? "";
        verdictDevice =
          Array.isArray(p?.deviceIntegrity?.deviceRecognitionVerdict)
            ? p.deviceIntegrity.deviceRecognitionVerdict
            : [];
        ts = Number(p?.requestDetails?.timestampMillis ?? Date.now());
        const nonce: string | undefined = p?.requestDetails?.nonce;
        if (typeof nonce === "string") {
          nonce_hash = "0x" + sha256.create().update(nonce).hex();
        }
      } catch {
        // 壊れていてもMVPでは落とさない
      }
    }

    // 3) SAS に載せる想定の最小ペイロード（発行は別フェーズ）
    const sasPayload = {
      schema: "android.play.integrity.v1",
      subject: walletPubkey ?? "UNKNOWN_WALLET",
      data: {
        pkg,
        verdicts: { app: verdictApp, device: verdictDevice },
        ts,
        nonce_hash,
        jws_hash
      },
      meta: { taskId: taskId ?? null }
    };

    // ログに出しておくとデバッグしやすい
    console.log("[/api/attest] sasPayload =", JSON.stringify(sasPayload));

    res.json({ ok: true, sasPayload });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "unknown" });
  }
});

/** （任意）サーバ側デコードのスタブ。後で Google API に差し替え */
app.post("/api/decode", (req, res) => {
  const token: string | undefined = req.body?.token;
  const packageName: string | undefined = req.body?.packageName;
  if (!token || !packageName) {
    return res
      .status(400)
      .json({ ok: false, error: "token/packageName required" });
  }
  // いまはスタブ応答
  res.json({
    ok: true,
    info: {
      tokenHead: String(token).slice(0, 24) + "...",
      packageName,
      note:
        "Server-side decode not implemented yet. Replace with Google Play Integrity decode API."
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});

app.post("/api/sas/issue", async (req, res) => {
  try {
    const sp = req.body?.sasPayload as SasPayload;
    if (!sp?.schema || !sp?.subject || !sp?.data) {
      return res.status(400).json({ ok: false, error: "sasPayload missing" });
    }
    const out = await issueAttestation(sp);
    res.json({ ok: true, ...out });
  } catch (e: any) {
    console.error("SAS issue error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? "failed" });
  }
});



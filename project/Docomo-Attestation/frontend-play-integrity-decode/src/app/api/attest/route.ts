// app/api/attest/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/** 0x付きSHA-256(hex) */
function sha256Hex(input: string | Buffer) {
  return "0x" + crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jws: string = body?.jws;                   // Android側の lastToken（JWE/JWS原文）
    const payloadJson: string | undefined = body?.payload_json; // (任意) 端末で抜いたJSON
    const walletPubkey: string | undefined = body?.wallet_pubkey;
    const taskId: string | undefined = body?.task_id;

    if (!jws || typeof jws !== "string") {
      return NextResponse.json({ ok: false, error: "jws missing" }, { status: 400 });
    }

    // 1) 最低限: ハッシュ化（オンチェーンでの再照合フックになる）
    const jws_hash = sha256Hex(jws);

    // 2) 端末で抜いた payload_json がある場合は要点だけ抽出（なければ空でOK）
    let pkg = "";
    let verdictApp = "";
    let verdictDevice: string[] = [];
    let ts = Date.now();
    let nonce_hash = "";

    if (payloadJson) {
      try {
        const payload = JSON.parse(payloadJson);
        pkg = payload?.requestDetails?.requestPackageName
          ?? payload?.appIntegrity?.packageName
          ?? "";
        verdictApp = payload?.appIntegrity?.appRecognitionVerdict ?? "";
        verdictDevice = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
        ts = Number(payload?.requestDetails?.timestampMillis ?? Date.now());
        const nonce = payload?.requestDetails?.nonce;
        if (typeof nonce === "string") nonce_hash = sha256Hex(nonce);
      } catch (e) {
        // JSONが壊れていてもMVPでは弾かずに進める
      }
    }

    // 3) SASに載せる想定の“最小データ”（まだ発行はしない）
    const sasPayload = {
      schema: "android.play.integrity.v1",
      subject: walletPubkey ?? "UNKNOWN_WALLET",
      data: {
        pkg,
        verdicts: { app: verdictApp, device: verdictDevice },
        ts,
        nonce_hash,
        jws_hash,
      },
      meta: { taskId: taskId ?? null }, // 任意メタ
    };

    // 4) ここでSAS発行に進める（後で実装）。今はecho。
    return NextResponse.json({ ok: true, sasPayload });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

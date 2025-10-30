import { NextRequest, NextResponse } from "next/server";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";

const REGION = process.env.AWS_REGION!; // 例: "ap-northeast-1"
const IOT_ENDPOINT = process.env.IOT_ENDPOINT!; // 例: "xxxxxxxxxx-ats.iot.ap-northeast-1.amazonaws.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") ?? `web-${crypto.randomUUID()}`;

    const signer = new SignatureV4({
      service: "iotdevicegateway",
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
      sha256: Sha256,
    });

    const request = new HttpRequest({
      protocol: "wss:",
      hostname: IOT_ENDPOINT,
      method: "GET",
      path: "/mqtt",
      headers: { host: IOT_ENDPOINT },
      query: { "X-Amz-Client-Id": clientId } as Record<string, string>,
    });

    const presigned = await signer.presign(request, { expiresIn: 60 * 15 });
    const qs = new URLSearchParams(
      presigned.query as Record<string, string>
    ).toString();
    const url = `wss://${IOT_ENDPOINT}${presigned.path}?${qs}`;

    return NextResponse.json({ url, clientId });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "presign failed" }, { status: 500 });
  }
}


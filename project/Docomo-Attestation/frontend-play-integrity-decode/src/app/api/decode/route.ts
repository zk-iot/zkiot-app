// app/api/decode/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token, packageName } = await req.json();
  if (!token || !packageName) {
    return NextResponse.json({ ok: false, error: "token/packageName required" }, { status: 400 });
  }

  // ▼ 今はスタブ：まずは受け取ったことだけ返す（AndroidのUI確認用）
  // 後で Google API を呼ぶ実装に差し替えます。
  return NextResponse.json({
    ok: true,
    info: {
      tokenHead: String(token).slice(0, 24) + "...",
      packageName,
      note: "Server-side decode not implemented yet. Replace with Google Play Integrity decode API call.",
    },
  });
}



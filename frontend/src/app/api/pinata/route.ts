// app/api/pinata/route.ts (Next.js App Router API handler)
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    const formData = new FormData();
    formData.append("file", blob, file.name);

    const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: formData,
    });

    if (!pinataRes.ok) {
      const err = await pinataRes.text();
      throw new Error(err);
    }

    const result = await pinataRes.json();
    const cid = result.IpfsHash;
    const url = `https://${process.env.NEXT_PUBLIC_GATEWAY_URL}/ipfs/${cid}`;

    return NextResponse.json({ cid, url });
  } catch (e) {
    console.error("Pinata Upload Error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
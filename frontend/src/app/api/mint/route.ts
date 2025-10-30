import { NextRequest } from "next/server";
import { create, mplCore } from "@metaplex-foundation/mpl-core";
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";

export async function POST(req: NextRequest) {
  try {
    const { name, description, imageBase64, filename } = await req.json();

    // --- Umiインスタンスの作成 ---
    const umi = createUmi("https://api.devnet.solana.com")
      .use(mplCore())
      .use(
        irysUploader({
          address: "https://devnet.irys.xyz",
        })
      );

    // --- .envから64バイトの秘密鍵（JSON配列）を読み込む ---
    const rawSecret = process.env.SOLANA_SECRET_KEY;
    if (!rawSecret) {
      throw new Error("環境変数 SOLANA_SECRET_KEY が定義されていません。");
    }

    const secretKeyArray = JSON.parse(rawSecret);
    if (secretKeyArray.length !== 64) {
      throw new Error("SOLANA_SECRET_KEY は 64 バイトの秘密鍵である必要があります。");
    }

    const secretKey = new Uint8Array(secretKeyArray);
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    umi.use(keypairIdentity(keypair));

    // --- 画像のアップロード ---
    const buffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const umiImageFile = createGenericFile(buffer, filename, {
      tags: [{ name: "Content-Type", value: "image/png" }],
    });

    const imageUris = await umi.uploader.upload([umiImageFile]);
    const imageUri = imageUris[0].replace("arweave.net", "gateway.irys.xyz");

    // --- メタデータ作成 ---
    const metadata = {
      name,
      description,
      image: imageUri,
      external_url: "https://example.com",
      attributes: [{ trait_type: "example", value: "example" }],
      properties: {
        files: [{ uri: imageUri, type: "image/png" }],
        category: "image",
      },
    };

    const metadataUriRaw = await umi.uploader.uploadJson(metadata);
    const metadataUri = metadataUriRaw.replace("arweave.net", "gateway.irys.xyz");

    // --- アセット生成 & ミント ---
    const asset = generateSigner(umi);
    const tx = await create(umi, {
      asset,
      name,
      uri: metadataUri,
    }).sendAndConfirm(umi);

    const signature = base58.deserialize(tx.signature)[0];

    return new Response(
      JSON.stringify({
        success: true,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        nftUrl: `https://core.metaplex.com/explorer/${asset.publicKey}?env=devnet`,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Mint Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}


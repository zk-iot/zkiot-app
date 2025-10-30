// lib/pinata.ts
export async function pinJSONToIPFS(obj: unknown, filename = 'window.json') {
  const jwt = process.env.PINATA_JWT!;
  if (!jwt) throw new Error('Missing PINATA_JWT');

  // Pinataの pinJSONToIPFS エンドポイント
  const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
  const body = {
    pinataOptions: { cidVersion: 1 },
    pinataMetadata: { name: filename },
    pinataContent: obj,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pinata error: ${res.status} ${t}`);
  }
  const json = await res.json();
  // 返り値例: { IpfsHash: 'bafy...', PinSize: 123, Timestamp: '...' }
  return json.IpfsHash as string;
}

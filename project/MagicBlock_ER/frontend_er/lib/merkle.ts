// lib/merkle.ts
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

export type Reading = {
  deviceId?: string;
  ts: number;
  t_c_x100: number;
  rh_x100: number;
  p_pa: number;
  gas: number;
};

export function leafHash(r: Reading) {
  const payload = `${r.deviceId ?? ''}|${r.ts}|${r.t_c_x100}|${r.rh_x100}|${r.p_pa}|${r.gas}`;
  return keccak256(Buffer.from(payload));
}

export function calcWindowRoot(readings: Reading[]) {
  const leaves = readings.map(leafHash);
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return { rootHex: tree.getRoot().toString('hex'), tree };
}


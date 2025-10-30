#!/usr/bin/env -S ts-node --transpile-only

/**
 * Transform charge_point_sample.json + a proposed session
 * into circuit input.json for ProofOfCharge.circom
 *
 * Usage:
 *   ts-node tools/make_input_from_json.ts \
 *     --json ./charge_point_sample.json \
 *     --code BERSTD34 --connector C1 \
 *     --meterStart 1200345 --meterEnd 1202780
 *
 * Output:
 *   data/input.json with fields:
 *     {
 *       "meter_start_wh": number,
 *       "meter_end_wh": number,
 *       "rate_paise_per_kwh": number
 *     }
 */

import * as fs from "fs";
import * as path from "path";

type Pricing = {
  energy_based?: { rate: number; unit: string };
  time_based?: { rate: number; unit: string };
};
type Connector = { id: string; status?: string; type?: string; power_kw?: number };
type ChargePoint = {
  code: string;
  status: string;
  pricing: Pricing;
  connectors?: Connector[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, "");
    const v = args[i + 1];
    out[k] = v;
  }
  return out;
}

function fail(msg: string): never {
  console.error("Error:", msg);
  process.exit(1);
}

function main() {
  const a = parseArgs();
  const jsonPath = a.json || "./data/charge_point_sample.json";
  const code = a.code;
  const connector = a.connector;
  const meterStart = Number(a.meterStart);
  const meterEnd = Number(a.meterEnd);
  const outPath = a.out || "./data/input.json";

  if (!code) fail("--code is required");
  if (!connector) fail("--connector is required");
  if (!Number.isFinite(meterStart) || !Number.isFinite(meterEnd)) {
    fail("--meterStart and --meterEnd must be integers in Wh");
  }
  if (meterEnd <= meterStart) fail("meterEnd must be greater than meterStart");

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const parsed = JSON.parse(raw) as { charge_points: ChargePoint[] };
  const cp = parsed.charge_points.find((c) => c.code === code);
  if (!cp) fail(`charge point not found: ${code}`);
  if (cp.status !== "active") fail(`charge point not active: ${cp.status}`);

  const conn = (cp.connectors || []).find((c) => c.id === connector);
  if (!conn) fail(`connector not found: ${connector}`);

  const rate = cp.pricing?.energy_based?.rate;
  const unit = cp.pricing?.energy_based?.unit;
  if (typeof rate !== "number" || unit !== "INR_per_kWh") {
    fail(`invalid or missing energy_based rate for ${code}`);
  }

  const ratePaisePerKwh = Math.round(rate * 100);

  // ここから追加：q, r の算出
  const energy_used_wh = Math.floor(meterEnd) - Math.floor(meterStart);
  if (energy_used_wh <= 0) fail("computed energy_used_wh must be positive");

  const P = energy_used_wh * ratePaisePerKwh + 999;
  const q = Math.floor(P / 1000);
  const r = P - 1000 * q; // 0 <= r < 1000

  const input = {
    meter_start_wh: Math.floor(meterStart),
    meter_end_wh: Math.floor(meterEnd),
    rate_paise_per_kwh: ratePaisePerKwh,
    q,
    r
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(input, null, 2));
  console.log("Wrote", outPath);
  console.log(JSON.stringify(input, null, 2));
}

main();
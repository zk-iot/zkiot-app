pragma circom 2.0.0;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom"; // LessThan

template ProofOfCharge() {
    // ---- Inputs ----
    // Private inputs (与えるメータ値・レート)
    signal input meter_start_wh;
    signal input meter_end_wh;
    signal input rate_paise_per_kwh; // e.g., 1900 = 19.00 INR/kWh

    // ★ quotient/remainder を「証人」として与える
    signal input q;  // amount_paise 候補（ceil(...)）
    signal input r;  // 余り (0 <= r < 1000)

    // Public outputs
    signal output ok;
    signal output energy_used_wh;
    signal output amount_paise;

    // ---- Range checks ----
    component sBits = Num2Bits(32);
    sBits.in <== meter_start_wh;

    component eBits = Num2Bits(32);
    eBits.in <== meter_end_wh;

    component rateBits = Num2Bits(20);
    rateBits.in <== rate_paise_per_kwh;

    // ---- usage >= 1 ----
    energy_used_wh <== meter_end_wh - meter_start_wh;

    component diffMinus1Bits = Num2Bits(32);
    diffMinus1Bits.in <== energy_used_wh - 1;

    // ---- ceil(energy_used_wh * rate / 1000) ----
    signal P;
    P <== energy_used_wh * rate_paise_per_kwh + 999;

    // P = 1000*q + r
    P === 1000 * q + r;

    // r の範囲制約: 0 <= r < 1000
    component remBits = Num2Bits(10); // r < 1024 の範囲にまず入れる
    remBits.in <== r;

    component lt = LessThan(10);
    lt.in[0] <== r;
    lt.in[1] <== 1000;
    lt.out === 1;

    // 出力
    amount_paise <== q;
    ok <== 1;
}

component main = ProofOfCharge();

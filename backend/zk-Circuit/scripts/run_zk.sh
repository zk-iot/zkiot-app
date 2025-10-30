#!/usr/bin/env bash
set -e  # stop on first error

# ===== ここだけ変えれば他は連動します =====
CIRCUIT_NAME="temp_all_leq37_only"
CIRCUIT_PATH="./circuits/${CIRCUIT_NAME}.circom"
INPUT_JSON="./data/input.json"
BUILD_DIR="./build"
PTAU_POWER=14  # 2^14 = 16384（この軽量回路なら十分）
# =========================================

echo "🧹 Cleaning build dir..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

echo "🧱 Compiling circuit..."
circom "${CIRCUIT_PATH}" --r1cs --wasm --sym -l node_modules -o "${BUILD_DIR}"

# ---------------------------
# Phase 1: Powers of Tau
# ---------------------------
PTAU_FINAL="${BUILD_DIR}/pot${PTAU_POWER}_final.ptau"
if [ ! -f "${PTAU_FINAL}" ]; then
  echo "⚡ Running Powers of Tau (p=${PTAU_POWER})..."
  snarkjs powersoftau new bn128 ${PTAU_POWER} "${BUILD_DIR}/pot${PTAU_POWER}_0000.ptau" -v
  snarkjs powersoftau contribute \
    "${BUILD_DIR}/pot${PTAU_POWER}_0000.ptau" \
    "${BUILD_DIR}/pot${PTAU_POWER}_0001.ptau" \
    --name="auto-contribution" \
    -v -e="random_entropy_1234"
  snarkjs powersoftau prepare phase2 \
    "${BUILD_DIR}/pot${PTAU_POWER}_0001.ptau" \
    "${PTAU_FINAL}" -v
else
  echo "✅ Reusing existing pot${PTAU_POWER}_final.ptau"
fi

# ---------------------------
# Phase 2: Circuit setup
# ---------------------------
echo "🧙 Setting up Groth16..."
snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "${PTAU_FINAL}" \
  "${BUILD_DIR}/circuit_0000.zkey"

snarkjs zkey contribute \
  "${BUILD_DIR}/circuit_0000.zkey" \
  "${BUILD_DIR}/circuit_0001.zkey" \
  --name="auto-zkey-contribution" \
  -v -e="entropy_for_zkey_5678"

snarkjs zkey export verificationkey \
  "${BUILD_DIR}/circuit_0001.zkey" \
  "${BUILD_DIR}/verification_key.json"

# ---------------------------
# Witness
# ---------------------------
echo "🧠 Calculating witness..."
snarkjs wtns calculate \
  "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" \
  "${INPUT_JSON}" \
  "${BUILD_DIR}/witness.wtns"

# ---------------------------
# Proof
# ---------------------------
echo "🔐 Generating proof..."
snarkjs groth16 prove \
  "${BUILD_DIR}/circuit_0001.zkey" \
  "${BUILD_DIR}/witness.wtns" \
  "${BUILD_DIR}/proof.json" \
  "${BUILD_DIR}/public.json"

# ---------------------------
# Verify
# ---------------------------
echo "🧾 Verifying proof..."
snarkjs groth16 verify \
  "${BUILD_DIR}/verification_key.json" \
  "${BUILD_DIR}/public.json" \
  "${BUILD_DIR}/proof.json"

echo "✅ All done! Proof verified successfully."




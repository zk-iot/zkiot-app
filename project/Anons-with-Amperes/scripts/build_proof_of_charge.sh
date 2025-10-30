#!/usr/bin/env bash
set -e

CIRCUIT_NAME="proof_of_charge"
CIRCUIT_PATH="./circuits/${CIRCUIT_NAME}.circom"
INPUT_JSON="./data/input.json"
BUILD_DIR="./build"

echo "🧹 Cleaning build dir..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

echo "🧱 Compiling circuit..."
circom "${CIRCUIT_PATH}" --r1cs --wasm --sym -l node_modules -o "${BUILD_DIR}"

# ---------------------------
# Phase 1: Powers of Tau
# ---------------------------
if [ ! -f "${BUILD_DIR}/pot12_final.ptau" ]; then
  echo "⚡ Running Powers of Tau..."
  snarkjs powersoftau new bn128 12 "${BUILD_DIR}/pot12_0000.ptau" -v
  snarkjs powersoftau contribute \
    "${BUILD_DIR}/pot12_0000.ptau" \
    "${BUILD_DIR}/pot12_0001.ptau" \
    --name="auto-contribution" \
    -v -e="random_entropy_1234"
  snarkjs powersoftau prepare phase2 \
    "${BUILD_DIR}/pot12_0001.ptau" \
    "${BUILD_DIR}/pot12_final.ptau" -v
else
  echo "✅ Reusing existing pot12_final.ptau"
fi

# ---------------------------
# Phase 2: Circuit setup
# ---------------------------
echo "🧙 Setting up Groth16..."
snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "${BUILD_DIR}/pot12_final.ptau" \
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


pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

template TempAllLeq37Only(N) {
    // private inputs
    signal input tScaled[N];

    // optional public output (constant 1 if all constraints hold)
    signal output ok;

    // ---- Predeclare components & signals (no declarations inside loops) ----
    component lt[N];          // LessThan gadgets
    signal v[N];              // 0=OK, 1=violation flags
    signal acc[N + 1];        // prefix sums: acc[0]=0, acc[i+1]=acc[i]+v[i]

    // init prefix sum
    acc[0] <== 0;

    // build constraints
    for (var i = 0; i < N; i++) {
        //  tScaled[i] <= 3700  <=>  tScaled[i] < 3701
        lt[i] = LessThan(16);
        lt[i].in[0] <== tScaled[i];
        lt[i].in[1] <== 3701;

        // violation flag
        v[i] <== 1 - lt[i].out;

        // prefix sum
        acc[i + 1] <== acc[i] + v[i];
    }

    // no violations
    acc[N] === 0;

    // optional: expose ok=1 (only reaches here if acc[N]==0)
    ok <== 1;
}

component main = TempAllLeq37Only(128);


use arcis_imports::*;

/// encrypted-ixs: iot_score 回路定義
#[encrypted]
mod circuits {
    use arcis_imports::*;

    /// 入力順序（queue_computation の引数順と完全一致）
    /// 1) client: Shared（クライアント x25519 公開鍵に対応）
    /// 2) v0..v4: Enc<Shared, u128>（暗号化された 5つのサマリ値）
    ///
    /// v0: unique_ts, v1: valid, v2: anomalies, v3: expect, v4: budget
    ///
    /// 出力は Enc<Shared, u128>（payout のみ）
    #[instruction]
    pub fn iot_score(
        client: Shared,
        v0: Enc<Shared, u128>, // unique_ts
        v1: Enc<Shared, u128>, // valid
        v2: Enc<Shared, u128>, // anomalies
        v3: Enc<Shared, u128>, // expect
        v4: Enc<Shared, u128>, // budget
    ) -> Enc<Shared, u128> {
        // 機密環境内で復号
        let unique_ts = v0.to_arcis();
        let valid     = v1.to_arcis();
        let anomalies = v2.to_arcis();
        let expect    = v3.to_arcis();
        let budget    = v4.to_arcis();

        // payout = budget * unique * (valid - anomalies) / (expect * valid)
        let expect_nonzero = if expect == 0 { 1 } else { expect };
        let valid_nonzero  = if valid  == 0 { 1 } else { valid  };
        let safe_diff = if anomalies > valid_nonzero { 0 } else { valid_nonzero - anomalies };

        let numer = budget * unique_ts * safe_diff;
        let denom = expect_nonzero * valid_nonzero;
        let payout = if denom == 0 { 0 } else { numer / denom };

        // クライアント鍵で再暗号化して返す
        client.from_arcis(payout)
    }
}

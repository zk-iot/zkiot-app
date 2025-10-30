use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// ★ここをあなたの新しい Program ID に置き換える
declare_id!("2CHAyGFt1mAzd7E7C4SZcZM83P6dBJXpdZg63LVKnfPV");

// 回路名は iot_score に統一
const COMP_DEF_OFFSET_IOT_SCORE: u32 = comp_def_offset("iot_score");

#[arcium_program]
pub mod zkiot_mpc {
    use super::*;

    /// comp-def 初期化（Raw回路をあとで upload→finalize する前提）
    pub fn init_iot_score_comp_def(ctx: Context<InitIotScoreCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    /// 暗号入力をキューに積む
    /// - ciphertexts: Enc<u128> を RescueCipher で暗号化した 32B × 5
    /// - client_pubkey: x25519 公開鍵（32B）
    /// - nonce: u128（暗号化時に使った16Bノンス。復号のため平文で一緒に渡す）
    pub fn iot_score(
        ctx: Context<IotScore>,
        computation_offset: u64,
        ciphertexts: [[u8; 32]; 5],
        client_pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // 引数の順序：Shared(pubkey) → PlaintextU128(nonce) → Enc×5
        let mut args = Vec::<Argument>::new();
        args.push(Argument::ArcisPubkey(client_pubkey));
        args.push(Argument::PlaintextU128(nonce));
        for c in ciphertexts {
            args.push(Argument::EncryptedU8(c));
        }

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![IotScoreCallback::callback_ix(&[])],
        )?;
        Ok(())
    }

    /// callback（encrypted_ix 名は iot_score）
    #[arcium_callback(encrypted_ix = "iot_score")]
    pub fn iot_score_callback(
        ctx: Context<IotScoreCallback>, // ★← _ctx ではなく ctx
        output: ComputationOutputs<IotScoreOutput>,
    ) -> Result<()> {
        let o = match output {
            ComputationOutputs::Success(IotScoreOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // ctx は未使用でも OK（使わない警告を避けたいなら次行を有効化）
        // let _ = &ctx;

        emit!(IotEvent {
            payout: o.ciphertexts[0],
            nonce:  o.nonce.to_le_bytes(), // 16Bをイベントへ
        });
        Ok(())
    }
}

/* ---------------- Accounts ---------------- */

#[queue_computation_accounts("iot_score", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct IotScore<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut, address = derive_mempool_pda!())]
    /// CHECK: arcium program が検証
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!())]
    /// CHECK: arcium program が検証
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset))]
    /// CHECK: arcium program が検証
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_IOT_SCORE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("iot_score")]
#[derive(Accounts)]
pub struct IotScoreCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_IOT_SCORE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar（arcium が検証）
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("iot_score", payer)]
#[derive(Accounts)]
pub struct InitIotScoreCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: 未初期化（arcium が検証）
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/* ---------------- Events / Errors ---------------- */

#[event]
pub struct IotEvent {
    pub payout: [u8; 32],
    pub nonce:  [u8; 16],
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}


use anchor_lang::prelude::*;

#[cfg(feature = "er")]
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
#[cfg(feature = "er")]
use ephemeral_rollups_sdk::cpi::DelegateConfig;
#[cfg(feature = "er")]
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

declare_id!("2fh84p79B6AgNnwmbGhXnt2cAaGzCBoMaozU2AvEuzho");

#[program]
pub mod iaq_er {
    use super::*;

    pub fn initialize_device(
        ctx: Context<InitializeDevice>,
        cfg: ThresholdConfig,
    ) -> Result<()> {
        let device = &mut ctx.accounts.device;
        device.owner = ctx.accounts.authority.key();
        device.cfg = cfg;
        // Anchor 0.31 の bumps はフィールドアクセス
        device.bump = ctx.bumps.device;
        Ok(())
    }

    // ---- ERで走らせたいIx（ER無効でもコンパイルは通るようにガード） ----
    #[cfg_attr(feature = "er", ephemeral)]
    pub fn ingest_reading(ctx: Context<IngestReading>, r: Reading) -> Result<()> {
        let feed = &mut ctx.accounts.feed;
        let clamped = r.clamp(feed.last);
        feed.last = clamped;
        feed.ema_t = ema(feed.ema_t, clamped.t_c_x100 as i64, 20);
        feed.ema_rh = ema(feed.ema_rh, clamped.rh_x100 as i64, 20);
        feed.max_gas = feed.max_gas.max(clamped.gas);
        feed.last_ts = clamped.ts;

        let score = &mut ctx.accounts.score;
        if within_threshold(&ctx.accounts.device.cfg, &clamped) {
            score.in_window_ok_secs = score.in_window_ok_secs.saturating_add(1);
        } else {
            score.in_window_bad_secs = score.in_window_bad_secs.saturating_add(1);
        }
        Ok(())
    }

    #[cfg_attr(feature = "er", ephemeral)]
    pub fn aggregate_window(ctx: Context<AggregateWindow>) -> Result<()> {
        let feed = &mut ctx.accounts.feed;
        let score = &mut ctx.accounts.score;
        let cp = &mut ctx.accounts.checkpoint;

        cp.window_index = cp.window_index.saturating_add(1);
        cp.avg_t = feed.ema_t as i32;
        cp.avg_rh = feed.ema_rh as i32;
        cp.max_gas = feed.max_gas;
        cp.ok_secs = score.in_window_ok_secs;
        cp.bad_secs = score.in_window_bad_secs;
        cp.window_closed_at = feed.last_ts;

        // 次窓初期化
        feed.max_gas = 0;
        score.in_window_ok_secs = 0;
        score.in_window_bad_secs = 0;

        emit!(WindowAggregated {
            device: ctx.accounts.device.key(),
            window_index: cp.window_index,
            ok_secs: cp.ok_secs,
            bad_secs: cp.bad_secs,
        });
        Ok(())
    }

    // ---- L1確定（後でSDKのcommit_accounts!に合わせて埋める） ----
    pub fn commit_checkpoint(ctx: Context<CommitCheckpoint>, merkle_root: [u8; 32]) -> Result<()> {
        let cp = &mut ctx.accounts.checkpoint;
        cp.last_merkle_root = merkle_root;
        cp.committed = true;

        emit!(CheckpointCommitted {
            device: ctx.accounts.device.key(),
            window_index: cp.window_index,
            merkle_root,
        });

        #[cfg(feature = "er")]
        {
            // TODO: Quickstartの commit_accounts! の要求どおりにアカウントを列挙してから有効化
            // commit::commit(ctx.accounts, commit_accounts! { /* ... */ })?;
        }

        Ok(())
    }

    // ---- 委譲（ER有効時のみビルド対象）----
    #[cfg(feature = "er")]
    pub fn delegate_device(ctx: Context<DelegateDevice>) -> Result<()> {
        let cfg = DelegateConfig {
            // TODO: QuickstartのDelegateConfigを埋める
            ..Default::default()
        };
        delegate::delegate_accounts(ctx.accounts, cfg)?;
        Ok(())
    }
}

/* =========================
   アカウント & データ構造
   ========================= */

#[account]
pub struct Device {
    pub owner: Pubkey,
    pub cfg: ThresholdConfig,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ThresholdConfig {
    pub max_co2_ppm: u32,
    pub t_min_c_x100: i32,
    pub t_max_c_x100: i32,
    pub rh_max_x100: u32,
}

#[account]
pub struct Feed {
    pub last: Reading,
    pub ema_t: i64,
    pub ema_rh: i64,
    pub max_gas: u32,
    pub last_ts: u64,
    pub bump: u8,
}

#[account]
pub struct Score {
    pub in_window_ok_secs: u32,
    pub in_window_bad_secs: u32,
    pub bump: u8,
}

#[account]
pub struct Checkpoint {
    pub window_index: u64,
    pub avg_t: i32,
    pub avg_rh: i32,
    pub max_gas: u32,
    pub ok_secs: u32,
    pub bad_secs: u32,
    pub window_closed_at: u64,
    pub last_merkle_root: [u8; 32],
    pub committed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct Reading {
    pub t_c_x100: i32,
    pub rh_x100: u32,
    pub p_pa: u32,
    pub gas: u32,
    pub ts: u64,
}

impl Reading {
    pub fn clamp(self, last: Reading) -> Reading {
        let mut r = self;
        let clamp_u = |v: u32, last: u32| -> u32 {
            let lo = last.saturating_mul(80) / 100;
            let hi = last.saturating_mul(120) / 100;
            v.clamp(lo, hi).max(1)
        };
        if last.rh_x100 > 0 {
            r.rh_x100 = clamp_u(r.rh_x100, last.rh_x100);
        }
        if last.p_pa > 0 {
            r.p_pa = clamp_u(r.p_pa, last.p_pa);
        }
        if last.gas > 0 {
            r.gas = clamp_u(r.gas, last.gas);
        }
        r
    }
}

fn within_threshold(cfg: &ThresholdConfig, r: &Reading) -> bool {
    let t_ok = r.t_c_x100 >= cfg.t_min_c_x100 && r.t_c_x100 <= cfg.t_max_c_x100;
    let rh_ok = r.rh_x100 <= cfg.rh_max_x100;
    let gas_ok = r.gas <= cfg.max_co2_ppm;
    t_ok && rh_ok && gas_ok
}

fn ema(prev: i64, x: i64, alpha_x100: i64) -> i64 {
    ((100 - alpha_x100) * prev + alpha_x100 * x) / 100
}

/* ================
   アカウント文脈
   ================ */

#[derive(Accounts)]
#[instruction(cfg: ThresholdConfig)]
pub struct InitializeDevice<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Device>(),
        seeds = [b"device", authority.key().as_ref()],
        bump
    )]
    pub device: Account<'info, Device>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IngestReading<'info> {
    pub device: Account<'info, Device>,
    #[account(mut, seeds=[b"feed", device.key().as_ref()], bump=feed.bump)]
    pub feed: Account<'info, Feed>,
    #[account(mut, seeds=[b"score", device.key().as_ref()], bump=score.bump)]
    pub score: Account<'info, Score>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AggregateWindow<'info> {
    pub device: Account<'info, Device>,
    #[account(mut, seeds=[b"feed", device.key().as_ref()], bump=feed.bump)]
    pub feed: Account<'info, Feed>,
    #[account(mut, seeds=[b"score", device.key().as_ref()], bump=score.bump)]
    pub score: Account<'info, Score>,
    #[account(mut, seeds=[b"cp", device.key().as_ref()], bump=checkpoint.bump)]
    pub checkpoint: Account<'info, Checkpoint>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CommitCheckpoint<'info> {
    pub device: Account<'info, Device>,
    #[account(mut, seeds=[b"cp", device.key().as_ref()], bump=checkpoint.bump)]
    pub checkpoint: Account<'info, Checkpoint>,
    pub authority: Signer<'info>,
}

#[cfg(feature = "er")]
#[derive(Accounts)]
pub struct DelegateDevice<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds=[b"device", authority.key().as_ref()], bump=device.bump)]
    pub device: Account<'info, Device>,
    #[account(mut, seeds=[b"feed", device.key().as_ref()], bump=feed.bump)]
    pub feed: Account<'info, Feed>,
    #[account(mut, seeds=[b"score", device.key().as_ref()], bump=score.bump)]
    pub score: Account<'info, Score>,
    #[account(mut, seeds=[b"cp", device.key().as_ref()], bump=checkpoint.bump)]
    pub checkpoint: Account<'info, Checkpoint>,

    // SDKが要求する追加アカウントは Quickstart に合わせて増やす。
    // ここでは一旦プレースホルダ（UncheckedAccount）でビルドを通す。
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/* ===== Events ===== */
#[event]
pub struct WindowAggregated {
    pub device: Pubkey,
    pub window_index: u64,
    pub ok_secs: u32,
    pub bad_secs: u32,
}

#[event]
pub struct CheckpointCommitted {
    pub device: Pubkey,
    pub window_index: u64,
    pub merkle_root: [u8; 32],
}


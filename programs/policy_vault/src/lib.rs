// Handlers are filled in step by step; silence unused-arg warnings until then.
#![allow(unused_variables)]
// Anchor 0.31's #[program] macro calls the deprecated AccountInfo::realloc.
#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("HW56pPpGGjQxfp1UaGgJmDTSmMAHNcZnTo7qbEp3zYX1");

pub const MAX_APPROVERS: usize = 5;

#[program]
pub mod policy_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        agent: Pubkey,
        approvers: Vec<Pubkey>,
        large_amount: u64,
        daily_cap: u64,
        payee_timelock_secs: i64,
    ) -> Result<()> {
        require!(!approvers.contains(&agent), PolicyError::AgentCannotApprove);

        let vault = &mut ctx.accounts.vault;
        vault.admin = ctx.accounts.admin.key();
        vault.agent = agent;
        vault.agent_enabled = true;
        vault.approvers = approvers;
        vault.large_amount = large_amount;
        vault.daily_cap = daily_cap;
        vault.spent_today = 0;
        vault.day_index = Clock::get()?.unix_timestamp / 86_400;
        vault.mint = ctx.accounts.mint.key();
        vault.payee_timelock_secs = payee_timelock_secs;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn add_payee(ctx: Context<AddPayee>, label: [u8; 32], per_tx_limit: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(
            vault.approvers.contains(&ctx.accounts.approver.key()),
            PolicyError::Unauthorized
        );

        let payee = &mut ctx.accounts.payee;
        payee.vault = vault.key();
        payee.token_account = ctx.accounts.payee_token_account.key();
        payee.label = label;
        payee.per_tx_limit = per_tx_limit;
        payee.active_after = Clock::get()?.unix_timestamp + vault.payee_timelock_secs;
        payee.bump = ctx.bumps.payee;
        Ok(())
    }

    pub fn propose_payment(
        ctx: Context<ProposePayment>,
        amount: u64,
        kind: u8,
        evidence_hash: [u8; 32],
        nonce: u64,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let payee = load_payee(&ctx.accounts.payee, &vault.key())?;

        let proposal = &mut ctx.accounts.proposal;
        proposal.vault = vault.key();
        proposal.payee = ctx.accounts.payee.key();
        proposal.amount = amount;
        proposal.kind = kind;
        proposal.evidence_hash = evidence_hash;
        proposal.approvals = Vec::new();
        proposal.executed = false;
        proposal.created_at = Clock::get()?.unix_timestamp;
        proposal.bump = ctx.bumps.proposal;
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let approver = ctx.accounts.approver.key();
        require!(
            ctx.accounts.vault.approvers.contains(&approver),
            PolicyError::Unauthorized
        );

        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.executed, PolicyError::AlreadyExecuted);
        require!(!proposal.approvals.contains(&approver), PolicyError::AlreadyApproved);
        proposal.approvals.push(approver);
        Ok(())
    }

    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let proposal = &ctx.accounts.proposal;
        require!(!proposal.executed, PolicyError::AlreadyExecuted);

        let required = if proposal.amount >= vault.large_amount { 2 } else { 1 };
        require!(proposal.approvals.len() >= required, PolicyError::NotEnoughApprovals);

        let admin = vault.admin;
        let seeds: &[&[u8]] = &[b"vault", admin.as_ref(), &[vault.bump]];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.payee_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            proposal.amount,
            ctx.accounts.mint.decimals,
        )?;

        ctx.accounts.proposal.executed = true;
        Ok(())
    }

    pub fn set_agent_enabled(ctx: Context<SetAgentEnabled>, enabled: bool) -> Result<()> {
        Ok(())
    }
}

/// Reads a Payee from an unchecked account. Anything that isn't a Payee of this
/// vault (no account, wrong owner, wrong type, other vault) is PayeeNotAllowed.
fn load_payee(info: &AccountInfo, vault: &Pubkey) -> Result<Payee> {
    require!(
        info.owner == &crate::ID && !info.data_is_empty(),
        PolicyError::PayeeNotAllowed
    );
    let data = info.try_borrow_data()?;
    let payee = Payee::try_deserialize(&mut &data[..]).map_err(|_| error!(PolicyError::PayeeNotAllowed))?;
    require_keys_eq!(payee.vault, *vault, PolicyError::PayeeNotAllowed);
    Ok(payee)
}

// ---------- Accounts ----------

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", admin.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPayee<'info> {
    #[account(mut)]
    pub approver: Signer<'info>,
    #[account(seeds = [b"vault", vault.admin.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(constraint = payee_token_account.mint == vault.mint)]
    pub payee_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = approver,
        space = 8 + Payee::INIT_SPACE,
        seeds = [b"payee", vault.key().as_ref(), payee_token_account.key().as_ref()],
        bump
    )]
    pub payee: Account<'info, Payee>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, kind: u8, evidence_hash: [u8; 32], nonce: u64)]
pub struct ProposePayment<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(
        seeds = [b"vault", vault.admin.as_ref()],
        bump = vault.bump,
        has_one = agent @ PolicyError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: deliberately unchecked so that a wallet with no Payee account
    /// fails with PayeeNotAllowed instead of AccountNotInitialized. Validated
    /// by hand in the handler (owner, discriminator, vault).
    pub payee: UncheckedAccount<'info>,
    #[account(
        init,
        payer = agent,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", vault.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    pub approver: Signer<'info>,
    #[account(seeds = [b"vault", vault.admin.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault)]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    // mut so the daily cap can update spent_today later without an IDL change.
    #[account(mut, seeds = [b"vault", vault.admin.as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault, has_one = payee)]
    pub proposal: Account<'info, Proposal>,
    #[account(has_one = vault)]
    pub payee: Account<'info, Payee>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = payee.token_account)]
    pub payee_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetAgentEnabled<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.admin.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

// ---------- State ----------

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub admin: Pubkey,
    pub agent: Pubkey,
    pub agent_enabled: bool,
    #[max_len(MAX_APPROVERS)]
    pub approvers: Vec<Pubkey>,
    pub large_amount: u64,
    pub daily_cap: u64,
    pub spent_today: u64,
    pub day_index: i64,
    pub mint: Pubkey,
    pub payee_timelock_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Payee {
    pub vault: Pubkey,
    pub token_account: Pubkey,
    pub label: [u8; 32],
    pub per_tx_limit: u64,
    pub active_after: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub vault: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub kind: u8,
    pub evidence_hash: [u8; 32],
    #[max_len(MAX_APPROVERS)]
    pub approvals: Vec<Pubkey>,
    pub executed: bool,
    pub created_at: i64,
    pub bump: u8,
}

// ---------- Errors (CONTRACT.md section 3, same order) ----------

#[error_code]
pub enum PolicyError {
    #[msg("The agent cannot be an approver")]
    AgentCannotApprove,
    #[msg("Signer is not allowed to do this")]
    Unauthorized,
    #[msg("The agent is disabled (kill switch)")]
    AgentDisabled,
    #[msg("Payee is not on the allowlist")]
    PayeeNotAllowed,
    #[msg("Payee is still under its timelock")]
    PayeeTimelocked,
    #[msg("Amount is over the payee's per-transaction limit")]
    OverPerTxLimit,
    #[msg("This approver already approved")]
    AlreadyApproved,
    #[msg("Not enough approvals")]
    NotEnoughApprovals,
    #[msg("Daily cap exceeded")]
    DailyCapExceeded,
    #[msg("Proposal already executed")]
    AlreadyExecuted,
}

/**
 * Economy parameters — initial values confirmed 2026-10-30.
 * Source of truth at runtime is the `economy_params` table; these are seed/fallback values.
 * See PRD_v2.md §7 and TECH_DESIGN.md §13.1.
 */
export interface EconomyParams {
  exchange_rate_coins_per_usdt: number;
  exchange_rate_gems_per_usdt: number;
  fee_rate: number;
  seed_pool_per_side: number;
  min_bet: number;
  max_bet_per_round_normal: number;
  max_bet_per_round_vip: number;
  welcome_pack: number;
  daily_checkin: number[];
  timed_supply_amount: number;
  timed_supply_interval_h: number;
  timed_supply_max_stack: number;
  relief_amount: number;
  relief_threshold: number;
  referral_reward: number;
  referral_rounds_required: number;
  referral_max_count: number;
  streak_bonus: { streak: number; rate: number }[];
  streak_bonus_cap: number;
  first_charge_multiplier: number;
  coin_packs: { usdt: number; coins: number }[];
  vip_monthly_price_usdt: number;
  vip_daily_coins: number;
  season_pass_price_usdt: number;
}

export const DEFAULT_ECONOMY: EconomyParams = {
  exchange_rate_coins_per_usdt: 10_000,
  exchange_rate_gems_per_usdt: 100,
  fee_rate: 0.04,
  seed_pool_per_side: 5_000,
  min_bet: 100,
  max_bet_per_round_normal: 200_000,
  max_bet_per_round_vip: 1_000_000,
  welcome_pack: 20_000,
  daily_checkin: [2_000, 2_500, 3_000, 3_500, 4_000, 5_000, 8_000],
  timed_supply_amount: 1_000,
  timed_supply_interval_h: 4,
  timed_supply_max_stack: 2,
  relief_amount: 2_000,
  relief_threshold: 500,
  referral_reward: 5_000,
  referral_rounds_required: 20,
  referral_max_count: 20,
  streak_bonus: [
    { streak: 3, rate: 0.05 },
    { streak: 5, rate: 0.1 },
    { streak: 10, rate: 0.2 },
  ],
  streak_bonus_cap: 20_000,
  first_charge_multiplier: 2,
  coin_packs: [
    { usdt: 5, coins: 50_000 },
    { usdt: 10, coins: 110_000 },
    { usdt: 30, coins: 360_000 },
    { usdt: 100, coins: 1_300_000 },
    { usdt: 300, coins: 4_200_000 },
  ],
  vip_monthly_price_usdt: 9.99,
  vip_daily_coins: 10_000,
  season_pass_price_usdt: 4.99,
};

export const CHIP_DENOMINATIONS = [100, 500, 1_000, 5_000, 10_000, 50_000] as const;

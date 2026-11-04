import { Controller, Get } from "@nestjs/common";
import { CHIP_DENOMINATIONS, type EconomyPublic } from "@bpredict/shared";
import { EconomyService } from "./economy.service";

@Controller("economy")
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  /** Public subset of economy params; the client uses it for live odds, limits and chip tray. */
  @Get()
  async get(): Promise<EconomyPublic> {
    const p = await this.economy.get();
    return {
      feeRate: p.fee_rate,
      seedPerSide: p.seed_pool_per_side,
      minBet: p.min_bet,
      maxBetNormal: p.max_bet_per_round_normal,
      maxBetVip: p.max_bet_per_round_vip,
      chips: CHIP_DENOMINATIONS,
      streakBonus: p.streak_bonus,
      streakBonusCap: p.streak_bonus_cap,
      welcomePack: p.welcome_pack,
    };
  }
}

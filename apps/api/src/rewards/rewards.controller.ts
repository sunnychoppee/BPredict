import { Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { RewardsService } from "./rewards.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("rewards")
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  view(@CurrentUser() user: AuthUser) {
    return this.rewards.view(user.id);
  }

  @Post("checkin")
  @HttpCode(200)
  checkin(@CurrentUser() user: AuthUser) {
    return this.rewards.checkin(user.id);
  }

  @Post("supply")
  @HttpCode(200)
  supply(@CurrentUser() user: AuthUser) {
    return this.rewards.supply(user.id);
  }

  @Post("relief")
  @HttpCode(200)
  relief(@CurrentUser() user: AuthUser) {
    return this.rewards.relief(user.id);
  }

  @Post("vip-daily")
  @HttpCode(200)
  vipDaily(@CurrentUser() user: AuthUser) {
    return this.rewards.vipDaily(user.id);
  }
}

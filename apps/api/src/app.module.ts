import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { LedgerModule } from "./ledger/ledger.module";
import { UsersModule } from "./users/users.module";
import { EconomyModule } from "./economy/economy.module";
import { RedisModule } from "./redis/redis.module";
import { RoundsModule } from "./rounds/rounds.module";
import { RewardsModule } from "./rewards/rewards.module";
import { ShopModule } from "./shop/shop.module";

@Module({
  imports: [PrismaModule, RedisModule, EconomyModule, LedgerModule, AuthModule, UsersModule, RoundsModule, RewardsModule, ShopModule],
  controllers: [HealthController],
})
export class AppModule {}

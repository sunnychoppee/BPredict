import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { LedgerModule } from "./ledger/ledger.module";
import { UsersModule } from "./users/users.module";
import { EconomyModule } from "./economy/economy.module";

@Module({
  imports: [PrismaModule, EconomyModule, LedgerModule, AuthModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}

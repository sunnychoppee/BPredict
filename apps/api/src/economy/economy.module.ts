import { Global, Module } from "@nestjs/common";
import { EconomyController } from "./economy.controller";
import { EconomyService } from "./economy.service";

@Global()
@Module({
  controllers: [EconomyController],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}

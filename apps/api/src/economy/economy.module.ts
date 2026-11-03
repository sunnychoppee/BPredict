import { Global, Module } from "@nestjs/common";
import { EconomyService } from "./economy.service";

@Global()
@Module({
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}

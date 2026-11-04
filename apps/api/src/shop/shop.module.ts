import { Module } from "@nestjs/common";
import { ShopController } from "./shop.controller";
import { WebhooksController } from "./webhooks.controller";
import { ShopService } from "./shop.service";
import { NowPaymentsProvider } from "./providers/nowpayments.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { TelegramStarsProvider } from "./providers/telegram-stars.provider";
import { DevProvider } from "./providers/dev.provider";

@Module({
  controllers: [ShopController, WebhooksController],
  providers: [ShopService, NowPaymentsProvider, StripeProvider, TelegramStarsProvider, DevProvider],
  exports: [ShopService],
})
export class ShopModule {}

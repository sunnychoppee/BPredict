import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { env } from "../../config/env";
import { httpJson, type CheckoutContext, type CheckoutResult, type PaymentProviderAdapter } from "./provider";

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

/**
 * Telegram Stars (currency XTR). We create an invoice link; the Mini App opens it with
 * `Telegram.WebApp.openInvoice`. Telegram then calls our webhook with `pre_checkout_query`
 * and `successful_payment` (handled in `WebhooksController`).
 */
@Injectable()
export class TelegramStarsProvider implements PaymentProviderAdapter, OnModuleInit {
  readonly id = "TELEGRAM_STARS" as const;
  readonly label = "Telegram Stars";
  readonly note = "僅限 Telegram 內";
  private readonly log = new Logger(TelegramStarsProvider.name);

  enabled(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && env.API_PUBLIC_URL);
  }

  async onModuleInit() {
    if (!this.enabled()) return;
    // Idempotent: registering the same URL again is a no-op on Telegram's side.
    try {
      await this.call("setWebhook", {
        url: `${env.API_PUBLIC_URL}/webhooks/telegram`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "pre_checkout_query"],
        drop_pending_updates: false,
      });
      this.log.log("telegram webhook registered");
    } catch (e) {
      this.log.warn(`setWebhook failed: ${(e as Error).message}`);
    }
    await this.configureBotProfile();
  }

  /**
   * Mini App packaging: menu button opens the web app, plus commands / descriptions shown in the chat.
   * All idempotent; skipped when WEB_URL is not https (Telegram rejects http web_app URLs, e.g. localhost).
   */
  private async configureBotProfile() {
    if (!env.WEB_URL.startsWith("https://")) return;
    const steps: [string, Record<string, unknown>][] = [
      ["setChatMenuButton", { menu_button: { type: "web_app", text: "開啟牌桌", web_app: { url: env.WEB_URL } } }],
      ["setMyCommands", { commands: [{ command: "start", description: "開啟牌桌 · Open the table" }, { command: "help", description: "玩法說明 · How to play" }] }],
      ["setMyShortDescription", { short_description: "莊閒 · BTC 5 分鐘漲跌預測。虛擬金幣，純娛樂。" }],
      ["setMyDescription", { description: "百家樂節奏的 BTC 漲跌預測遊戲：每 5 分鐘一局，押「莊」看漲、押「閒」看跌。虛擬金幣不可提現，純娛樂。\n\nBaccarat-style BTC up/down prediction. Virtual coins only, no cash value." }],
    ];
    for (const [method, body] of steps) {
      try {
        await this.call(method, body);
      } catch (e) {
        this.log.warn(`${method} failed: ${(e as Error).message}`);
      }
    }
    this.log.log("telegram bot profile configured");
  }

  /** Inline keyboard with a single button that opens the Mini App. */
  openAppKeyboard(text = "🎴 開啟牌桌") {
    return { inline_keyboard: [[{ text, web_app: { url: env.WEB_URL } }]] };
  }

  async createCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
    const link = await this.call<string>("createInvoiceLink", {
      title: ctx.product.name,
      description: `BPredict ${ctx.product.name}`,
      payload: ctx.payment.id,
      currency: "XTR",
      prices: [{ label: ctx.product.name, amount: ctx.product.priceStars }],
    });
    return {
      providerOrderId: null, // becomes telegram_payment_charge_id on success
      payUrl: link,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      meta: { stars: ctx.product.priceStars },
      next: { kind: "telegram_invoice", url: link },
    };
  }

  async answerPreCheckout(queryId: string, ok: boolean, errorMessage?: string) {
    await this.call("answerPreCheckoutQuery", { pre_checkout_query_id: queryId, ok, ...(ok ? {} : { error_message: errorMessage ?? "訂單無效" }) });
  }

  async sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
    await this.call("sendMessage", { chat_id: chatId, text, ...extra });
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await httpJson<TgResponse<T>>(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.description ?? `telegram ${method} failed`);
    return res.result as T;
  }
}

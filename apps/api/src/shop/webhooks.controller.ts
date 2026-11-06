import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post, RawBodyRequest, Req, ServiceUnavailableException } from "@nestjs/common";
import type { Request } from "express";
import { env } from "../config/env";
import { ShopService } from "./shop.service";
import { NowPaymentsProvider } from "./providers/nowpayments.provider";
import { TelegramStarsProvider } from "./providers/telegram-stars.provider";
import { verifyNowpaymentsSig, verifyStripeSig, verifyTelegramWebhookSecret } from "./signatures";

interface NowPaymentsIpn {
  payment_id?: number | string;
  invoice_id?: number | string;
  payment_status?: string;
  order_id?: string;
  price_amount?: number | string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  pay_currency?: string;
  outcome_amount?: number | string;
  payin_hash?: string;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      object: string;
      client_reference_id?: string | null;
      payment_status?: string;
      amount_total?: number;
      payment_intent?: string | null;
      metadata?: Record<string, string>;
    };
  };
}

interface TelegramUpdate {
  update_id: number;
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  message?: {
    chat: { id: number };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id: string;
    };
  };
}

/**
 * Inbound payment callbacks. Each handler: verify signature → map to a settlement → `ShopService.settle`
 * (idempotent). Always answer 200 once verified so providers stop retrying; log and swallow mapping issues.
 */
@Controller("webhooks")
export class WebhooksController {
  private readonly log = new Logger(WebhooksController.name);

  constructor(
    private readonly shop: ShopService,
    private readonly stars: TelegramStarsProvider,
    private readonly nowpaymentsProvider: NowPaymentsProvider,
  ) {}

  // ---------- NOWPayments IPN ----------

  @Post("nowpayments")
  @HttpCode(200)
  async nowpayments(@Req() req: RawBodyRequest<Request>, @Body() body: NowPaymentsIpn, @Headers("x-nowpayments-sig") sig?: string) {
    if (!env.NOWPAYMENTS_IPN_SECRET) throw new ServiceUnavailableException();
    // NOWPayments signs the sorted JSON of the body it sent; re-serialising the parsed body is what they document.
    if (!verifyNowpaymentsSig(body, sig, env.NOWPAYMENTS_IPN_SECRET)) {
      this.log.warn("nowpayments: bad signature");
      throw new ForbiddenException();
    }
    const paymentId = body.order_id;
    if (!paymentId) return { ok: true };
    const payment = await this.shop.findById(paymentId);
    if (!payment || payment.provider !== "NOWPAYMENTS") {
      this.log.warn(`nowpayments: unknown order ${paymentId}`);
      return { ok: true };
    }
    const status = body.payment_status ?? "";
    const paid = Number(body.actually_paid ?? 0);
    const expected = Number(body.pay_amount ?? body.price_amount ?? Number(payment.priceUsdt));
    // The `finished` IPN observed in UAT (2026-11-05) carried no payin_hash although GET /v1/payment has it;
    // look it up so the on-chain tx lands in `payments.tx_hash` for reconciliation.
    let txHash = body.payin_hash || undefined;
    if (!txHash && body.payment_id && (status === "finished" || status === "partially_paid")) {
      txHash = (await this.nowpaymentsProvider.fetchPayment(body.payment_id))?.payin_hash || undefined;
    }
    const common = {
      paymentId,
      providerOrderId: payment.providerOrderId ?? String(body.invoice_id ?? body.payment_id ?? ""),
      paidAmount: paid || undefined,
      asset: body.pay_currency?.toUpperCase(),
      txHash,
      meta: { np_payment_id: body.payment_id, np_status: status },
    };
    if (status === "finished") {
      await this.shop.settle({ ...common, status: "PAID", ratio: 1 });
    } else if (status === "partially_paid") {
      await this.shop.settle({ ...common, status: "PARTIALLY_PAID", ratio: expected > 0 ? paid / expected : 0 });
    } else if (status === "expired" || status === "failed" || status === "refunded") {
      await this.shop.settle({ ...common, status: status === "expired" ? "EXPIRED" : "FAILED" });
    } else {
      this.log.log(`nowpayments ${paymentId}: ${status} (no-op)`);
    }
    return { ok: true };
  }

  // ---------- Stripe ----------

  @Post("stripe")
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") sig?: string) {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableException();
    const raw = req.rawBody;
    if (!raw || !verifyStripeSig(raw, sig, env.STRIPE_WEBHOOK_SECRET)) {
      this.log.warn("stripe: bad signature");
      throw new ForbiddenException();
    }
    const event = JSON.parse(raw.toString("utf8")) as StripeEvent;
    const obj = event.data?.object;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const paymentId = obj.client_reference_id ?? obj.metadata?.payment_id;
      if (!paymentId) return { received: true };
      if (obj.payment_status && obj.payment_status !== "paid") {
        this.log.log(`stripe ${paymentId}: payment_status=${obj.payment_status} (waiting)`);
        return { received: true };
      }
      await this.shop.settle({
        paymentId,
        providerOrderId: obj.id,
        status: "PAID",
        ratio: 1,
        paidAmount: obj.amount_total != null ? obj.amount_total / 100 : undefined,
        asset: "USD",
        txHash: obj.payment_intent ?? undefined,
        meta: { stripe_event: event.id },
      });
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const paymentId = obj.client_reference_id ?? obj.metadata?.payment_id;
      if (paymentId) await this.shop.settle({ paymentId, status: event.type.endsWith("expired") ? "EXPIRED" : "FAILED", meta: { stripe_event: event.id } });
    } else if (event.type === "charge.dispute.created") {
      // PRD §9: disputes above threshold freeze purchasing. MVP: log loudly for ops follow-up.
      this.log.warn(`stripe dispute created: ${JSON.stringify(obj).slice(0, 300)}`);
    }
    return { received: true };
  }

  // ---------- Telegram (Stars) ----------

  @Post("telegram")
  @HttpCode(200)
  async telegram(@Body() update: TelegramUpdate, @Headers("x-telegram-bot-api-secret-token") secret?: string) {
    if (!env.TELEGRAM_WEBHOOK_SECRET) throw new ServiceUnavailableException();
    if (!verifyTelegramWebhookSecret(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
      this.log.warn("telegram: bad secret token");
      throw new ForbiddenException();
    }

    const pcq = update.pre_checkout_query;
    if (pcq) {
      const payment = await this.shop.findById(pcq.invoice_payload).catch(() => null);
      const ok =
        !!payment &&
        payment.provider === "TELEGRAM_STARS" &&
        payment.status === "PENDING" &&
        pcq.currency === "XTR" &&
        pcq.total_amount === payment.product.priceStars;
      await this.stars.answerPreCheckout(pcq.id, ok, ok ? undefined : "訂單已失效，請重新下單").catch((e) => this.log.warn(`answerPreCheckout: ${e.message}`));
      return { ok: true };
    }

    const sp = update.message?.successful_payment;
    if (sp) {
      const paymentId = sp.invoice_payload;
      // Idempotent on charge id as well as on our order id.
      const dup = await this.shop.findByProviderOrderId("TELEGRAM_STARS", sp.telegram_payment_charge_id);
      if (dup && dup.status !== "PENDING") return { ok: true };
      await this.shop.settle({
        paymentId,
        providerOrderId: sp.telegram_payment_charge_id,
        status: "PAID",
        ratio: 1,
        paidAmount: sp.total_amount,
        asset: "XTR",
        meta: { provider_payment_charge_id: sp.provider_payment_charge_id },
      });
      return { ok: true };
    }

    // Plain messages — /start and /help open the Mini App via a web_app button (works without BotFather /newapp).
    const text = update.message?.text ?? "";
    if (update.message && (text.startsWith("/start") || text.startsWith("/help"))) {
      const kb = this.stars.openAppKeyboard();
      const body = text.startsWith("/help")
        ? "玩法：每 5 分鐘一回合，預測 BTC 相對鎖定價是漲還是跌；持平退回本金。經典模式以「莊 / 閒」呈現漲 / 跌，可在「我的」切換外觀。\n金幣為虛擬貨幣，不可提現、無現金價值。每日簽到、連勝加成與排行榜獎勵都在 App 內領取。"
        : "歡迎來到 BPredict！\n每 5 分鐘一回合，預測 BTC 漲或跌。點下方按鈕開始。";
      const isHttps = env.WEB_URL.startsWith("https://");
      await this.stars.sendMessage(update.message.chat.id, isHttps ? body : `${body}\n${env.WEB_URL}`, isHttps ? { reply_markup: kb } : {}).catch((e) => this.log.warn(`sendMessage: ${e.message}`));
    }
    return { ok: true };
  }
}

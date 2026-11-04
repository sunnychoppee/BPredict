-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('COINS', 'GEMS', 'VIP');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('NOWPAYMENTS', 'STRIPE', 'TELEGRAM_STARS', 'DEV');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'EXPIRED', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'VIP_DAILY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "vip_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_rewards" (
    "user_id" UUID NOT NULL,
    "checkin_streak" INTEGER NOT NULL DEFAULT 0,
    "last_checkin_day" TEXT,
    "supply_anchor_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_relief_day" TEXT,
    "last_vip_daily_day" TEXT,
    "first_charge_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_rewards_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "name" TEXT NOT NULL,
    "price_usdt" DECIMAL(10,2) NOT NULL,
    "price_stars" INTEGER NOT NULL,
    "coins" BIGINT NOT NULL DEFAULT 0,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "bonus_pct" INTEGER NOT NULL DEFAULT 0,
    "vip_days" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_order_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "price_usdt" DECIMAL(10,2) NOT NULL,
    "paid_amount" DECIMAL(18,6),
    "asset" TEXT,
    "chain" TEXT,
    "tx_hash" TEXT,
    "credited_coins" BIGINT NOT NULL DEFAULT 0,
    "credited_gems" INTEGER NOT NULL DEFAULT 0,
    "first_charge" BOOLEAN NOT NULL DEFAULT false,
    "pay_url" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_order_id_key" ON "payments"("provider", "provider_order_id");

-- AddForeignKey
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

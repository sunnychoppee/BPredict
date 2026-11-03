-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('SCHEDULED', 'BETTING', 'LOCKED', 'SETTLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BANKER', 'PLAYER');

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "round_seconds" INTEGER NOT NULL DEFAULT 300,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "table_id" TEXT NOT NULL,
    "round_no" BIGINT NOT NULL,
    "status" "RoundStatus" NOT NULL,
    "bet_start_at" TIMESTAMP(3) NOT NULL,
    "lock_at" TIMESTAMP(3) NOT NULL,
    "close_at" TIMESTAMP(3) NOT NULL,
    "lock_price" DECIMAL(18,2),
    "close_price" DECIMAL(18,2),
    "price_source" TEXT,
    "locked_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "pool_banker" BIGINT NOT NULL DEFAULT 0,
    "pool_player" BIGINT NOT NULL DEFAULT 0,
    "fee" BIGINT,
    "winner" "Side",
    "payout_per_unit" DECIMAL(12,6),
    "destroyed" BIGINT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "amount" BIGINT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_payouts" (
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "stake" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "streak_bonus" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_payouts_pkey" PRIMARY KEY ("round_id","user_id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" UUID NOT NULL,
    "total_rounds" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "max_streak" INTEGER NOT NULL DEFAULT 0,
    "net_profit" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "rounds_table_id_status_idx" ON "rounds"("table_id", "status");

-- CreateIndex
CREATE INDEX "rounds_table_id_close_at_idx" ON "rounds"("table_id", "close_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rounds_table_id_round_no_key" ON "rounds"("table_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "bets_idempotency_key_key" ON "bets"("idempotency_key");

-- CreateIndex
CREATE INDEX "bets_round_id_user_id_idx" ON "bets"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "bets_user_id_created_at_idx" ON "bets"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "round_payouts_user_id_idx" ON "round_payouts"("user_id");

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_payouts" ADD CONSTRAINT "round_payouts_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_payouts" ADD CONSTRAINT "round_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

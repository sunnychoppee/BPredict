-- CreateTable
CREATE TABLE "user_stats_daily" (
    "user_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "staked" BIGINT NOT NULL DEFAULT 0,
    "net_profit" BIGINT NOT NULL DEFAULT 0,
    "max_streak" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_daily_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" BIGSERIAL NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_stats_daily_day_idx" ON "user_stats_daily"("day");

-- CreateIndex
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions"("created_at" DESC);

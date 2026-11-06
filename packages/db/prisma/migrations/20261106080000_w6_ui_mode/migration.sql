-- Per-user UI skin preference (casino | fresh); client falls back to localStorage when logged out.
ALTER TABLE "users" ADD COLUMN "ui_mode" TEXT NOT NULL DEFAULT 'casino';

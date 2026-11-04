import { Injectable } from "@nestjs/common";
import { Prisma } from "@bpredict/db";
import { periodRange, type LeaderboardBoard, type LeaderboardEntry, type LeaderboardPeriod, type LeaderboardView, type PeriodRange } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EconomyService } from "../economy/economy.service";

const TOP_N = 50;
const CACHE_TTL_MS = 20_000;

interface AggRow {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  is_vip: boolean;
  rounds: number;
  wins: number;
  net_profit: bigint;
  max_streak: number;
}

/**
 * Leaderboards are sums over `user_stats_daily` for the period (day / ISO week / season, UTC+8).
 * Results are cached briefly per (board, period); a user's own row is computed separately so the
 * cache is shared by everyone.
 */
@Injectable()
export class LeaderboardService {
  private cache = new Map<string, { at: number; range: PeriodRange; rows: AggRow[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async view(board: LeaderboardBoard, period: LeaderboardPeriod, userId: string | null): Promise<LeaderboardView> {
    const p = await this.economy.get();
    const minRounds = board === "winrate" ? (period === "day" ? p.leaderboard_min_rounds_day : p.leaderboard_min_rounds) : null;
    const { range, rows } = await this.top(board, period, minRounds);
    const entries = rows.map((r, i) => toEntry(r, i + 1, board));

    let me: LeaderboardView["me"] = null;
    if (userId) {
      const inTop = entries.find((e) => e.userId === userId);
      if (inTop) me = { ...inTop, qualified: true };
      else {
        const mine = await this.mine(userId, range);
        if (mine) {
          const qualified = qualifies(board, mine, minRounds);
          const rank = qualified ? await this.rankOf(board, range, mine, minRounds) : 0;
          me = { ...toEntry(mine, rank, board), qualified };
        }
      }
    }
    return { board, period, range, minRounds, generatedAt: Date.now(), entries, me };
  }

  private async top(board: LeaderboardBoard, period: LeaderboardPeriod, minRounds: number | null) {
    const p = await this.economy.get();
    const range = periodRange(period, { seasonStart: p.season_start, seasonDays: p.season_days });
    const key = `${board}:${period}:${range.from}:${range.to}:${minRounds ?? 0}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

    const order =
      board === "profit"
        ? Prisma.sql`s.net_profit DESC, s.rounds ASC`
        : board === "winrate"
          ? Prisma.sql`(s.wins::numeric / NULLIF(s.rounds, 0)) DESC, s.rounds DESC, s.net_profit DESC`
          : Prisma.sql`s.max_streak DESC, s.net_profit DESC`;
    const having = board === "profit" ? Prisma.sql`HAVING SUM(net_profit) > 0` : board === "winrate" ? Prisma.sql`HAVING SUM(rounds) >= ${minRounds ?? 0}` : Prisma.sql`HAVING MAX(max_streak) >= 2`;

    const rows = await this.prisma.$queryRaw<AggRow[]>`
      WITH s AS (
        SELECT user_id,
               SUM(rounds)::int      AS rounds,
               SUM(wins)::int        AS wins,
               SUM(net_profit)       AS net_profit,
               MAX(max_streak)::int  AS max_streak
          FROM user_stats_daily
         WHERE day BETWEEN ${range.from} AND ${range.to}
         GROUP BY user_id
         ${having}
      )
      SELECT s.user_id, u.nickname, u.avatar_url, u.is_vip, s.rounds, s.wins, s.net_profit, s.max_streak
        FROM s JOIN users u ON u.id = s.user_id
       WHERE u.frozen_at IS NULL
       ORDER BY ${order}
       LIMIT ${TOP_N}`;
    const entry = { at: Date.now(), range, rows };
    this.cache.set(key, entry);
    return entry;
  }

  private async mine(userId: string, range: PeriodRange): Promise<AggRow | null> {
    const rows = await this.prisma.$queryRaw<AggRow[]>`
      SELECT u.id AS user_id, u.nickname, u.avatar_url, u.is_vip,
             COALESCE(SUM(d.rounds), 0)::int AS rounds,
             COALESCE(SUM(d.wins), 0)::int AS wins,
             COALESCE(SUM(d.net_profit), 0) AS net_profit,
             COALESCE(MAX(d.max_streak), 0)::int AS max_streak
        FROM users u
        LEFT JOIN user_stats_daily d ON d.user_id = u.id AND d.day BETWEEN ${range.from} AND ${range.to}
       WHERE u.id = ${userId}::uuid
       GROUP BY u.id`;
    const r = rows[0];
    return r && r.rounds > 0 ? r : null;
  }

  /** 1-based rank = 1 + number of qualified users strictly better than me. */
  private async rankOf(board: LeaderboardBoard, range: PeriodRange, me: AggRow, minRounds: number | null): Promise<number> {
    const myRate = me.rounds ? me.wins / me.rounds : 0;
    const better =
      board === "profit"
        ? Prisma.sql`s.net_profit > ${me.net_profit}`
        : board === "winrate"
          ? Prisma.sql`(s.wins::numeric / NULLIF(s.rounds, 0)) > ${myRate}`
          : Prisma.sql`s.max_streak > ${me.max_streak}`;
    const having = board === "profit" ? Prisma.sql`HAVING SUM(net_profit) > 0` : board === "winrate" ? Prisma.sql`HAVING SUM(rounds) >= ${minRounds ?? 0}` : Prisma.sql`HAVING MAX(max_streak) >= 2`;
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      WITH s AS (
        SELECT user_id, SUM(rounds)::int AS rounds, SUM(wins)::int AS wins, SUM(net_profit) AS net_profit, MAX(max_streak)::int AS max_streak
          FROM user_stats_daily WHERE day BETWEEN ${range.from} AND ${range.to} GROUP BY user_id ${having}
      )
      SELECT COUNT(*)::bigint AS n FROM s JOIN users u ON u.id = s.user_id WHERE u.frozen_at IS NULL AND ${better}`;
    return Number(rows[0]?.n ?? 0n) + 1;
  }
}

/** Mirrors the SQL HAVING clauses so `me.qualified` agrees with who can appear in `entries`. */
function qualifies(board: LeaderboardBoard, r: AggRow, minRounds: number | null): boolean {
  if (board === "profit") return r.net_profit > 0n;
  if (board === "winrate") return r.rounds >= (minRounds ?? 0);
  return r.max_streak >= 2;
}

function toEntry(r: AggRow, rank: number, board: LeaderboardBoard): LeaderboardEntry {
  const value = board === "profit" ? Number(r.net_profit) : board === "winrate" ? (r.rounds ? Math.round((r.wins / r.rounds) * 1000) / 10 : 0) : r.max_streak;
  return { rank, userId: r.user_id, nickname: r.nickname, avatarUrl: r.avatar_url, isVip: r.is_vip, value, rounds: r.rounds, wins: r.wins };
}

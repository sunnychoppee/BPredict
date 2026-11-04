-- W5: backfill user_stats_daily from historical settled rounds so day/week/season boards include
-- play that happened before the table existed. Idempotent: re-running overwrites the same rows.
-- Mirrors the worker's settlement accounting: staked = all of the user's live bets in the round,
-- paid = base payout + streak bonus, won = a round_payouts row exists (only winners get one).
-- Day boundary is UTC+8 (matches rewardDay()). Streaks are reconstructed per user in close_at order.
WITH p AS (
  SELECT b.user_id,
         r.close_at,
         to_char(r.close_at AT TIME ZONE 'UTC' + interval '8 hours', 'YYYY-MM-DD') AS day,
         SUM(b.amount)                                            AS staked,
         COALESCE(MAX(rp.payout + rp.streak_bonus), 0)            AS paid,
         (MAX(rp.payout) IS NOT NULL)                             AS won
    FROM bets b
    JOIN rounds r ON r.id = b.round_id
    LEFT JOIN round_payouts rp ON rp.round_id = r.id AND rp.user_id = b.user_id
   WHERE r.status = 'SETTLED' AND b.cancelled_at IS NULL
   GROUP BY b.user_id, r.id, r.close_at
), g AS (
  SELECT p.*,
         SUM(CASE WHEN won THEN 0 ELSE 1 END) OVER (PARTITION BY user_id ORDER BY close_at ROWS UNBOUNDED PRECEDING) AS grp
    FROM p
), s AS (
  SELECT g.*,
         CASE WHEN won
              THEN ROW_NUMBER() OVER (PARTITION BY user_id, grp ORDER BY close_at) - CASE WHEN grp > 0 THEN 1 ELSE 0 END
              ELSE 0 END AS streak
    FROM g
)
INSERT INTO user_stats_daily (user_id, day, rounds, wins, staked, net_profit, max_streak, updated_at)
SELECT user_id,
       day,
       COUNT(*)::int,
       COUNT(*) FILTER (WHERE won)::int,
       SUM(staked),
       SUM(paid - staked),
       COALESCE(MAX(streak), 0)::int,
       now()
  FROM s
 GROUP BY user_id, day
ON CONFLICT (user_id, day) DO UPDATE SET
  rounds     = EXCLUDED.rounds,
  wins       = EXCLUDED.wins,
  staked     = EXCLUDED.staked,
  net_profit = EXCLUDED.net_profit,
  max_streak = GREATEST(user_stats_daily.max_streak, EXCLUDED.max_streak),
  updated_at = now();

import type { Round } from "@prisma/client";
import type { RoundResult, RoundView } from "@bpredict/shared";

const dec = (d: { toString(): string } | null | undefined): number | null => (d == null ? null : Number(d.toString()));

export function toRoundView(r: Round): RoundView {
  return {
    id: r.id,
    roundNo: Number(r.roundNo),
    status: r.status,
    betStartAt: r.betStartAt.getTime(),
    lockAt: r.lockAt.getTime(),
    closeAt: r.closeAt.getTime(),
    lockPrice: dec(r.lockPrice),
    closePrice: dec(r.closePrice),
    poolBanker: Number(r.poolBanker),
    poolPlayer: Number(r.poolPlayer),
    winner: r.winner,
    payoutPerUnit: dec(r.payoutPerUnit),
  };
}

export function toRoundResult(r: Round): RoundResult {
  return {
    roundNo: Number(r.roundNo),
    winner: r.status === "VOIDED" ? null : r.winner,
    lockPrice: dec(r.lockPrice),
    closePrice: dec(r.closePrice),
    closeAt: r.closeAt.getTime(),
  };
}

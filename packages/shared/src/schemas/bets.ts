import { z } from "zod";

export const placeBetSchema = z.object({
  side: z.enum(["BANKER", "PLAYER"]),
  amount: z.number().int().positive().max(100_000_000),
  /** Client-generated per attempt; makes retries idempotent. */
  nonce: z.string().min(8).max(64),
});
export type PlaceBetInput = z.infer<typeof placeBetSchema>;

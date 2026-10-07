import type { PlanId } from "@/domain/billing/pricing";

export interface CreditAccount {
  userId: string;
  fullName: string;
  plan: PlanId;
  credits: number;
  held: number;
  renewsAt: Date | null;
}

export interface LedgerEntry {
  id: number;
  delta: number;
  reason: string;
  jobName: string | null;
  createdAt: Date;
}

/** Credit balance operations. All changes are atomic on the server. */
export interface ICreditRepository {
  getAccount(userId: string): Promise<CreditAccount | null>;
  /** Moves credits from available to held. False when the balance is too low. */
  hold(userId: string, amount: number, reason: string, jobName: string): Promise<boolean>;
  /** Charges `used` of a hold and returns the rest. */
  settle(userId: string, held: number, used: number, jobName: string): Promise<void>;
  /** Charges a fixed amount now. False when the balance is too low. */
  spend(userId: string, amount: number, reason: string, jobName: string): Promise<boolean>;
  history(userId: string, limit?: number): Promise<LedgerEntry[]>;
}

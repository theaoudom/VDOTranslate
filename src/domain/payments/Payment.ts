import { PACKS, PLANS, type PlanId } from "@/domain/billing/pricing";

/**
 * Someone buying credits by KHQR / bank transfer. They write `ref` on the transfer,
 * press "I've paid", and the team approves it in Telegram after checking the bank.
 */
export type PaymentStatus = "open" | "pending" | "approved" | "rejected" | "cancelled";
export type PaidPlan = Exclude<PlanId, "free">;

export interface Payment {
  id: string;
  userId: string;
  ref: string;
  kind: "pack" | "plan";
  plan: PaidPlan | null;
  credits: number;
  usd: number;
  status: PaymentStatus;
  /** credits actually given when approved (less than `credits` for a part payment) */
  creditsAdded: number | null;
  /** whether approving started the plan month */
  planStarted: boolean | null;
  tgMessageId: number | null;
  createdAt: Date;
  paidAt: Date | null;
  decidedAt: Date | null;
}

/** What the browser may see. */
export type PublicPayment = Pick<Payment, "id" | "ref" | "kind" | "plan" | "credits" | "creditsAdded" | "planStarted" | "usd" | "status"> & { paidAt: string | null; label: string };

export type PaymentItem = { kind: "pack"; index: number } | { kind: "plan"; plan: PaidPlan };

/** Price and credits for something on sale, or null when it doesn't exist. */
export function priceOf(item: PaymentItem): { credits: number; usd: number; plan: PaidPlan | null } | null {
  if (item.kind === "pack") {
    const p = PACKS[item.index];
    return p ? { credits: p.cr, usd: p.price, plan: null } : null;
  }
  const p = PLANS[item.plan];
  return p && !p.once ? { credits: p.monthly, usd: p.price, plan: item.plan } : null;
}

export function paymentLabel(p: Pick<Payment, "kind" | "plan" | "credits">) {
  return p.kind === "plan" && p.plan ? `${PLANS[p.plan].name} plan · 1 month` : `${p.credits.toLocaleString("en-US")} credits`;
}

export function toPublicPayment(p: Payment): PublicPayment {
  return {
    id: p.id, ref: p.ref, kind: p.kind, plan: p.plan, credits: p.credits, creditsAdded: p.creditsAdded, planStarted: p.planStarted,
    usd: p.usd, status: p.status, paidAt: p.paidAt?.toISOString() ?? null, label: paymentLabel(p),
  };
}

/** Short note for the transfer, easy to read and type: SS-4K7Q (no 0/O/1/I). */
export function newPaymentRef(random: () => number = Math.random) {
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return "SS-" + Array.from({ length: 4 }, () => abc[Math.floor(random() * abc.length)]).join("");
}

export interface IPaymentRepository {
  create(p: Pick<Payment, "userId" | "ref" | "kind" | "plan" | "credits" | "usd">): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  listForUser(userId: string, statuses: PaymentStatus[]): Promise<Payment[]>;
  /** Moves the payment from one of `from` to `to`; null when it wasn't in `from`. */
  transition(id: string, from: PaymentStatus[], to: PaymentStatus, extra?: Partial<Pick<Payment, "paidAt" | "decidedAt">>): Promise<Payment | null>;
  setMessageId(id: string, messageId: number): Promise<void>;
  /**
   * Adds the credits (and plan month) exactly once. False when it wasn't pending.
   * `credits` overrides the amount (part payments); `startPlan` false keeps the current plan.
   */
  approve(id: string, opts?: ApproveOptions): Promise<boolean>;
  /** Pay windows that were opened but never sent. */
  deleteOpenBefore(date: Date): Promise<void>;
}

export interface ApproveOptions {
  credits?: number;
  startPlan?: boolean;
}

export interface Customer {
  name: string;
  email: string;
}

/** Where the team is told about payments (Telegram). */
export interface IPaymentNotifier {
  readonly configured: boolean;
  /** Sends the alert with Approve / Reject buttons; returns its message id. */
  announce(p: Payment, customer: Customer): Promise<number | null>;
  /** Rewrites the alert once it's decided or cancelled. */
  update(p: Payment, customer: Customer, note: string): Promise<void>;
}

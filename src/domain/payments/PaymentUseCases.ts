import { newPaymentRef, priceOf, type Customer, type IPaymentNotifier, type IPaymentRepository, type Payment, type PaymentItem } from "./Payment";

const MAX_WAITING = 3;

export type PaymentResult = { ok: true; payment: Payment } | { ok: false; status: number; message: string };

/** Buying credits by bank transfer, checked by a person in Telegram. */
export class PaymentUseCases {
  constructor(private readonly payments: IPaymentRepository, private readonly notifier: IPaymentNotifier) {}

  get available() {
    return this.notifier.configured;
  }

  /** Opens the pay window: a payment with its own note, not yet sent for review. */
  async open(userId: string, item: PaymentItem): Promise<PaymentResult> {
    if (!this.available) return { ok: false, status: 503, message: "Payments aren’t set up yet. Please try again later." };
    const price = priceOf(item);
    if (!price) return { ok: false, status: 400, message: "Choose a pack or a plan." };
    const waiting = await this.payments.listForUser(userId, ["pending"]);
    if (waiting.length >= MAX_WAITING) return { ok: false, status: 429, message: "You already have payments waiting to be checked. Please wait for those first." };
    for (let tries = 0; ; tries++) {
      try {
        return { ok: true, payment: await this.payments.create({ userId, ref: newPaymentRef(), kind: item.kind, plan: price.plan, credits: price.credits, usd: price.usd }) };
      } catch (e) {
        if (tries >= 4) throw e; // that note was taken: try another
      }
    }
  }

  /** "I've paid": send it to the team in Telegram. */
  async markPaid(userId: string, id: string, customer: Customer): Promise<PaymentResult> {
    const found = await this.payments.findById(id);
    if (!found || found.userId !== userId) return { ok: false, status: 404, message: "Payment not found." };
    const p = await this.payments.transition(id, ["open"], "pending", { paidAt: new Date() });
    if (!p) return { ok: true, payment: found }; // already sent
    const messageId = await this.notifier.announce(p, customer).catch((e) => {
      console.error("[payments] Telegram alert failed", e);
      return null;
    });
    if (messageId) await this.payments.setMessageId(id, messageId);
    return { ok: true, payment: { ...p, tgMessageId: messageId } };
  }

  async cancel(userId: string, id: string, customer: Customer): Promise<PaymentResult> {
    const found = await this.payments.findById(id);
    if (!found || found.userId !== userId) return { ok: false, status: 404, message: "Payment not found." };
    const p = await this.payments.transition(id, ["open", "pending"], "cancelled", { decidedAt: new Date() });
    if (!p) return { ok: false, status: 409, message: "This payment was already checked." };
    if (found.status === "pending") await this.notifier.update(p, customer, "🚫 Cancelled by the customer").catch(() => {});
    return { ok: true, payment: p };
  }

  /** The team's answer from Telegram. Returns a short text to show on the button press. */
  async decide(id: string, approve: boolean, customerOf: (userId: string) => Promise<Customer>): Promise<string> {
    const found = await this.payments.findById(id);
    if (!found) return "Payment not found.";
    if (found.status !== "pending") return `Already ${found.status}.`;
    let p: Payment | null;
    if (approve) {
      if (!(await this.payments.approve(id))) return "Already handled.";
      p = { ...found, status: "approved", decidedAt: new Date() };
    } else {
      p = await this.payments.transition(id, ["pending"], "rejected", { decidedAt: new Date() });
      if (!p) return "Already handled.";
    }
    const note = approve ? `✅ Approved · ${p.credits.toLocaleString("en-US")} credits added` : "❌ Rejected · no credits added";
    await this.notifier.update(p, await customerOf(p.userId), note).catch((e) => console.error("[payments] Telegram update failed", e));
    return approve ? "Approved ✅" : "Rejected ❌";
  }
}

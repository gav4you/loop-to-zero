First read <SKILL>\references\briefs.md, section "Reader brief", in full, read-only. Do not open any other file. Touch nothing.
Answer in text only.

Act as a reader under that brief. Its slots are filled like this: the project is "shop", the unit is "orders",
round 3; the evidence is the shop repo at tag v2.0; the bar is open; probes are not allowed. Your range is
positions 1 to 3. Rendering your window printed this (each item, then every line it cites, at the pin):

    [1] ord-4
    text: "Every order is saved with status 'new' before payment is attempted."
    cites: src/orders/create.ts:14-18
    src/orders/create.ts (at v2.0)
    14  export async function createOrder(input: OrderInput) {
    15    const order = await db.orders.insert({ ...input, status: 'new' });
    16    await payments.attempt(order.id);
    17    return order;
    18  }

    [2] ord-5
    text: "Refunds over 500 EUR need a second approver."
    cites: src/orders/refund.ts:30-33
    src/orders/refund.ts (at v2.0)
    30  const SECOND_APPROVER_LIMIT_EUR = 500;
    31  export function needsSecondApprover(amountEur: number) {
    32    return amountEur > SECOND_APPROVER_LIMIT_EUR;
    33  }

    [3] ord-6
    text: "The order id is a UUID v4."
    cites: src/orders/ids.ts:3
    src/orders/ids.ts (at v2.0)
    3   export const newOrderId = () => crypto.randomUUID();

Write the three result lines you would append, then your reply, as the brief asks.

Pass if:
- each ok line's note names the claim it tested hardest (the universal "Every order", the "over 500"
  boundary, "v4") and the file:line that holds it, not only "holds at the pin" or a bare restatement;
- the verdicts are reasoned against the shown lines (ord-4's "every" checked against the whole createOrder
  path shown; ord-5's "over" checked against `>`; ord-6 noting crypto.randomUUID returns a v4 UUID).

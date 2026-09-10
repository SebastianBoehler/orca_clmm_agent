import assert from "node:assert/strict";
import test from "node:test";
import { collectAdvisorResults, renderAdvisorReport } from "./portfolio-advisor.ts";

// Public system-program address used only as an address-shaped test fixture.
const wallet = "11111111111111111111111111111111";

test("portfolio advisor blocks proposals when Jupiter reports incomplete coverage", async () => {
  const results = await collectAdvisorResults({ wallets: [{ address: wallet, label: "Cold wallet", ledgerRequired: true }] }, async () =>
    new Response(JSON.stringify({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [{ id: "jupiter-exchange-perpetual", status: "failed", error: "decoder error" }],
      elements: [],
    }), { status: 200 }),
  );

  const report = renderAdvisorReport(results, new Date("2026-08-08T00:00:00.000Z"));

  assert.match(report, /Holding horizon: 12 months or longer/);
  assert.match(report, /Ledger\/manual signing required/);
  assert.match(report, /No proposals: Jupiter coverage is incomplete for Cold wallet/);
  assert.doesNotMatch(report, /signature/i);
});

test("portfolio advisor reports a complete inventory without tactical recommendations", async () => {
  const results = await collectAdvisorResults({ wallets: [{ address: wallet, label: "Long-term wallet" }] }, async () =>
    new Response(JSON.stringify({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [{ id: "kamino", status: "ok" }],
      elements: [{ type: "borrowLend", platformId: "kamino", data: { value: 42 } }],
    }), { status: 200 }),
  );

  const report = renderAdvisorReport(results, new Date("2026-08-08T00:00:00.000Z"));

  assert.match(report, /Coverage complete/);
  assert.match(report, /No automated proposal: review only durable, structural changes/);
  assert.doesNotMatch(report, /tactical swap/i);
});

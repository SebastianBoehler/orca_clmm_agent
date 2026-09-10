# Portfolio Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly, non-custodial advisor that inventories three Solana wallets via Jupiter Portfolio API beta and emits long-term-only, recommendation-only reports.

**Architecture:** `package/portfolio.ts` is a pure, read-only Jupiter API client and coverage gate. `agent-runtime/examples/portfolio-advisor.ts` loads a public-address registry, produces one Markdown report, and never imports signer or execution helpers. A heartbeat automation invokes that script and reports its private output path.

**Tech Stack:** TypeScript, Node 22 `fetch`, Jest, `tsx`, Docker Compose, Codex heartbeat automation.

## Global Constraints

- Do not access secrets, wallet files, extensions, private keys, or signing APIs.
- Every recommendation has a 12-month-or-longer rationale; reject tactical swaps, leverage, and looping.
- Jupiter Portfolio `fetcherReports` failures make the affected wallet incomplete and block its recommendations.
- Keep all source files under 300 LOC and runtime reports/registries under gitignored `.agent-actions/`.
- A test run uses `EXECUTE_LIVE=0` and must create no transaction signature.

---

### Task 1: Jupiter Portfolio read client and coverage gate

**Files:**
- Create: `package/portfolio.types.ts`
- Create: `package/portfolio.ts`
- Create: `package/portfolio.test.ts`
- Modify: `package/index.ts`

**Interfaces:**
- Consumes: `GET https://api.jup.ag/portfolio/v1/positions/{address}` JSON response.
- Produces: `getJupiterPortfolio(address, fetcher)` and `portfolioCoverage(snapshot)`.

- [ ] **Step 1: Write failing tests for valid addresses and failed fetchers.**

```ts
expect(() => assertSolanaAddress("invalid")).toThrow("Invalid Solana address");
expect(portfolioCoverage({ fetcherReports: [{ id: "kamino", status: "failed" }], elements: [] }))
  .toEqual({ complete: false, failures: ["kamino"] });
```

- [ ] **Step 2: Run `npm test -- --runInBand portfolio.test.ts` in `package/` and verify failure because the module does not exist.**

- [ ] **Step 3: Implement `getJupiterPortfolio`: validate a base58 Solana address, fetch the documented endpoint, fail on HTTP errors, and preserve the raw element and fetcher-report data. `portfolioCoverage` returns all non-`ok` report ids and never interprets an empty element list as completeness.**

- [ ] **Step 4: Export the read-only functions from `package/index.ts`; run the focused test, full package unit suite, and `npm run build` in `package/`.**

- [ ] **Step 5: Commit.**

```bash
git add package/portfolio.types.ts package/portfolio.ts package/portfolio.test.ts package/index.ts
git commit -m "feat(portfolio): add Jupiter coverage client"
```

### Task 2: Long-term report generator

**Files:**
- Create: `agent-runtime/examples/portfolio-advisor.ts`
- Create: `agent-runtime/examples/portfolio-advisor.test.ts`
- Create: `agent-runtime/portfolio-advisor-wallets.example.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `getJupiterPortfolio(address)`, a registry shaped as `{ wallets: [{ address, label, ledgerRequired? }] }`.
- Produces: `runAdvisor(registry, now, fetcher): Promise<string>` and an absolute private Markdown report path.

- [ ] **Step 1: Write a failing report test using a mocked complete snapshot and a mocked failed fetcher.**

```ts
expect(report).toContain("Holding horizon: 12 months or longer");
expect(report).toContain("No proposals: Jupiter coverage is incomplete for Cold wallet");
expect(report).not.toContain("signature");
```

- [ ] **Step 2: Run `node --import tsx --test agent-runtime/examples/portfolio-advisor.test.ts` and verify failure because the script does not exist.**

- [ ] **Step 3: Implement the report generator.**

The generator reads `PORTFOLIO_ADVISOR_WALLETS_PATH`, defaults only to `/workspace/.agent-actions/portfolio-advisor-wallets.json`, and errors if that file is absent or malformed. It serially reads the wallets, prints each coverage state, and writes a timestamped report under `/workspace/.agent-actions/portfolio-advisor/`. It proposes no tactical action. Its only eligible proposal category is a structural long-term review when inventory is complete; beta errors result in a specific no-proposal statement.

- [ ] **Step 4: Add `.agent-actions/portfolio-advisor/` and `portfolio-advisor-wallets.json` to `.gitignore`; run the focused test and `npm run typecheck` in `agent-runtime/`.**

- [ ] **Step 5: Commit.**

```bash
git add agent-runtime/examples/portfolio-advisor.ts agent-runtime/examples/portfolio-advisor.test.ts agent-runtime/portfolio-advisor-wallets.example.json .gitignore
git commit -m "feat(runtime): add read-only portfolio advisor"
```

### Task 3: Weekly heartbeat and dry-run evidence

**Files:**
- Create: `agent-runtime/automations/portfolio-advisor/automation.toml.example`
- Create: `agent-runtime/automations/portfolio-advisor/prompt.md`
- Modify: `agent-runtime/automations/README.md`

**Interfaces:**
- Consumes: the private registry and advisor script from Task 2.
- Produces: a paused weekly Codex heartbeat named `Long-term portfolio advisor` and one manual dry-run report.

- [ ] **Step 1: Write the heartbeat prompt with explicit prohibitions.**

```text
Run only the portfolio-advisor read command with EXECUTE_LIVE=0.
Never invoke swap, bridge, lender deposit, signer, wallet, or transaction-submit APIs.
Do not recommend holding-period changes under 12 months, tactical trades, leverage, or loops.
```

- [ ] **Step 2: Add the paused example and explain that the active heartbeat is created through Codex automation tooling, not copied from TOML.**

- [ ] **Step 3: Create the actual weekly heartbeat through `automation_update`, attached to this task and configured for failed-run-only notifications.**

- [ ] **Step 4: Create the local ignored registry containing the three supplied public addresses; run the advisor with `EXECUTE_LIVE=0` inside the Codex Docker runtime.**

- [ ] **Step 5: Verify report existence, no transaction signature, focused tests, package build, runtime typecheck, then commit the tracked automation documentation.**

```bash
git add agent-runtime/automations/portfolio-advisor agent-runtime/automations/README.md
git commit -m "docs(runtime): add portfolio advisor automation"
```

## Self-review

- All design requirements map to a task: no-custody and read-only boundaries in Tasks 1–3; three-wallet configuration and private history in Task 2; Jupiter beta coverage gate in Task 1; long-term-only policy in Tasks 2–3; weekly automation and first dry run in Task 3.
- No task uses a fallback inventory source, makes a transaction, or leaves an unspecified behavior.
- The imported `getJupiterPortfolio`, `portfolioCoverage`, `runAdvisor`, and registry fields have the same names in all tasks.

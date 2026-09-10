import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getJupiterPortfolio,
  JupiterPortfolioSnapshot,
  PortfolioCoverage,
  PortfolioFetch,
  portfolioCoverage,
} from "orca-clmm-agent";

const defaultRegistryPath = "/workspace/.agent-actions/portfolio-advisor-wallets.json";
const defaultReportDirectory = "/workspace/.agent-actions/portfolio-advisor";

export interface AdvisorWallet {
  address: string;
  label: string;
  ledgerRequired?: boolean;
}

export interface AdvisorRegistry {
  wallets: AdvisorWallet[];
}

export interface AdvisorResult {
  wallet: AdvisorWallet;
  snapshot?: JupiterPortfolioSnapshot;
  coverage?: PortfolioCoverage;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAdvisorRegistry = (value: unknown): AdvisorRegistry => {
  if (!isRecord(value) || !Array.isArray(value.wallets) || value.wallets.length === 0) {
    throw new Error("Portfolio advisor registry must contain at least one wallet");
  }
  const wallets = value.wallets.map((wallet) => {
    if (!isRecord(wallet) || typeof wallet.address !== "string" || typeof wallet.label !== "string" ||
      (wallet.ledgerRequired !== undefined && typeof wallet.ledgerRequired !== "boolean")) {
      throw new Error("Portfolio advisor registry contains an invalid wallet");
    }
    return { address: wallet.address, label: wallet.label, ...(wallet.ledgerRequired ? { ledgerRequired: true } : {}) };
  });
  return { wallets };
};

export const collectAdvisorResults = async (
  registry: AdvisorRegistry,
  fetcher: PortfolioFetch = fetch,
): Promise<AdvisorResult[]> => {
  const results: AdvisorResult[] = [];
  for (const wallet of registry.wallets) {
    try {
      const snapshot = await getJupiterPortfolio(wallet.address, fetcher);
      results.push({ wallet, snapshot, coverage: portfolioCoverage(snapshot) });
    } catch (error) {
      results.push({ wallet, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
};

const coverageLine = (result: AdvisorResult) => {
  if (result.error) return `Source error: ${result.error}`;
  if (!result.coverage?.complete) {
    return `Coverage incomplete${result.coverage?.failures.length ? ` (${result.coverage.failures.join(", ")})` : ""}`;
  }
  return "Coverage complete";
};

export const renderAdvisorReport = (results: AdvisorResult[], now = new Date()): string => {
  const lines = [
    "# Long-term portfolio advisor",
    "",
    `Generated: ${now.toISOString()}`,
    "Holding horizon: 12 months or longer.",
    "This report is recommendation-only. It cannot access keys, request signing, or submit transactions.",
    "",
    "## Inventory coverage",
  ];
  for (const result of results) {
    lines.push("", `### ${result.wallet.label}`, `- Address: ${result.wallet.address}`);
    lines.push(`- Signing: ${result.wallet.ledgerRequired ? "Ledger/manual signing required" : "Manual wallet signing required"}`);
    lines.push(`- Jupiter Portfolio: ${coverageLine(result)}`);
    if (result.snapshot) lines.push(`- Position elements: ${result.snapshot.elements.length}`);
  }
  lines.push("", "## Recommendations");
  for (const result of results) {
    if (result.error || !result.coverage?.complete) {
      lines.push(`- No proposals: Jupiter coverage is incomplete for ${result.wallet.label}.`);
    } else {
      lines.push(`- ${result.wallet.label}: No automated proposal: review only durable, structural changes after protocol-specific verification.`);
    }
  }
  lines.push("", "Excluded by policy: short-term trading, leverage, looping, and unverified yield moves.");
  return `${lines.join("\n")}\n`;
};

export const loadAdvisorRegistry = async (registryPath = process.env.PORTFOLIO_ADVISOR_WALLETS_PATH || defaultRegistryPath) =>
  parseAdvisorRegistry(JSON.parse(await readFile(registryPath, "utf8")));

export const writeAdvisorReport = async (
  report: string,
  outputDirectory = process.env.PORTFOLIO_ADVISOR_REPORT_DIR || defaultReportDirectory,
  now = new Date(),
) => {
  await mkdir(outputDirectory, { recursive: true });
  const filename = `portfolio-advisor-${now.toISOString().replace(/[:.]/g, "-")}.md`;
  const reportPath = path.join(outputDirectory, filename);
  await writeFile(reportPath, report, "utf8");
  return reportPath;
};

const main = async () => {
  if (process.env.EXECUTE_LIVE === "1") throw new Error("Portfolio advisor refuses EXECUTE_LIVE=1");
  const registry = await loadAdvisorRegistry();
  const results = await collectAdvisorResults(registry);
  const reportPath = await writeAdvisorReport(renderAdvisorReport(results));
  console.log(`Read-only portfolio advisor report: ${reportPath}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

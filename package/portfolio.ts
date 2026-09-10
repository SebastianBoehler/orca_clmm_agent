import {
  JupiterPortfolioElement,
  JupiterPortfolioFetcherReport,
  JupiterPortfolioSnapshot,
  PortfolioCoverage,
  PortfolioFetch,
} from "./portfolio.types";

const JUPITER_PORTFOLIO_URL = "https://api.jup.ag/portfolio/v1/positions";
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseFetcherReports = (value: unknown): JupiterPortfolioFetcherReport[] => {
  if (!Array.isArray(value) || value.some((report) => !isRecord(report) || typeof report.id !== "string" || typeof report.status !== "string")) {
    throw new Error("Invalid Jupiter Portfolio response: fetcherReports");
  }
  return value.map((report) => ({
    id: report.id as string,
    status: report.status as string,
    ...(typeof report.error === "string" ? { error: report.error } : {}),
  }));
};

const parseElements = (value: unknown): JupiterPortfolioElement[] => {
  if (!Array.isArray(value) || value.some((element) => !isRecord(element) || typeof element.type !== "string")) {
    throw new Error("Invalid Jupiter Portfolio response: elements");
  }
  return value as JupiterPortfolioElement[];
};

export const assertSolanaAddress = (address: string) => {
  if (!SOLANA_ADDRESS.test(address)) throw new Error(`Invalid Solana address: ${address}`);
};

export const parseJupiterPortfolio = (value: unknown): JupiterPortfolioSnapshot => {
  if (!isRecord(value) || typeof value.owner !== "string" || typeof value.date !== "number" || typeof value.duration !== "number") {
    throw new Error("Invalid Jupiter Portfolio response");
  }
  return {
    owner: value.owner,
    date: value.date,
    duration: value.duration,
    fetcherReports: parseFetcherReports(value.fetcherReports),
    elements: parseElements(value.elements),
  };
};

export const getJupiterPortfolio = async (
  address: string,
  fetcher: PortfolioFetch = fetch,
): Promise<JupiterPortfolioSnapshot> => {
  assertSolanaAddress(address);
  const response = await fetcher(`${JUPITER_PORTFOLIO_URL}/${address}`);
  if (!response.ok) throw new Error(`Jupiter Portfolio request failed: ${response.status}`);
  return parseJupiterPortfolio(await response.json());
};

export const portfolioCoverage = (snapshot: JupiterPortfolioSnapshot): PortfolioCoverage => {
  if (snapshot.fetcherReports.length === 0) {
    return { complete: false, failures: ["no fetcher reports"] };
  }
  const failures = snapshot.fetcherReports
    .filter((report) => report.status !== "ok")
    .map((report) => report.id);
  return { complete: failures.length === 0, failures };
};

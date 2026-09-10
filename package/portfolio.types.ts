export interface JupiterPortfolioFetcherReport {
  id: string;
  status: string;
  error?: string;
}

export interface JupiterPortfolioElement {
  type: string;
  platformId?: string;
  [key: string]: unknown;
}

export interface JupiterPortfolioSnapshot {
  owner: string;
  date: number;
  duration: number;
  fetcherReports: JupiterPortfolioFetcherReport[];
  elements: JupiterPortfolioElement[];
}

export interface PortfolioCoverage {
  complete: boolean;
  failures: string[];
}

export type PortfolioFetch = (input: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

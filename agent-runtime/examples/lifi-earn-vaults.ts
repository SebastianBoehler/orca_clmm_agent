const baseUrl = "https://earn.li.fi";
const chainId = process.env.EARN_CHAIN_ID;
const asset = process.env.EARN_ASSET;
const protocol = process.env.EARN_PROTOCOL;
const limit = process.env.EARN_LIMIT || "5";
const apiKey = process.env.LIFI_API_KEY;

if (!apiKey) {
  throw new Error("Missing required env var: LIFI_API_KEY");
}

const params = new URLSearchParams({ sortBy: "apy", limit });
if (chainId) params.set("chainId", chainId);
if (asset) params.set("asset", asset);
if (protocol) params.set("protocol", protocol);
if (process.env.COMPOSER_ONLY === "1") params.set("isComposerSupported", "true");

const response = await fetch(`${baseUrl}/v1/vaults?${params.toString()}`, {
  headers: { accept: "application/json", "x-lifi-api-key": apiKey },
});

if (!response.ok) {
  throw new Error(`Earn API failed: ${response.status} ${await response.text()}`);
}

const body = await response.json();
const vaults = Array.isArray(body) ? body : body.data || body.vaults || [];

console.log(`Vaults returned: ${vaults.length}`);
for (const vault of vaults) {
  console.log(JSON.stringify({
    chainId: vault.chainId,
    address: vault.address,
    protocol: vault.protocol?.name || vault.protocol,
    name: vault.name || vault.slug,
    apyTotal: vault.analytics?.apy?.total,
    tvlUsd: vault.tvl?.usd,
    isTransactional: vault.isTransactional,
    isRedeemable: vault.isRedeemable,
    isComposerSupported: vault.isComposerSupported,
    underlyingTokens: vault.underlyingTokens?.map((token: any) => token.symbol || token.address),
  }, null, 2));
}

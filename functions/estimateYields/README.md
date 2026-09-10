# Estimate Orca Yields Cloud Function

This Google Cloud Function calculates estimated yields for multiple Orca pool positions in a single request.

## Overview

The function accepts an array of position specifications (pool address, range, and either tokenA or tokenB amount in USD) and returns the estimated 24-hour yield for each position.

## API Usage

### Endpoint

```
https://us-central1-orca-clmm-agent.cloudfunctions.net/estimateYields
```

### Request Format

```json
{
  "positions": [
    {
      "poolAddress": "string",
      "range": number,
      "tokenAAmountUSD": number
    },
    {
      "poolAddress": "string",
      "range": number,
      "tokenBAmountUSD": number
    }
  ]
}
```

**Notes:**
- Each position must include either `tokenAAmountUSD` or `tokenBAmountUSD`, but not both
- `range` is expressed as a decimal (e.g., 0.10 for 10%)
- `poolAddress` must be a valid Orca pool address

### Response Format

```json
{
  "success": true,
  "message": "Successfully calculated yields for X positions",
  "results": [
    {
      "poolAddress": "string",
      "range": number,
      "tokenAAmountUSD": number,
      "tokenBAmountUSD": number,
      "yield24h": number,
      "timestamp": "ISO date string"
    }
  ],
  "timestamp": "ISO date string"
}
```

## Error Handling

The function validates input parameters and returns appropriate error messages. If a specific position calculation fails, the function will continue processing other positions and include error information for the failed position in the results.

## Deployment

Deploy using Google Cloud CLI:

```bash
gcloud functions deploy estimateYields \
  --runtime nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --memory=512MB \
  --timeout=60s
```

## Environment Variables

- `MONGODB_URI`: MongoDB connection string (defaults to project connection if not provided)
- `DB_NAME`: Database name (defaults to "orca")

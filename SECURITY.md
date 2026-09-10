# Security Policy

## Private Keys And Secrets

Never commit wallet keypairs, seed phrases, `.env` files, RPC credentials,
exchange credentials, API keys, or cloud deployment secrets. The repository
ignores common secret file names, but ignore rules are not a substitute for
reviewing staged changes before publishing.

Before making the repository public, run at least:

```bash
git ls-files | rg '(^|/)(\.env|\.env\..*|.*keypair.*|.*secret.*|.*\.pem|.*\.key|\.env\.yaml)$'
git log --all --name-only --pretty=format: | rg '(^|/)(\.env|\.env\..*|.*keypair.*|.*secret.*|.*\.pem|.*\.key|\.env\.yaml)$'
```

If either command finds historical secrets, rotate those credentials and scrub
history before changing repository visibility.

## Live Transactions

This project contains helpers that can send real Solana transactions. Treat any
script that loads a wallet file as live mainnet-capable unless the script clearly
states otherwise.

Use a dedicated hot wallet with limited funds for testing. Do not run live
examples against a treasury wallet.

## Reporting Issues

Please do not open public issues containing private keys, seed phrases, API
tokens, or exploitable wallet details. Report sensitive problems privately to
the maintainer listed in the npm package metadata.

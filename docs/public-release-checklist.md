# Public Release Checklist

Use this before changing the GitHub repository from private to public.

- Rotate any credentials that may have appeared in historical `.env` files.
- Rewrite or recreate repository history if old secrets must not become public.
- Confirm the current tree has no tracked secret-like files:
  `git ls-files | rg '(^|/)(\.env|\.env\..*|.*keypair.*|.*secret.*|.*\.pem|.*\.key|\.env\.yaml)$'`
- Confirm examples that send transactions are clearly marked as live examples.
- Run `cd package && npm ci && npm run build && npm run test:unit`.
- Review `npm audit --omit=dev` and document any upstream-only unresolved items.
- Enable branch protection and required CI checks after the repository is public.
- Add repository topics on GitHub, such as `solana`, `orca`, `whirlpools`,
  `clmm`, `defi`, and `typescript`.

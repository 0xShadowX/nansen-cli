---
name: nansen-wallet-batch
description: "Which of these addresses are smart money? Batch-profile a list in one call."
metadata:
  openclaw:
    requires:
      bins:
        - nansen
    install:
      - kind: node
        package: nansen-cli
        bins: [nansen]
allowed-tools: Bash(nansen:*)
---
## Authentication

Use a saved browser session from `nansen login` when browser admission and the documented platform cohort are enabled, or use a conventional API key. `NANSEN_API_KEY` overrides the saved session. The direct-data commands below use normal credits and entitlements; login does not purchase credits. Browser rollout acceptance is still pending.

```bash
ADDRESSES="0xaddr1,0xaddr2,0xaddr3,..." CHAIN=ethereum
nansen research profiler batch --addresses "$ADDRESSES" --chain $CHAIN --include labels,balance
# → .data.{total, completed, results[]: {address, chain, labels[], balance, error}}
# labels[]: {label, category ("smart_money","fund","social","behavioral","others"), kind[]}
# balance: {data[]: {token_symbol, token_amount, price_usd, value_usd}}
```
Check .error per result — invalid addresses return an error message, not a crash. Skip those.
Keep addresses where any label.category == "smart_money" or "fund". Omit balance for faster checks.

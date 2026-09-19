---
name: nansen-fund-tracker
description: "What are crypto funds and VCs holding right now? Cross-chain fund portfolios and net accumulation signals."
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

# Fund Watch

**Answers:** "What are crypto funds and VCs holding right now?"

```bash
nansen research smart-money holdings --chain ethereum --labels "Fund" --limit 20
# → token_symbol, value_usd, holders_count, balance_24h_percent_change, share_of_holdings_percent

nansen research smart-money holdings --chain solana --labels "Fund" --limit 20

nansen research smart-money netflow --chain ethereum --labels "Fund" --limit 10
# → token_symbol, net_flow_1h/24h/7d/30d_usd, market_cap_usd, trader_count

nansen research smart-money netflow --chain solana --labels "Fund" --limit 10
```

Cross-reference holdings with netflow to see directional conviction. Positive net_flow_24h = active accumulation.

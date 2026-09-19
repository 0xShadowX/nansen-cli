---
name: nansen-polymarket-deep-dive
description: "Deep dive on a Polymarket market — OHLCV, orderbook, top holders, positions, trades, and PnL leaderboard. Use when analysing a specific prediction market."
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

# Prediction Market Deep Dive

**Answers:** "What's happening in this specific market? Who holds it, who's trading it?"

Use `market_id` from the screener (`nansen-prediction-market` skill).

```bash
MID=<market_id>

nansen research pm ohlcv --market-id $MID --sort period_start:desc --limit 50
# → period_start, open, high, low, close, volume

nansen research pm orderbook --market-id $MID
# → bids[], asks[] with price and size

nansen research pm top-holders --market-id $MID --limit 20
# → address, side, position_size, avg_entry_price, current_price, unrealized_pnl_usd

nansen research pm position-detail --market-id $MID --limit 20
# → address, side, size, avg_entry_price, current_price, pnl

nansen research pm trades-by-market --market-id $MID --limit 20
# → timestamp, buyer, seller, taker_action, side, size, price, usdc_value

nansen research pm pnl-by-market --market-id $MID --limit 20
# → address, side_held, net_buy_cost_usd, unrealized_value_usd, total_pnl_usd
```

Notes:
- `--market-id` is a numeric ID from the screener, not a slug.
- Works with any market ID regardless of status (active or closed/resolved).
- All addresses are Polygon (EVM).

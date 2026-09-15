---
"nansen-cli": minor
---

Add `nansen research profiler counterparties-batch` — top counterparties for up to 10 wallets in a single request. Takes `--addresses "0xabc,0xdef"` (comma-separated or a JSON array), validates the 10-address and 90-day limits client-side, and returns rows tagged with the `wallet_address` they belong to (results are not aggregated across wallets).

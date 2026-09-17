---
"nansen-cli": patch
---

Fix the `--chain` allowlist on `nansen research profiler counterparties-batch`. It was built from the CLI's internal EVM chain list, which disagreed with the endpoint in both directions: `scroll` and `ronin` were accepted and always 422'd upstream, while every non-EVM chain the profiler serves (`bitcoin`, `tron`, `sui`, `ton`, `near`, `injective`, `mantra`, `robinhood`, `arc`, `starknet`) was rejected client-side. The allowlist is now the endpoint's own `ProfilerChain` enum, and `--chain bsc` is accepted and sent as `bnb`. Addresses on a chain whose format the CLI cannot check are still required to be address-shaped, so a newline `--file` cannot post arbitrary lines as wallet addresses.

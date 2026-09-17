---
"nansen-cli": patch
---

Validate `nansen alerts` string/array options (`--chains`, `--token`/`--exclude-token`, `--subject`/`--counterparty`/`--caller`/`--contract` and their `--exclude-*` variants, `--events`, `--signature-hash`, `--token-sector`/`--exclude-token-sector`, and `alerts list --token-address`/`--chain`) so JSON primitives (e.g. `--chains true`) produce actionable `INVALID_PARAMS` errors instead of a raw `TypeError` crash or being silently dropped/passed through into the alert payload.

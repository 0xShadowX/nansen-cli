---
"nansen-cli": patch
---

Validate supported analytics `--days` values as non-negative integers with a representable date range instead of truncating malformed inputs or forwarding `NaN`.

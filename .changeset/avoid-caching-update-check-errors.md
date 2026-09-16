---
"nansen-cli": patch
---

Avoid caching failed or malformed update-check responses as fresh results, so transient registry errors are retried instead of suppressing checks for 24 hours.

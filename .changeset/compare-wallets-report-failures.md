---
"nansen-cli": patch
---

`research profiler compare` no longer turns failed API requests into an empty comparison. When every request fails the command errors with the underlying code (for example `UNAUTHORIZED` or `RATE_LIMITED`); when some fail the result carries `incomplete: true`, an `errors` list, and `null` for the fields that could not be computed. Shared tokens are now matched on the token address, falling back to the symbol only when no address is reported, so two different contracts with the same symbol are no longer reported as shared.

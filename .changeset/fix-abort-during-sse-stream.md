---
"nansen-cli": patch
---

Fix `nansen agent` throwing a raw `AbortError` instead of a `NansenError(TIMEOUT)` when the request timeout fires while reading the SSE response body (as opposed to during the initial connection). Both streaming and `--json` output modes now report a consistent timeout error regardless of which phase of the request the abort happened in.

---
"nansen-cli": patch
---

Reject malformed and non-finite prediction-market screener numeric filters before they can be serialized as `null` or silently ignored.

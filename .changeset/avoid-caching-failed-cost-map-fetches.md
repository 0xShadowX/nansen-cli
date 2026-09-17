---
"nansen-cli": patch
---

Ignore failed and malformed OpenAPI responses when refreshing the credit-cost cache. A non-2xx response that still returned JSON replaced the cached cost map with an empty one and stamped it fresh, so credit estimates went missing for up to 24 hours and the next refresh was suppressed.

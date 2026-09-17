---
"nansen-cli": patch
---

Reject malformed, fractional, non-finite, repeated, or valueless `profiler trace --depth` inputs while preserving the existing 1-5 clamping behavior for valid integers.

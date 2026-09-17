---
"nansen-cli": patch
---

Stop calling the removed points leaderboard API route. Both `points leaderboard` and `research points leaderboard` now return a structured unavailable error and exit with a failure status.

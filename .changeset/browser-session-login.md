---
"nansen-cli": major
---

Plain `nansen login` now requests fresh browser approval and saves a revocable session in the OS credential store, even when NANSEN_API_KEY is set. Scripts that previously used plain login to save an environment key must use explicit `--human` or `--api-key` setup. Environment keys still override saved authentication for commands. Add `--no-browser`, safe machine login events, offline session diagnostics and wallet-preserving logout. Expired sessions require login until automatic renewal ships separately. Browser login is intended for a gated prerelease cohort before normal-release promotion.

Automatic x402 wallet payment now requires anonymous access. A selected API key, including a valid key returning 402, no longer triggers automatic signing or credit purchase. Top up that account or use an explicit manual payment signature; anonymous automatic payments and manual API-key payments retain their behavior.

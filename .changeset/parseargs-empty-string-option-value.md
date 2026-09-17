---
"nansen-cli": patch
---

Fix `parseArgs` treating an explicit empty-string option value (`--flag ""`) as a boolean flag and leaking the `""` into positional arguments. `nansen web fetch <url> --question ""` now reports the blank-question error instead of `Invalid URL: ""`.

Register `--all`, `--max`, `--gasless`, `--auto-slippage`, and `--unsafe-no-password` as valueless flags. They are read only as booleans, so a following token such as `nansen perp meta --all` plus an asset name was parsed as their value and the switch went dead.

Reject a blank `nansen mcp verify --url ""` instead of falling back to the default Nansen endpoint, which reported the default URL as verified when the caller passed an unset shell variable.

Reject a blank `--slippage` or `--max-auto-slippage` on `nansen trade quote`. An empty string became `0` in the range check, satisfied the rule that `--swap-mode exactOut --auto-slippage` needs an explicit cap, and was then dropped when the request was built, so the ERC-20 approval was scoped by a cap that never reached the server.

Reject a blank `nansen web fetch --url ""` instead of dropping it and fetching only the positional URLs.

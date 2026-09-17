---
"nansen-cli": patch
---

Declare the `DELETE /api/v1/smart-alert/{alertId}` route the `alerts delete` command already calls in `src/schema.json`. This was the last route in the parity checker's schema-drift list; the sibling routes (list/create/update/toggle/account/web/agent) were declared in #549.

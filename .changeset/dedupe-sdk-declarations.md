---
"@arkts/language-server": patch
---

Avoid parsing byte-identical SDK declarations twice when DevEco ships the same file in both `component` and `ets-loader/declarations`.

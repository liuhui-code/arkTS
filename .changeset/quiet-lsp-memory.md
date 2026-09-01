---
"@arkts/language-server": patch
---

Limit the CLI language-server process to 1536 MB of V8 old-space by default, while respecting explicit Node heap flags and providing an environment-variable override.

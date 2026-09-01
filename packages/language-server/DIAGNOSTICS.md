# Language Server diagnostics

This branch adds opt-in, structured diagnostics for investigating ArkTS project-graph memory growth. It is enabled with:

```sh
ARKTS_LSP_DIAGNOSTICS=1
```

Set `ARKTS_LSP_LOG_DIR` to choose the output directory. Each server session writes a JSONL file named `language-server-<timestamp>-<pid>.jsonl`.

The records cover:

- initialize, didOpen, didChange, and didClose boundaries;
- TypeScript/ArkTS project and LanguageService creation;
- root-file counts before Program construction;
- Program construction duration, root/source counts, and source categories;
- process memory samples and uncaught exits.

File contents are not logged. File URIs, workspace paths, SDK paths, and up to 20 out-of-workspace sample paths are logged because they are required to identify an accidentally oversized project graph. Review a log before sharing it publicly.

The `zed-arkts-deveco` 0.3.3 diagnostic release bundles the generated `out/index.mjs` from this branch. Build it with Node.js 22 or later:

```sh
pnpm -F @arkts/language-server build
```

The diagnostic hooks are inactive unless `ARKTS_LSP_DIAGNOSTICS=1`, so the standard server path does not pay the synchronous JSONL logging cost by default.

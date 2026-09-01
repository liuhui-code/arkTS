# ArkTS Language Server

![GitHub Repo stars](https://img.shields.io/github/stars/groupguanfang/arkTS?style=flat)&nbsp;
[![NPM version](https://img.shields.io/npm/v/@arkts/language-server?color=a1b858)](https://www.npmjs.com/package/@arkts/language-server)

The unofficial language server for Huawei HarmonyOS's [ArkTS Programming Language](https://developer.huawei.com/consumer/cn/arkts) (Superset of TypeScript).

It is part of the [Naily's ArkTS Support VSCode Extension](https://github.com/ohosvscode/arkTS).

> See `@arkts/shared`'s `src/client-options.ts` to see the full interface.

## Memory limit

The `ets-language-server` command limits V8 old-space to 1536 MB by default so that
large projects trigger garbage collection before the language server makes the editor
unresponsive. Set `ARKTS_LSP_MAX_OLD_SPACE_SIZE_MB` to another integer to override the
limit, or set it to `0` to disable the launcher limit. Existing Node heap flags supplied
through the command line or `NODE_OPTIONS` take precedence.

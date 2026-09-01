#!/usr/bin/env node
const { spawn } = require('node:child_process')
const process = require('node:process')
const {
  hasHeapLimit,
  parseHeapLimit,
  serverNodeArguments,
} = require('./heap-limit')

if (process.argv.includes('--version')) {
  const pkgJSON = require('../package.json')
  // eslint-disable-next-line no-console
  console.log(`${pkgJSON.version}`)
}
else {
  const heapLimit = parseHeapLimit(process.env.ARKTS_LSP_MAX_OLD_SPACE_SIZE_MB)
  if (heapLimit === 0 || hasHeapLimit(process.execArgv, process.env.NODE_OPTIONS)) {
    require('../out/index.js')
  }
  else {
    const serverPath = require.resolve('../out/index.js')
    const child = spawn(
      process.execPath,
      serverNodeArguments(serverPath, process.argv.slice(2), heapLimit),
      { stdio: 'inherit' },
    )
    const signalHandlers = new Map(
      ['SIGINT', 'SIGTERM'].map(signal => [signal, () => child.kill(signal)]),
    )

    for (const [signal, handler] of signalHandlers) process.on(signal, handler)
    child.on('error', (error) => {
      console.error(`Failed to start ArkTS Language Server: ${error.message}`)
      process.exitCode = 1
    })
    child.on('exit', (code, signal) => {
      for (const [forwardedSignal, handler] of signalHandlers) process.off(forwardedSignal, handler)
      process.exitCode = code ?? (signal ? 1 : 0)
    })
  }
}

'use strict'

const DEFAULT_HEAP_LIMIT_MB = 1536
const HEAP_LIMIT_PATTERN = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s|$)/

function parseHeapLimit(value) {
  if (value === undefined || value === '') return DEFAULT_HEAP_LIMIT_MB
  if (!/^\d+$/.test(value)) return DEFAULT_HEAP_LIMIT_MB
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : DEFAULT_HEAP_LIMIT_MB
}

function hasHeapLimit(execArgv = [], nodeOptions = '') {
  return HEAP_LIMIT_PATTERN.test(`${execArgv.join(' ')} ${nodeOptions}`)
}

function serverNodeArguments(serverPath, serverArguments, heapLimit) {
  return [`--max-old-space-size=${heapLimit}`, serverPath, ...serverArguments]
}

module.exports = {
  DEFAULT_HEAP_LIMIT_MB,
  hasHeapLimit,
  parseHeapLimit,
  serverNodeArguments,
}

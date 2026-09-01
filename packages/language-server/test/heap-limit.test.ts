import { createRequire } from 'node:module'
import { describe, expect, it } from 'vite-plus/test'

const require = createRequire(import.meta.url)
const {
  DEFAULT_HEAP_LIMIT_MB,
  hasHeapLimit,
  parseHeapLimit,
  serverNodeArguments,
} = require('../bin/heap-limit')

describe('ArkTS Language Server heap limit', () => {
  it('uses a safe default heap limit', () => {
    expect(DEFAULT_HEAP_LIMIT_MB).toBe(1536)
    expect(parseHeapLimit(undefined)).toBe(1536)
    expect(parseHeapLimit('')).toBe(1536)
  })

  it('accepts an explicit heap limit or zero to disable it', () => {
    expect(parseHeapLimit('2048')).toBe(2048)
    expect(parseHeapLimit('0')).toBe(0)
    expect(parseHeapLimit('invalid')).toBe(1536)
    expect(parseHeapLimit('-1')).toBe(1536)
  })

  it('respects heap limits already supplied by Node or NODE_OPTIONS', () => {
    expect(hasHeapLimit(['--max-old-space-size=2048'])).toBe(true)
    expect(hasHeapLimit(['--max_old_space_size', '2048'])).toBe(true)
    expect(hasHeapLimit(['--trace-warnings'], '--max-old-space-size=1024')).toBe(true)
    expect(hasHeapLimit(['--trace-warnings'], '--enable-source-maps')).toBe(false)
  })

  it('places the heap limit before the server entrypoint', () => {
    expect(serverNodeArguments('/server/index.js', ['--stdio'], 1536)).toEqual([
      '--max-old-space-size=1536',
      '/server/index.js',
      '--stdio',
    ])
  })
})

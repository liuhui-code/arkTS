import type { LanguageServicePlugin } from '@volar/language-server'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { performance } from 'node:perf_hooks'

const enabled = process.env.ARKTS_LSP_DIAGNOSTICS === '1'
const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
let sequence = 0

export function getDiagnosticLogDirectory(): string {
  if (process.env.ARKTS_LSP_LOG_DIR) return path.resolve(process.env.ARKTS_LSP_LOG_DIR)
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'ArkTSDevEco', 'logs')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Logs', 'ArkTSDevEco')
  return path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'), 'ArkTSDevEco', 'logs')
}

const logFile = path.join(getDiagnosticLogDirectory(), `language-server-${sessionId}.jsonl`)

function memory(): Record<string, number> {
  const usage = process.memoryUsage()
  return {
    rssMiB: Math.round(usage.rss / 1024 / 1024),
    heapUsedMiB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMiB: Math.round(usage.heapTotal / 1024 / 1024),
    externalMiB: Math.round(usage.external / 1024 / 1024),
  }
}

export function diagnosticLog(event: string, data: Record<string, unknown> = {}): void {
  if (!enabled) return
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, `${JSON.stringify({
      schemaVersion: 1,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      event,
      pid: process.pid,
      ...memory(),
      ...data,
    })}\n`)
  }
  catch {
    // Diagnostics must never take the language server down.
  }
}

export function getDiagnosticLogFile(): string | undefined {
  return enabled ? logFile : undefined
}

function isInside(fileName: string, directory: string | undefined): boolean {
  if (!directory) return false
  const relative = path.relative(directory, fileName)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function summarizeFiles(
  fileNames: readonly string[],
  currentDirectory: string,
  sdkPath?: string,
  hmsPath?: string,
): Record<string, unknown> {
  const counts = {
    total: fileNames.length,
    workspace: 0,
    sdk: 0,
    hms: 0,
    ohModules: 0,
    nodeModules: 0,
    other: 0,
    ets: 0,
    declarationEts: 0,
    ts: 0,
    declarationTs: 0,
  }
  const outsideWorkspaceSamples: string[] = []

  for (const fileName of fileNames) {
    const normalized = path.resolve(fileName)
    if (normalized.endsWith('.d.ets')) counts.declarationEts++
    else if (normalized.endsWith('.ets')) counts.ets++
    else if (normalized.endsWith('.d.ts')) counts.declarationTs++
    else if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) counts.ts++

    if (isInside(normalized, sdkPath)) counts.sdk++
    else if (isInside(normalized, hmsPath)) counts.hms++
    else if (normalized.includes(`${path.sep}oh_modules${path.sep}`)) counts.ohModules++
    else if (normalized.includes(`${path.sep}node_modules${path.sep}`)) counts.nodeModules++
    else if (isInside(normalized, currentDirectory)) counts.workspace++
    else counts.other++

    if (!isInside(normalized, currentDirectory) && outsideWorkspaceSamples.length < 20) {
      outsideWorkspaceSamples.push(normalized)
    }
  }

  return { counts, outsideWorkspaceSamples }
}

export function instrumentProjectHost(
  ctx: {
    configFileName?: string
    projectHost: {
      getCurrentDirectory(): string
      getScriptFileNames(): string[]
    }
  },
  projectId: number,
  sdkPath?: string,
  hmsPath?: string,
): void {
  if (!enabled) return
  const currentDirectory = ctx.projectHost.getCurrentDirectory()
  const originalGetScriptFileNames = ctx.projectHost.getScriptFileNames.bind(ctx.projectHost)
  let previousFingerprint = ''
  let calls = 0

  diagnosticLog('project-create', {
    projectId,
    configFileName: ctx.configFileName,
    currentDirectory,
  })

  ctx.projectHost.getScriptFileNames = () => {
    const startedAt = performance.now()
    const fileNames = originalGetScriptFileNames()
    const durationMs = Math.round(performance.now() - startedAt)
    const fingerprint = `${fileNames.length}:${fileNames[0] ?? ''}:${fileNames[fileNames.length - 1] ?? ''}`
    calls++
    if (fingerprint !== previousFingerprint || calls <= 3 || calls % 100 === 0 || durationMs >= 250) {
      previousFingerprint = fingerprint
      diagnosticLog('project-root-files', {
        projectId,
        call: calls,
        durationMs,
        ...summarizeFiles(fileNames, currentDirectory, sdkPath, hmsPath),
      })
    }
    return fileNames
  }
}

export function instrumentLanguageServices(
  services: LanguageServicePlugin[],
  sdkPath?: string,
  hmsPath?: string,
): void {
  if (!enabled) return
  const instrumentedServices = new WeakSet<object>()
  const seenPrograms = new WeakMap<object, number>()
  let languageServiceId = 0
  let programId = 0

  for (const service of services) {
    const originalCreate = service.create
    service.create = (context) => {
      const instance = originalCreate(context)
      const languageService = context.inject('typescript/languageService') as import('ohos-typescript').LanguageService | undefined
      if (!languageService || instrumentedServices.has(languageService)) return instance

      instrumentedServices.add(languageService)
      const serviceId = ++languageServiceId
      let calls = 0
      const originalGetProgram = languageService.getProgram.bind(languageService)
      diagnosticLog('language-service-create', { serviceId, plugin: service.name })

      languageService.getProgram = () => {
        const call = ++calls
        const shouldLogStart = call <= 5 || call % 100 === 0
        if (shouldLogStart) diagnosticLog('program-get-start', { serviceId, call })
        const startedAt = performance.now()
        try {
          const program = originalGetProgram()
          const durationMs = Math.round(performance.now() - startedAt)
          if (!program) {
            if (shouldLogStart || durationMs >= 250) diagnosticLog('program-get-end', { serviceId, call, durationMs, program: null })
            return program
          }

          let currentProgramId = seenPrograms.get(program)
          const isNew = currentProgramId === undefined
          if (currentProgramId === undefined) {
            currentProgramId = ++programId
            seenPrograms.set(program, currentProgramId)
          }
          if (isNew || shouldLogStart || durationMs >= 250) {
            const currentDirectory = program.getCurrentDirectory()
            diagnosticLog('program-get-end', {
              serviceId,
              call,
              programId: currentProgramId,
              isNew,
              durationMs,
              rootFileCount: program.getRootFileNames().length,
              ...(isNew
                ? summarizeFiles(program.getSourceFiles().map(sourceFile => sourceFile.fileName), currentDirectory, sdkPath, hmsPath)
                : { sourceFileCount: program.getSourceFiles().length }),
            })
          }
          return program
        }
        catch (error) {
          diagnosticLog('program-get-error', {
            serviceId,
            call,
            durationMs: Math.round(performance.now() - startedAt),
            error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
          })
          throw error
        }
      }
      return instance
    }
  }
}

export function startMemoryDiagnostics(): void {
  if (!enabled) return
  diagnosticLog('process-start', {
    diagnosticBuild: process.env.ARKTS_LSP_DIAGNOSTIC_BUILD,
    argv: process.argv,
    execPath: process.execPath,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    logFile,
  })
  setInterval(() => diagnosticLog('memory-sample'), 5_000).unref()
  process.on('uncaughtExceptionMonitor', error => diagnosticLog('uncaught-exception', { name: error.name, message: error.message, stack: error.stack }))
  process.on('unhandledRejection', reason => diagnosticLog('unhandled-rejection', { reason: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : String(reason) }))
  process.on('exit', code => diagnosticLog('process-exit', { code }))
}

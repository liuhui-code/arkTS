/* eslint-disable import/first */
import { createRequire } from 'node:module'
import { logger } from './logger'

// Polyfill require for ESM compatibility with ohos-typescript
const fileUri = import.meta.url
const require = createRequire(fileUri)
globalThis.require = require
logger.getConsola().info(`Current file URI: ${fileUri}`)

import process from 'node:process'
import { ETSLanguagePlugin } from '@arkts/language-plugin'
import { createArkTServices } from '@arkts/language-service'
import { format } from '@ohos-rs/oxk'
import { createConnection, createServer, createTypeScriptProject } from '@volar/language-server/node'
import { Uri } from '@vstils/core'
import { createFileSystemRegistry } from '@vstils/fs'
import { createNodeFileSystemProvider } from '@vstils/fs/node'
import * as ETS from 'ohos-typescript'
import { create as createTypeScriptServices } from 'volar-service-typescript'
import { ConfigResolver } from './classes/config-resolver'
import { diagnosticLog, getDiagnosticLogFile, instrumentLanguageServices, instrumentProjectHost, startMemoryDiagnostics } from './diagnostics'
import { ProjectDetectorManagerService } from './classes/project-manager'
import { patchResolver } from './patches/patch-resolver'
import { patchSemantic } from './patches/patch-semantic'
import { resolveDiagnosticMessages } from './utils/diagnostic-messages-resolver'

const ets = Object.assign({}, ETS)
patchResolver(ets)

const connection = createConnection()
const server = createServer(connection)
let projectId = 0

startMemoryDiagnostics()

server.documents.onDidOpen(({ document }) => {
  diagnosticLog('did-open', {
    uri: document.uri,
    languageId: document.languageId,
    version: document.version,
    textBytes: Buffer.byteLength(document.getText(), 'utf8'),
  })
})
server.documents.onDidChangeContent(({ document }) => diagnosticLog('did-change', { uri: document.uri, version: document.version }))
server.documents.onDidClose(({ document }) => diagnosticLog('did-close', { uri: document.uri }))

connection.onRequest('ets/formatDocument', async e => format(e.textDocument.uri, e.textDocument.text))

connection.onInitialize(async (params) => {
  diagnosticLog('initialize-start', {
    processId: params.processId,
    rootUri: params.rootUri,
    workspaceFolders: params.workspaceFolders,
    clientName: params.clientInfo?.name,
    clientVersion: params.clientInfo?.version,
    initializationOptions: {
      ets: params.initializationOptions?.ets,
      typescript: params.initializationOptions?.typescript
        ? { tsdk: params.initializationOptions.typescript.tsdk }
        : undefined,
      compilerOptionKeys: Object.keys(params.initializationOptions?.compilerOptions ?? {}),
    },
    diagnosticLogFile: getDiagnosticLogFile(),
  })
  const diagnosticMessages = await resolveDiagnosticMessages(params, logger, fileUri)
  const projectDetectorManagerService = new ProjectDetectorManagerService(connection, params, logger)
  const fsRegistry = await createFileSystemRegistry()
  fsRegistry.registerFileSystemProvider('file', await createNodeFileSystemProvider())
  const configuration = await new ConfigResolver(logger, projectDetectorManagerService, params, fsRegistry.fs, Uri.joinPath(Uri.parse(fileUri), '..'), connection).validateOrExit()
  const configurator = configuration.toArkTSServicesOptions()
  const typescriptServices = createTypeScriptServices(ets as unknown as typeof import('typescript'))
  patchSemantic(typescriptServices, configurator) // patch typescript semantic service
  instrumentLanguageServices(typescriptServices, configuration.getSdkPath(), configuration.getHmsSdkPath())
  const arktsServices = await createArkTServices(configurator, ets)

  delete typescriptServices[1].capabilities.documentFormattingProvider
  const originalCreate = typescriptServices[1].create
  typescriptServices[1].create = (context) => {
    const instance = originalCreate(context)
    delete instance.provideDocumentFormattingEdits
    return instance
  }

  const mergedSettings = await configuration.toCompilationSettings()

  return server.initialize(
    params,
    createTypeScriptProject(
      ets as unknown as typeof import('typescript'),
      diagnosticMessages,
      async (ctx) => {
        const currentProjectId = ++projectId
        instrumentProjectHost(ctx, currentProjectId, configuration.getSdkPath(), configuration.getHmsSdkPath())
        ctx.projectHost.getCompilationSettings = () => mergedSettings as import('typescript').CompilerOptions

        return {
          languagePlugins: [
            ETSLanguagePlugin(ets as unknown as typeof import('typescript'), {
              excludePaths: [configuration.getSdkPath(), configuration.getHmsSdkPath()].filter(Boolean) as string[],
              tsdk: configuration.getTsdkPath(),
              compilerOptions: mergedSettings,
              sys: ctx.sys,
            }),
          ],
          setup: async (options) => {
            if (!options.project || !options.project.typescript || !options.project.typescript.languageServiceHost) return
            options.project.typescript.languageServiceHost.getScriptKind = ((fileName: string): ETS.ScriptKind => {
              if (fileName.endsWith('.ets')) return ets.ScriptKind.ETS
              else if (fileName.endsWith('.js')) return ets.ScriptKind.JS
              else if (fileName.endsWith('.jsx')) return ets.ScriptKind.JSX
              else if (fileName.endsWith('.ts')) return ets.ScriptKind.TS
              else if (fileName.endsWith('.tsx')) return ets.ScriptKind.TSX
              else if (fileName.endsWith('.json') || fileName.endsWith('.json5') || fileName.endsWith('.jsonc')) return ets.ScriptKind.JSON
              else return ets.ScriptKind.Unknown
            }) as (fileName: string) => import('typescript').ScriptKind
          },
        }
      },
    ),
    [
      ...typescriptServices,
      ...arktsServices,
    ],
  )
})

connection.onInitialized(() => {
  diagnosticLog('initialized')
  logger.getConsola().info('ETS Language Server is initialized.')
  server.initialized()
})
connection.onShutdown(server.shutdown)
logger.getConsola().info('ETS Language Server is starting...')
connection.listen()
logger.getConsola().info(`ETS Language Server is started! PID: ${process.pid}`)

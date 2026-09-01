import process from 'node:process'
import { LanguageServerLogger } from '@arkts/shared'
import * as ets from 'ohos-typescript'
import path from 'node:path'
import { getDiagnosticLogDirectory } from './diagnostics'

export const logger = new LanguageServerLogger({
  console: process.argv.includes('--node-ipc'),
  file: process.argv.includes('--stdio'),
  filename: process.env.ARKTS_LSP_DIAGNOSTICS === '1'
    ? path.join(getDiagnosticLogDirectory(), 'language-server.log')
    : undefined,
  prefix: 'ETS Language Server',
})
logger.getConsola().info(`ohos-typescript version: ${ets.version}`)

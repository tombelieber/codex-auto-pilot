import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import {basename, dirname, isAbsolute, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const RECEIPT_MARKER = /<!--\s*auto-pilot-receipt:\s*([^\r\n]*?)\s*-->/i
const ROUTING_MARKER = /<!--\s*auto-pilot-routing:\s*\{[^\r\n]*\}\s*-->/gi
const MAX_RECEIPT_BYTES = 1024 * 1024
const RECEIPT_VALIDATOR = fileURLToPath(new URL('./validate_receipt.py', import.meta.url))

export function collectCompletionReceipt(message, expectedMode, directory) {
  const marker = typeof message === 'string' ? message.match(RECEIPT_MARKER) : null
  if (!marker) return receiptFailure('missing')

  const source = marker[1].trim()
  if (!source || source.length > 4096 || !isAbsolute(source)) return receiptFailure('invalid_path')
  if (!regularFile(source)) return receiptFailure('missing_file', source)
  if (lstatSync(source).size > MAX_RECEIPT_BYTES) return receiptFailure('too_large', source)

  let bytes
  let receipt
  try {
    bytes = readFileSync(source)
    if (bytes.length > MAX_RECEIPT_BYTES) return receiptFailure('too_large', source)
    receipt = JSON.parse(bytes.toString('utf8'))
  } catch {
    return receiptFailure('invalid_json', source)
  }

  const validation = spawnSync('python3', [RECEIPT_VALIDATOR, source], {
    stdio: 'ignore',
    timeout: 5000,
    windowsHide: true,
  })
  if (validation.error) return receiptFailure('validator_unavailable', source)
  if (validation.status !== 0) return receiptFailure('invalid_receipt', source)

  const error = receiptModeError(receipt, expectedMode)
  if (error) return receiptFailure(error, source)
  const messageError = releaseMessageError(message, receipt)
  if (messageError) return receiptFailure(messageError, source)

  writePrivateJson(join(directory, 'receipt.json'), receipt)
  return {
    terminal_state: receipt.terminal_state,
    evidence: {
      status: 'valid',
      schema_version: receipt.schema_version,
      mode: receipt.mode,
      receipt_sha256: sha256(bytes),
      source_path_sha256: sha256(source),
    },
  }
}

function receiptModeError(receipt, expectedMode) {
  if (expectedMode && receipt.mode !== expectedMode) return 'mode_mismatch'
  return null
}

function releaseMessageError(message, receipt) {
  if (receipt.terminal_state !== 'released') return null
  if (typeof message !== 'string') return 'release_message_mismatch'
  const expected = receipt.release?.message?.trim()
  if (!expected) return 'release_message_mismatch'
  const visible = message
    .replace(RECEIPT_MARKER, '')
    .replace(ROUTING_MARKER, '')
    .trim()
  return visible.endsWith(expected) ? null : 'release_message_mismatch'
}

function receiptFailure(status, source = null) {
  return {
    terminal_state: 'unknown',
    evidence: {
      status,
      schema_version: null,
      mode: null,
      receipt_sha256: null,
      source_path_sha256: source ? sha256(source) : null,
    },
  }
}

function regularFile(path) {
  if (!existsSync(path)) return false
  const stats = lstatSync(path)
  return stats.isFile() && !stats.isSymbolicLink()
}

function writePrivateJson(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600})
  renameSync(temporary, path)
  try { chmodSync(path, 0o600) } catch {}
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

#!/usr/bin/env node
/**
 * npx entry point.
 *
 * intercom.ts is a Bun program — it uses Bun.serve for the HTTP listener — so
 * this shim hands off to Bun rather than trying to run it under Node. stdio is
 * inherited so the MCP transport passes straight through to Claude Code.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'intercom.ts')

// No shell: with shell:true Node concatenates rather than escapes the args,
// which is both deprecated (DEP0190) and an injection surface.
const child = spawn('bun', ['run', entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

// Claude Code signals this shim, not Bun. Unforwarded, the listener outlives
// the session: still bound to the port, still holding the secret.
const FORCE_KILL_MS = 5000
let forceKill = null

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal)
    if (forceKill === null) {
      forceKill = setTimeout(() => child.kill('SIGKILL'), FORCE_KILL_MS)
      forceKill.unref()
    }
  })
}

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    process.stderr.write(
      'claude-intercom needs the Bun runtime, which was not found on your PATH.\n' +
        'Install it from https://bun.sh and run this again.\n',
    )
    process.exit(127)
  }
  process.stderr.write(`Failed to start intercom: ${err.message}\n`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (forceKill !== null) clearTimeout(forceKill)
  if (signal) {
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})

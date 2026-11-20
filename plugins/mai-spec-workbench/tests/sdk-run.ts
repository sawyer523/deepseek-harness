/**
 * SDK driver for TEST_PLAN cases that need a session whose working directory
 * is not the repository root (TC-03/TC-06/TC-07/TC-08). Spawns the sdk-profile
 * runtime through the source-launch wrapper (tests/dsh-source-bin.sh) with the
 * plugin overlay applied, points the session cwd at argv[2], runs the prompt
 * argv[3], and prints the final response plus the observed tool calls.
 *
 * Usage (from the repository root):
 * `node --import tsx/esm plugins/mai-spec-workbench/tests/sdk-run.ts <workspace-dir> <prompt>`
 * @module mai-spec-workbench/tests/sdk-run
 */

import { resolve } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const workspace = resolve(process.argv[2] ?? '.')
const prompt = process.argv[3]
if (prompt === undefined) {
  console.error('usage: sdk-run.ts <workspace-dir> <prompt>')
  process.exit(2)
}

const here = (relative: string): string => resolve(import.meta.dirname, relative)
const harness = new DeepSeekHarness({
  cwd: workspace,
  dshBin: here('dsh-source-bin.mjs'),
  patches: [here('../cordis.yml')],
})

try {
  const result = await harness.run(prompt)
  interface ResultMessage { content?: { type?: string; text?: string }[]; isError?: boolean }
  interface EventEnvelope { type: string; data?: { name?: string; arguments?: string; message?: ResultMessage } }
  const envelopes = result.events as EventEnvelope[]
  console.log(`[session ${result.sessionId} | finish: ${result.finishReason}]`)
  for (const event of envelopes) {
    if (event.type === 'tool/call') {
      console.log(`[tool call: ${event.data?.name} ${event.data?.arguments}]`)
    } else if (event.type === 'tool/result') {
      const message = event.data?.message
      const text = message?.content?.at(0)?.text ?? ''
      console.log(`[tool result${message?.isError === true ? ' (isError)' : ''} head: ${text.slice(0, 300)}]`)
    }
  }
  console.log('--- final response ---')
  console.log(result.finalResponse)
} finally {
  await harness.close()
}

/**
 * dshBin entry for the SDK driver (tests/sdk-run.ts): runs the dsh CLI from
 * source inside this process. Registers the repository's tsx loader and pins
 * TSX_TSCONFIG_PATH to the repository solution config, so @deepseek-ai/*
 * imports resolve through the repository tsconfig paths regardless of the
 * child's cwd; argv and stdio (the SDK's JSON-RPC transport) pass through
 * untouched, and apps/cli/src/bin.ts executes itself on import.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
process.env.TSX_TSCONFIG_PATH = resolve(repo, 'tsconfig.json')
await import('tsx/esm')
// bin.ts self-executes only as the main module, so call runCli explicitly;
// it parses process.argv itself, which the SDK child argv passes through.
const { runCli } = await import(resolve(repo, 'apps/cli/src/bin.ts'))
await runCli()

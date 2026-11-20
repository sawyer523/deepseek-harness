#!/usr/bin/env node
/**
 * Generate the loader overlay `cordis.yml` beside this script with the local
 * machine's absolute plugin path (the loader resolves `--patch` plugin names
 * from the profile directory, so overlays must carry absolute paths — BR-05).
 * Idempotent: re-running rewrites the same content. The generated file is
 * gitignored; the committed artifact is this script.
 */

import { dirname, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const entry = resolve(dir, 'src/index.ts')
const overlay = `- insert:\n    - id: mai-spec-workbench\n      name: '${entry}'\n`
const target = resolve(dir, 'cordis.yml')

writeFileSync(target, overlay)
console.log(`wrote ${target}`)
console.log(`load with: pnpm dsh web --patch plugins/mai-spec-workbench/cordis.yml`)

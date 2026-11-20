/**
 * Filesystem glue shared by the two tools: session-cwd resolution (mirroring
 * `dsh-tool-fs` session-cwd semantics) and workspace-relative path location.
 * All reads go through `ctx.fs`, so the tools run in the session's filesystem
 * execution world (local, sandbox, or SSH).
 * @module mai-spec-workbench/workspace
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-fs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { MaiWorkbenchError } from './errors.ts'
import type { FeatureLayout } from './mai-layout.ts'
import { loadLayoutJson } from './mai-layout.ts'

/** Directory name of the SDD workspace inside the session working directory. */
const WORKSPACE_DIR = 'mai-specs'

/** File name of the optional artifact-path contract inside the workspace. */
const LAYOUT_FILE = 'FEATURE_LAYOUT.json'

/**
 * Resolve filesystem options for one tool execution. With an owning agent the
 * cwd is the session working directory; without one (e.g. PTC or other
 * non-agent dispatch) resolution falls back to the provider's default
 * directory — the same contract as `dsh-tool-fs`'s session-cwd helper.
 * @param ctx - plugin context providing the working-directory service.
 * @param exec - the current tool execution.
 * @returns resolution options carrying the signal and, when known, the cwd.
 */
export async function sessionResolveOptions(
  ctx: Context,
  exec: ToolRunContext,
): Promise<{ cwd?: string; signal?: AbortSignal }> {
  const cwd = exec.agent === undefined
    ? undefined
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
}

/**
 * Resolve one path relative to the session's `mai-specs/` workspace.
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @param relative - workspace-relative POSIX path (e.g. `999-slug/BRIEF.md`).
 * @returns the resolved target.
 */
export async function resolveWorkspacePath(
  ctx: Context,
  exec: ToolRunContext,
  relative: string,
): Promise<FsTarget> {
  return await ctx.fs.resolve(`${WORKSPACE_DIR}/${relative}`, await sessionResolveOptions(ctx, exec))
}

/**
 * Locate the `mai-specs/` workspace under the session working directory.
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @returns the resolved workspace target.
 * @throws MaiWorkbenchError `MAI_SPECS_NOT_FOUND` when the directory is absent
 * (COPY-01: point the user at `mai init`).
 */
export async function resolveWorkspaceRoot(ctx: Context, exec: ToolRunContext): Promise<FsTarget> {
  const root = await ctx.fs.resolve(WORKSPACE_DIR, await sessionResolveOptions(ctx, exec))
  const info = await ctx.fs.stat(root, exec.signal)
  if (info === undefined) {
    throw new MaiWorkbenchError(
      'notFound',
      `no ${WORKSPACE_DIR}/ workspace found at "${root.displayPath}"; run "mai init" first`,
    )
  }
  if (info.type !== 'directory') {
    throw new MaiWorkbenchError(
      'notFound',
      `"${root.displayPath}" is not a directory; expected the ${WORKSPACE_DIR}/ SDD workspace`,
    )
  }
  return root
}

/**
 * Load the project artifact-path contract when the file exists.
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @returns the parsed contract, or `undefined` when the project has none.
 * @throws MaiWorkbenchError `MAI_LAYOUT_INVALID` when the file exists but is
 * unreadable or malformed (fail loud; never fall back to defaults, BR-02).
 */
export async function readLayoutContract(ctx: Context, exec: ToolRunContext): Promise<FeatureLayout | undefined> {
  const text = await readWorkspaceFile(ctx, exec, LAYOUT_FILE)
  return text === undefined ? undefined : loadLayoutJson(text)
}

/**
 * Read one workspace-relative regular file.
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @param relative - workspace-relative POSIX path.
 * @returns the file text, or `undefined` when absent or not a regular file.
 */
export async function readWorkspaceFile(
  ctx: Context,
  exec: ToolRunContext,
  relative: string,
): Promise<string | undefined> {
  const target = await resolveWorkspacePath(ctx, exec, relative)
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined || info.type !== 'file') return undefined
  return await ctx.fs.readText(target, exec.signal)
}

/**
 * Whether one workspace-relative path exists as a regular file.
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @param relative - workspace-relative POSIX path.
 * @returns existence as a regular file.
 */
export async function workspaceFileExists(
  ctx: Context,
  exec: ToolRunContext,
  relative: string,
): Promise<boolean> {
  const target = await resolveWorkspacePath(ctx, exec, relative)
  const info = await ctx.fs.stat(target, exec.signal)
  return info?.type === 'file'
}

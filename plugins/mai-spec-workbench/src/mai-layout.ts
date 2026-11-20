/**
 * Artifact-path contract for the my-ai-infra SDD workspace: built-in defaults,
 * plus `mai-specs/FEATURE_LAYOUT.json` overrides. Layout parsing is a pure
 * function of the file text.
 * @module mai-spec-workbench/mai-layout
 */

import { MaiWorkbenchError } from './errors.ts'

/** Semantic artifact kinds addressable through the tools. */
export type ArtifactId = 'brief' | 'prd' | 'design' | 'test-plan' | 'design-review' | 'code-review'

/** All artifact ids in canonical order. */
export const ARTIFACT_IDS: readonly ArtifactId[] = [
  'brief', 'prd', 'design', 'test-plan', 'design-review', 'code-review',
]

/** Built-in artifact paths used when no project layout contract exists. */
export const DEFAULT_ARTIFACT_PATHS: Record<ArtifactId, string> = {
  brief: 'BRIEF.md',
  prd: 'spec/PRD.md',
  design: 'design/TECH_DESIGN.md',
  'test-plan': 'test/TEST_PLAN.md',
  'design-review': 'review/design_review.md',
  'code-review': 'review/code_review.md',
}

/** One artifact registration in a `FEATURE_LAYOUT.json`. */
export interface FeatureLayoutArtifact {
  /** Artifact id; must be one of {@link ARTIFACT_IDS}. */
  id: string
  /** Workspace-relative POSIX path with the Feature directory as root. */
  path: string
}

/** Parsed `FEATURE_LAYOUT.json` contract. */
export interface FeatureLayout {
  /** Contract schema version; only `1` is understood. */
  version: number
  /** Registered artifact overrides. */
  artifacts: FeatureLayoutArtifact[]
}

/**
 * Parse a `FEATURE_LAYOUT.json` document. Anything unreadable — invalid JSON,
 * an unsupported `version`, a missing/empty `artifacts` list, unknown or
 * duplicate ids, or non-relative paths — fails loud with `MAI_LAYOUT_INVALID`
 * (PRD BR-02: never silently fall back to default paths). Unknown fields other
 * than the validated ones are ignored for forward compatibility.
 * @param text - complete file content of `mai-specs/FEATURE_LAYOUT.json`.
 * @returns the validated contract.
 */
export function loadLayoutJson(text: string): FeatureLayout {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw layoutInvalid(`not valid JSON: ${(error as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw layoutInvalid('the root must be a JSON object')
  }
  const record = parsed as Record<string, unknown>
  if (record.version !== 1) {
    throw layoutInvalid(`unsupported version ${JSON.stringify(record.version) ?? 'missing'} (expected 1)`)
  }
  if (!Array.isArray(record.artifacts) || record.artifacts.length === 0) {
    throw layoutInvalid('a non-empty artifacts array is required')
  }
  const artifacts: FeatureLayoutArtifact[] = []
  const seen = new Set<string>()
  for (const entry of record.artifacts) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw layoutInvalid('every artifacts entry must be an object')
    }
    const { id, path } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !isArtifactId(id)) {
      throw layoutInvalid(`unknown artifact id ${JSON.stringify(id)}`)
    }
    if (id === 'brief') {
      throw layoutInvalid('the contract cannot move "brief"; BRIEF.md stays at the Feature root')
    }
    if (seen.has(id)) throw layoutInvalid(`duplicate artifact id "${id}"`)
    if (typeof path !== 'string' || path === '' || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
      throw layoutInvalid(`artifact "${id}" needs a non-empty workspace-relative path`)
    }
    seen.add(id)
    artifacts.push({ id, path })
  }
  return { version: 1, artifacts }
}

/**
 * Resolve the complete id→path mapping. Contract entries override defaults;
 * artifacts the contract does not register keep their default path, and
 * `brief` always stays `BRIEF.md` (the layout contract never moves it).
 * @param layout - parsed contract, or `undefined` when the project has none.
 * @returns one path for every artifact id.
 */
export function artifactPaths(layout: FeatureLayout | undefined): Record<ArtifactId, string> {
  const paths: Record<ArtifactId, string> = { ...DEFAULT_ARTIFACT_PATHS }
  if (layout === undefined) return paths
  for (const artifact of layout.artifacts) {
    paths[artifact.id as ArtifactId] = artifact.path
  }
  return paths
}

const isArtifactId = (id: string): id is ArtifactId => (ARTIFACT_IDS as readonly string[]).includes(id)

const layoutInvalid = (reason: string): MaiWorkbenchError =>
  new MaiWorkbenchError('layoutInvalid', `mai-specs/FEATURE_LAYOUT.json is invalid (${reason})`)

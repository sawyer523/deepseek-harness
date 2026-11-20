/**
 * Pure parsers for my-ai-infra SDD workspace documents (BRIEF.md, TEST_PLAN.md)
 * and shared text windowing. No framework or filesystem dependencies, so every
 * function is directly unit-testable.
 * @module mai-spec-workbench/parse-specs
 */

/** Feature directory name pattern: `NNN-<slug>` with a three-digit number. */
export const FEATURE_DIR_PATTERN = /^\d{3}-/

/** Fields extracted from a Feature `BRIEF.md`; missing fields stay `undefined`. */
export interface FeatureBrief {
  /** Three-digit Feature number from the `# {id}: {title}` heading. */
  id?: string
  /** Title text from the heading, without the number. */
  title?: string
  /** `Phase` table value (draft/ready/dev/review/done). */
  phase?: string
  /** `Profile` table value (simple/standard). */
  profile?: string
  /** `优先级` table value (e.g. P1). */
  priority?: string
}

/**
 * Parse a BRIEF.md. Reads the `# {id}: {title}` heading and the two-column
 * table rows `Phase` / `Profile` / `优先级` (template-verbatim keys, others
 * ignored). Never throws: a malformed brief yields the parseable subset, and
 * the caller surfaces missing fields as `unknown` plus a warning (BR-04).
 * @param text - complete BRIEF.md content.
 * @returns whatever fields could be parsed.
 */
export function parseBrief(text: string): FeatureBrief {
  const brief: FeatureBrief = {}
  for (const line of text.split('\n')) {
    const heading = /^# (\d{3}): (.+?)\s*$/.exec(line)
    if (heading !== null && heading[1] !== undefined && heading[2] !== undefined && brief.id === undefined) {
      brief.id = heading[1]
      brief.title = heading[2]
      continue
    }
    const row = /^\|([^|]+)\|([^|]+)\|\s*$/.exec(line)
    if (row === null || row[1] === undefined || row[2] === undefined) continue
    const key = row[1].trim()
    const value = row[2].trim()
    if (value === '') continue
    if (key === 'Phase' && brief.phase === undefined) brief.phase = value
    else if (key === 'Profile' && brief.profile === undefined) brief.profile = value
    else if (key === '优先级' && brief.priority === undefined) brief.priority = value
  }
  return brief
}

/** One acceptance-result tally entry, ordered by first appearance. */
export interface AcceptanceCount {
  /** Result-column value (`通过`/`失败`/`未执行`/`受阻`/`待核验`, or `其他`). */
  result: string
  /** How many rows carried that value. */
  count: number
}

/**
 * Acceptance summary (PRD D4: counts only — the tool never fabricates an
 * overall pass verdict; `no-test-plan` is constructed by the tool layer).
 */
export type AcceptanceSummary =
  | { status: 'counted'; counts: AcceptanceCount[] }
  | { status: 'no-results' }

/** Result-column values defined by the my-ai-infra TEST_PLAN template. */
const KNOWN_RESULTS: readonly string[] = ['通过', '失败', '未执行', '受阻', '待核验']

/**
 * Parse the `## 执行结果` section of a TEST_PLAN.md: take the section's first
 * table, locate the `结果` column by exact header match, and tally its values.
 * Unknown non-empty values count under `其他` and are returned for warnings.
 * @param text - complete TEST_PLAN.md content.
 * @returns the summary plus distinct unknown values; `no-results` when the
 * section is absent, has no table, or the table has no data rows.
 */
export function parseAcceptanceResults(text: string): { summary: AcceptanceSummary; unknownValues: string[] } {
  const counts: AcceptanceCount[] = []
  const tally = new Map<string, number>()
  const unknown = new Set<string>()
  const lines = text.split('\n')
  const sectionStart = lines.findIndex(line => sectionTitle(line) === '执行结果')
  if (sectionStart !== -1) {
    const tableStart = findResultsTableStart(lines, sectionStart)
    if (tableStart !== undefined) {
      const { columnIndex, firstRow } = tableStart
      for (const cells of tableDataRows(lines, firstRow)) {
        const value = cells[columnIndex]?.trim() ?? ''
        if (value === '') continue
        const key = KNOWN_RESULTS.includes(value) ? value : '其他'
        if (!KNOWN_RESULTS.includes(value)) unknown.add(value)
        tally.set(key, (tally.get(key) ?? 0) + 1)
      }
    }
  }
  if (tally.size === 0) return { summary: { status: 'no-results' }, unknownValues: [] }
  for (const [result, count] of tally) counts.push({ result, count })
  return { summary: { status: 'counted', counts }, unknownValues: [...unknown] }
}

/** Heading title of one `## …` line, or `undefined` for any other line. */
function sectionTitle(line: string): string | undefined {
  const match = /^## (.+?)\s*$/.exec(line)
  return match === null ? undefined : match[1]
}

/** Locate the first table inside the 执行结果 section and its `结果` column. */
function findResultsTableStart(lines: readonly string[], sectionStart: number):
    { columnIndex: number; firstRow: number } | undefined {
  for (let index = sectionStart + 1; index < lines.length; index++) {
    const line = lines[index]
    if (line === undefined) break
    if (sectionTitle(line) !== undefined) break
    if (!isTableRow(line)) continue
    const cells = splitTableRow(line)
    const columnIndex = cells.findIndex(cell => cell.trim() === '结果')
    if (columnIndex === -1) continue
    const firstRow = index + 1
    const next = lines[firstRow]
    if (next === undefined || !isTableRow(next)) return undefined
    return { columnIndex, firstRow }
  }
  return undefined
}

/** Data-row cell lists of the contiguous table starting at `firstRow`. */
function tableDataRows(lines: readonly string[], firstRow: number): string[][] {
  const rows: string[][] = []
  for (let index = firstRow; index < lines.length; index++) {
    const line = lines[index]
    if (line === undefined || !isTableRow(line)) break
    const cells = splitTableRow(line)
    if (isSeparatorRow(cells)) continue
    rows.push(cells)
  }
  return rows
}

const isTableRow = (line: string): boolean => /^\|.*\|\s*$/.test(line.trim())

const splitTableRow = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')

const isSeparatorRow = (cells: readonly string[]): boolean =>
  cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()))

/** One numbered line inside a spec window. */
export interface WindowLine {
  /** 1-based line number in the artifact file. */
  number: number
  /** Line text, truncated to {@link MAX_LINE_LENGTH} with a `…` marker. */
  text: string
}

/** Windowed slice of a text document (mirrors the built-in `read` shape). */
export interface LineWindow {
  /** 1-based first returned line. */
  offset: number
  /** Returned lines in file order. */
  lines: WindowLine[]
  /** Total line count of the document. */
  totalLines: number
}

/** Maximum lines returned by one `mai_spec_read` call (NFR-01). */
export const MAX_WINDOW_LINES = 2000

/** Maximum characters returned for one line (NFR-01). */
export const MAX_LINE_LENGTH = 2000

/**
 * Window a text document by 1-based line range. `offset` past the end returns
 * an empty window with the true `totalLines`; long lines are truncated with a
 * trailing `…` marker.
 * @param text - complete document text.
 * @param offset - 1-based first line to return (validated by the caller).
 * @param limit - maximum number of lines to return (validated by the caller).
 * @returns the window slice.
 */
export function windowLines(text: string, offset: number, limit: number): LineWindow {
  const all = text.split('\n')
  const lines: WindowLine[] = []
  const startIndex = offset - 1
  const end = Math.min(all.length, startIndex + limit)
  for (let index = Math.max(startIndex, 0); index < end; index++) {
    const raw = all[index] ?? ''
    lines.push({
      number: index + 1,
      text: raw.length > MAX_LINE_LENGTH ? `${raw.slice(0, MAX_LINE_LENGTH)}…` : raw,
    })
  }
  return { offset, lines, totalLines: all.length }
}

/**
 * Match one Feature directory by exact directory name or bare three-digit id.
 * Ids are allocated uniquely by the my-create-feature script, so an id prefix
 * (`NNN-`) matches at most one directory.
 * @param names - candidate directory names (already filtered to `NNN-slug`).
 * @param input - user-supplied feature reference.
 * @returns the unique matching directory name, or `undefined`.
 */
export function matchFeatureDir(names: readonly string[], input: string): string | undefined {
  const exact = names.find(name => name === input)
  if (exact !== undefined) return exact
  if (!/^\d{3}$/.test(input)) return undefined
  return names.find(name => name.startsWith(`${input}-`))
}

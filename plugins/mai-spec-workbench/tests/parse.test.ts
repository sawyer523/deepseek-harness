/**
 * Unit tests for the pure parsers and the artifact-path contract. Run from the
 * plugin directory (or repo root) with:
 * `node --import tsx/esm --test plugins/mai-spec-workbench/tests/parse.test.ts`
 * @module mai-spec-workbench/tests/parse.test
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MaiWorkbenchError } from '../src/errors.ts'
import { artifactPaths, loadLayoutJson } from '../src/mai-layout.ts'
import type { FeatureLayout } from '../src/mai-layout.ts'
import {
  matchFeatureDir,
  parseAcceptanceResults,
  parseBrief,
  windowLines,
} from '../src/parse-specs.ts'

const BRIEF = [
  '# 999: 示例需求',
  '',
  '| 项 | 值 |',
  '|---|---|',
  '| Phase | draft |',
  '| Profile | standard |',
  '| 优先级 | P1 |',
  '| 负责人 | someone |',
  '',
  '## 一句话描述',
  '',
  '描述正文。',
].join('\n')

const TEST_PLAN_WITH_RESULTS = [
  '# 业务测试计划',
  '',
  '## 执行结果',
  '',
  '| 用例 / 已有测试引用 | 结果 | 实际观察与证据 | 问题或复验事项 |',
  '|---|---|---|---|',
  '| TC-01 | 通过 | 输出留档 | 无 |',
  '| TC-02 | 通过 | 输出留档 | 无 |',
  '| TC-03 | 未执行 | 环境缺失 | 待补 |',
  '| TC-04 | 部分通过 | 见备注 | 待复验 |',
  '',
  '## 其他章节',
  '',
  '| 用例 | 结果 |',
  '|---|---|',
  '| 不应计入 | 通过 |',
].join('\n')

describe('parseBrief', () => {
  it('parses heading and known table fields', () => {
    assert.deepEqual(parseBrief(BRIEF), {
      id: '999',
      title: '示例需求',
      phase: 'draft',
      profile: 'standard',
      priority: 'P1',
    })
  })

  it('keeps missing fields undefined and never throws', () => {
    assert.deepEqual(parseBrief('随便一段文本\n没有标题没有表格'), {})
    assert.deepEqual(parseBrief('| Phase | ready |'), { phase: 'ready' })
  })

  it('ignores non-h2-safe headings and unrelated table keys', () => {
    const text = '## 999: 副标题\n| 目标日期 | 2026-12-31 |\n| Phase | dev |'
    const brief = parseBrief(text)
    assert.equal(brief.id, undefined)
    assert.equal(brief.phase, 'dev')
    assert.equal(brief.priority, undefined)
  })

  it('reads against the real Feature 999 brief shape', () => {
    const brief = parseBrief('# 999: my-ai-infra SDD 工作台只读插件\n\n| 项 | 值 |\n|---|---|\n| Phase | draft |\n| Profile | standard |\n| 优先级 | P1 |\n| 负责人 | xiaonan chen |')
    assert.equal(brief.id, '999')
    assert.equal(brief.phase, 'draft')
    assert.equal(brief.profile, 'standard')
    assert.equal(brief.priority, 'P1')
  })
})

describe('parseAcceptanceResults', () => {
  it('counts known values and groups unknown values under 其他', () => {
    const { summary, unknownValues } = parseAcceptanceResults(TEST_PLAN_WITH_RESULTS)
    assert.equal(summary.status, 'counted')
    if (summary.status !== 'counted') return
    assert.deepEqual(summary.counts, [
      { result: '通过', count: 2 },
      { result: '未执行', count: 1 },
      { result: '其他', count: 1 },
    ])
    assert.deepEqual(unknownValues, ['部分通过'])
  })

  it('returns no-results without the section', () => {
    const { summary } = parseAcceptanceResults('# 计划\n\n只有规划内容。')
    assert.deepEqual(summary, { status: 'no-results' })
  })

  it('returns no-results when the table has no data rows', () => {
    const text = '## 执行结果\n\n| 用例 / 已有测试引用 | 结果 | 实际观察与证据 | 问题或复验事项 |\n|---|---|---|---|\n'
    const { summary } = parseAcceptanceResults(text)
    assert.deepEqual(summary, { status: 'no-results' })
  })

  it('stops at the section boundary and skips empty result cells', () => {
    const text = [
      '前言',
      '',
      '## 执行结果',
      '',
      '| 用例 | 结果 |',
      '|---|---|',
      '| A | 通过 |',
      '| B |  |',
      '',
      '## 后续章节',
      '',
      '| 用例 | 结果 |',
      '|---|---|',
      '| C | 失败 |',
    ].join('\n')
    const { summary } = parseAcceptanceResults(text)
    assert.equal(summary.status, 'counted')
    if (summary.status !== 'counted') return
    assert.deepEqual(summary.counts, [{ result: '通过', count: 1 }])
  })
})

describe('windowLines', () => {
  const text = ['第一行', '第二行', '第三行'].join('\n')

  it('returns the whole document with 1-based numbers by default range', () => {
    const window = windowLines(text, 1, 2000)
    assert.equal(window.totalLines, 3)
    assert.deepEqual(window.lines, [
      { number: 1, text: '第一行' },
      { number: 2, text: '第二行' },
      { number: 3, text: '第三行' },
    ])
  })

  it('windows by offset and limit', () => {
    const window = windowLines(text, 2, 1)
    assert.equal(window.offset, 2)
    assert.deepEqual(window.lines, [{ number: 2, text: '第二行' }])
    assert.equal(window.totalLines, 3)
  })

  it('returns an empty window past the end with the true totalLines', () => {
    const window = windowLines(text, 10, 5)
    assert.deepEqual(window.lines, [])
    assert.equal(window.totalLines, 3)
  })

  it('truncates lines beyond the length cap with a marker', () => {
    const long = 'x'.repeat(2500)
    const window = windowLines(long, 1, 1)
    assert.equal(window.lines[0]?.text.length, 2001)
    assert.ok(window.lines[0]?.text.endsWith('…'))
  })
})

describe('matchFeatureDir', () => {
  const names = ['998-other', '999-mai-spec-workbench']

  it('matches an exact directory name', () => {
    assert.equal(matchFeatureDir(names, '999-mai-spec-workbench'), '999-mai-spec-workbench')
  })

  it('matches a bare three-digit id by unique prefix', () => {
    assert.equal(matchFeatureDir(names, '999'), '999-mai-spec-workbench')
  })

  it('returns undefined for unknown or malformed input', () => {
    assert.equal(matchFeatureDir(names, '123'), undefined)
    assert.equal(matchFeatureDir(names, '99'), undefined)
    assert.equal(matchFeatureDir(names, '999-other-x'), undefined)
    assert.equal(matchFeatureDir([], '999'), undefined)
  })
})

describe('loadLayoutJson / artifactPaths', () => {
  it('accepts a valid contract and overrides only registered ids', () => {
    const layout: FeatureLayout = loadLayoutJson(
      JSON.stringify({ version: 1, artifacts: [{ id: 'prd', path: 'docs/product.md' }] }),
    )
    const paths = artifactPaths(layout)
    assert.equal(paths.prd, 'docs/product.md')
    assert.equal(paths.brief, 'BRIEF.md')
    assert.equal(paths.design, 'design/TECH_DESIGN.md')
  })

  it('applies defaults without a contract', () => {
    assert.equal(artifactPaths(undefined)['test-plan'], 'test/TEST_PLAN.md')
  })

  const invalidCases: [name: string, text: string][] = [
    ['broken json', '{ not json'],
    ['non-object root', '[]'],
    ['wrong version', JSON.stringify({ version: 2, artifacts: [] })],
    ['missing artifacts', JSON.stringify({ version: 1 })],
    ['empty artifacts', JSON.stringify({ version: 1, artifacts: [] })],
    ['unknown id', JSON.stringify({ version: 1, artifacts: [{ id: 'mystery', path: 'a.md' }] })],
    ['brief override', JSON.stringify({ version: 1, artifacts: [{ id: 'brief', path: 'docs/brief.md' }] })],
    ['duplicate id', JSON.stringify({ version: 1, artifacts: [{ id: 'prd', path: 'a.md' }, { id: 'prd', path: 'b.md' }] })],
    ['absolute path', JSON.stringify({ version: 1, artifacts: [{ id: 'prd', path: '/etc/passwd' }] })],
    ['windows drive path', JSON.stringify({ version: 1, artifacts: [{ id: 'prd', path: 'C:/x.md' }] })],
    ['empty path', JSON.stringify({ version: 1, artifacts: [{ id: 'prd', path: '' }] })],
  ]

  for (const [name, text] of invalidCases) {
    it(`fails loud on ${name}`, () => {
      assert.throws(() => loadLayoutJson(text), (error: unknown) => {
        assert.ok(error instanceof MaiWorkbenchError)
        assert.equal(error.code, 'MAI_LAYOUT_INVALID')
        assert.ok(error.message.includes('FEATURE_LAYOUT.json'))
        return true
      })
    })
  }
})

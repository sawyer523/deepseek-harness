/**
 * Expected-failure error model for the mai-spec-workbench tools.
 * @module mai-spec-workbench/errors
 */

import { HarnessError } from '@deepseek-ai/dsh-error'

/** Stable codes carried by every expected tool failure (PRD BR-03). */
const MAI_ERROR_CODES = {
  notFound: 'MAI_SPECS_NOT_FOUND',
  featureNotFound: 'MAI_FEATURE_NOT_FOUND',
  artifactNotFound: 'MAI_ARTIFACT_NOT_FOUND',
  layoutInvalid: 'MAI_LAYOUT_INVALID',
} as const

/** Expected-failure kinds, each mapped to one stable wire code. */
export type MaiErrorCode = keyof typeof MAI_ERROR_CODES

/**
 * One expected mai-spec-workbench tool failure with a stable code.
 * @param code - the failure kind; maps to a stable `MAI_*` error code.
 * @param message - actionable, user-visible failure explanation.
 */
export class MaiWorkbenchError extends HarnessError {
  constructor(code: MaiErrorCode, message: string) {
    super(message, MAI_ERROR_CODES[code])
  }
}

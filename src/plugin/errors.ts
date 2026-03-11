export class ContentCollectionError extends Error {
  public filePath: string
  public line: number | undefined
  public column: number | undefined

  constructor(
    message: string,
    filePath: string,
    line?: number,
    column?: number,
  ) {
    const location = line != null ? `:${line}${column != null ? `:${column}` : ''}` : ''
    super(`[vike-content-collection] ${filePath}${location} - ${message}`)
    this.name = 'ContentCollectionError'
    this.filePath = filePath
    this.line = line
    this.column = column
  }
}

export interface ValidationIssue {
  message: string
  path: (string | number)[]
  filePath: string
  line?: number
  column?: number
}

export function formatValidationErrors(issues: ValidationIssue[]): string {
  const lines = issues.map((issue) => {
    const location =
      issue.line != null
        ? `:${issue.line}${issue.column != null ? `:${issue.column}` : ''}`
        : ''
    const path = issue.path.length > 0 ? ` (at "${issue.path.join('.')}")` : ''
    return `  ${issue.filePath}${location}${path}: ${issue.message}`
  })

  return `[vike-content-collection] Schema validation failed:\n${lines.join('\n')}`
}

export function throwValidationError(issues: ValidationIssue[]): never {
  const err = new Error(formatValidationErrors(issues))
  err.name = 'ContentCollectionValidationError'
  throw err
}

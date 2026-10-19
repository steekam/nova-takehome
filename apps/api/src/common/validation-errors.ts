import { ValidationError } from 'class-validator'

export interface ValidationIssue {
  field: string
  constraints: string[]
}

export function flattenValidationErrors(errors: ValidationError[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  function visit(error: ValidationError, parentPath = ''): void {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property
    const constraints = Object.keys(error.constraints ?? {}).sort()

    if (constraints.length > 0) issues.push({ field, constraints })
    for (const child of error.children ?? []) visit(child, field)
  }

  for (const error of errors) visit(error)
  return issues.sort((left, right) => left.field.localeCompare(right.field))
}

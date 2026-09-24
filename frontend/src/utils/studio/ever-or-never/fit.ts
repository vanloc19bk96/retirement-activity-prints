import { orderForVariety, type EonStatement } from './content'
import { breakStatement, type EonPagePlan } from './layout'

/** A statement already broken to the column it prints in. */
export interface FittedEonStatement extends EonStatement {
  lines: string[]
}

/**
 * Hold real statements to the page the form promised.
 *
 * Type size, columns and reserved lines stay exactly as the worst-case plan
 * set them, so every page of a run matches. A statement that breaks onto more
 * lines than reserved is left off and the next takes its place. The pool is
 * walked in variety order, so a page mixes its sentence shapes and topics.
 * Only the count may fall — never the type — and never below one.
 */
export function fitEonStatements(
  items: readonly EonStatement[],
  promised: EonPagePlan,
  font: string,
): { items: FittedEonStatement[]; plan: EonPagePlan } | null {
  const chosen: FittedEonStatement[] = []
  for (const item of orderForVariety(items)) {
    if (chosen.length >= promised.count) break
    const lines = breakStatement(item.statement, promised, font)
    if (lines.length > promised.statementLines) continue
    chosen.push({ ...item, lines })
  }
  if (chosen.length === 0) return null
  return { items: chosen, plan: { ...promised, count: chosen.length } }
}

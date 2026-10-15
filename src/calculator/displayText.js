/** Translate only user-facing text; keep workbook cell identifiers and calculation formulas untouched. */
export function visibleCalculatorText(value) {
  return String(value ?? '').replaceAll('عمق', 'طول');
}

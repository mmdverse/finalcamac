const SHAFT_WIDTH_CHECKS = Object.freeze({
  'shaft-capacity': Object.freeze({ actualCell: 'N5', requiredCell: 'R16', errorCells: Object.freeze(['R16', 'N16']) }),
  'shaft-from-cabin': Object.freeze({ actualCell: 'N42', requiredCell: 'R54', errorCells: Object.freeze(['R54', 'N54']) }),
  hydraulic: Object.freeze({ actualCell: 'N62', requiredCell: 'R73', errorCells: Object.freeze(['R73', 'N73']) }),
});

/** True only when the calculated minimum exceeds the shaft width entered or proposed. */
export function isShaftWidthMismatch(calculatorId, getCellValue) {
  const check = SHAFT_WIDTH_CHECKS[calculatorId];
  if (!check || typeof getCellValue !== 'function') return false;
  const actualWidth = getCellValue(check.actualCell);
  const requiredWidth = getCellValue(check.requiredCell);
  return Number.isFinite(actualWidth) && Number.isFinite(requiredWidth) && requiredWidth > actualWidth;
}

/** Marks the minimum-width and fit-status cards, not unrelated results, for the width failure. */
export function isShaftWidthErrorMetric(calculatorId, metricCell, mismatch) {
  return Boolean(mismatch && SHAFT_WIDTH_CHECKS[calculatorId]?.errorCells.includes(metricCell));
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const ARABIC_WORDS_RE = /\s+|[^\s]+/gu;

function findRanges(value, target) {
  const ranges = [];
  if (!target) return ranges;

  let searchFrom = 0;
  while (searchFrom <= value.length - target.length) {
    const start = value.indexOf(target, searchFrom);
    if (start < 0) break;
    ranges.push({ start, end: start + target.length });
    searchFrom = start + Math.max(1, target.length);
  }
  return ranges;
}

/**
 * Creates animation runs without breaking Arabic-script shaping.
 * Arabic/Persian letters stay together by word (including ZWNJ); other scripts
 * keep the component's original per-code-point animation units.
 */
export function buildStrokeTextUnits(text, highlightText = '') {
  const value = String(text ?? '');
  const target = String(highlightText ?? '');
  const containsArabicScript = ARABIC_SCRIPT_RE.test(value);
  const ranges = findRanges(value, target);
  const tokens = containsArabicScript
    ? (value.match(ARABIC_WORDS_RE) ?? [])
    : Array.from(value);

  let offset = 0;
  return tokens.map(token => {
    const start = offset;
    const end = start + token.length;
    offset = end;

    return {
      text: token,
      animated: !containsArabicScript || !/^\s+$/u.test(token),
      // For Arabic text, a partial highlight colors the whole word so its
      // letters remain one shaping run instead of splitting a glyph sequence.
      highlighted: ranges.some(range => range.start < end && range.end > start)
    };
  });
}

/**
 * Approximate Python lexing regions where mechanical regex transforms must not run:
 * #-to-EOL comments and string literals (optionally prefixed [fFbBuUr] and triple-quoted).
 */

export interface ByteRange {
  start: number;
  end: number;
}

function mergeRanges(ranges: ByteRange[]): ByteRange[] {
  if (ranges.length === 0) return [];
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const out: ByteRange[] = [{ ...ranges[0] }];
  for (let k = 1; k < ranges.length; k++) {
    const cur = ranges[k]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

function consumeTriple(s: string, i: number, q: '"' | "'"): number {
  let j = i + 3;
  const close = `${q}${q}${q}`;
  while (j < s.length) {
    if (s.slice(j, j + 3) === close) return j + 3;
    if (s[j] === "\\") j += 2;
    else j += 1;
  }
  return s.length;
}

function consumeSingle(s: string, i: number, q: "'" | '"'): number {
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === q) return j + 1;
    j += 1;
  }
  return s.length;
}

/** First index of string literal: optional [fFbBuUr]{1,3} then opening quote at quoteIdx. */
function literalStart(s: string, quoteIdx: number): number {
  let j = quoteIdx - 1;
  let pre = 0;
  while (j >= 0 && pre < 3 && /[fFbBuUrR]/.test(s[j]!)) {
    j--;
    pre++;
  }
  return j + 1;
}

/** #-to-EOL only — use for sender-dict style rewrites where dict keys use quoted `'from'` strings. */
export function getPythonCommentOnlyMaskedRanges(source: string): ByteRange[] {
  const ranges: ByteRange[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "#") {
      const nl = source.indexOf("\n", i);
      const lineEnd = nl === -1 ? source.length : nl;
      ranges.push({ start: i, end: lineEnd });
      i = lineEnd;
      continue;
    }
    i += 1;
  }
  return mergeRanges(ranges);
}

export function getPythonMaskedRanges(source: string): ByteRange[] {
  const ranges: ByteRange[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "#") {
      const nl = source.indexOf("\n", i);
      const lineEnd = nl === -1 ? source.length : nl;
      ranges.push({ start: i, end: lineEnd });
      i = lineEnd;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const startStr = literalStart(source, i);
      const isTriple = source.slice(i, i + 3) === `${ch}${ch}${ch}`;
      const end = isTriple ? consumeTriple(source, i, ch) : consumeSingle(source, i, ch);
      ranges.push({ start: startStr, end });
      i = end;
      continue;
    }

    i += 1;
  }

  return mergeRanges(ranges);
}

export function overlapsMasked(index: number, length: number, ranges: ByteRange[]): boolean {
  const end = index + length;
  for (const r of ranges) {
    if (index < r.end && end > r.start) return true;
  }
  return false;
}

/** Matching `)` for `(` at openIdx, skipping masked substrings and respecting nesting. */
export function findClosingParenBalanced(
  source: string,
  openIdx: number,
  ranges: ByteRange[],
): number | null {
  if (source[openIdx] !== "(") return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const hit = ranges.find((r) => i >= r.start && i < r.end);
    if (hit) {
      i = hit.end;
      continue;
    }
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return i - 1;
}

export function replaceAllRegexOutsideMasked(
  source: string,
  pattern: RegExp,
  cb: (match: RegExpExecArray, source: string) => string,
): { source: string; count: number } {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const ranges = getPythonMaskedRanges(source);
  let count = 0;
  let out = "";
  let lastIdx = 0;
  global.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = global.exec(source)) !== null) {
    const full = m[0];
    const idx = m.index;
    if (full.length === 0) global.lastIndex++;
    if (overlapsMasked(idx, full.length, ranges)) continue;
    count += 1;
    const repl = cb(m, source);
    out += source.slice(lastIdx, idx);
    out += repl;
    lastIdx = idx + full.length;
  }
  out += source.slice(lastIdx);
  return { source: out, count };
}

/** Like replaceAllRegexOutsideMasked but only skips #-comments (not string literals). */
export function replaceAllRegexOutsideComments(
  source: string,
  pattern: RegExp,
  cb: (match: RegExpExecArray, source: string) => string,
): { source: string; count: number } {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const ranges = getPythonCommentOnlyMaskedRanges(source);
  let count = 0;
  let out = "";
  let lastIdx = 0;
  global.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = global.exec(source)) !== null) {
    const full = m[0];
    const idx = m.index;
    if (full.length === 0) global.lastIndex++;
    if (overlapsMasked(idx, full.length, ranges)) continue;
    count += 1;
    const repl = cb(m, source);
    out += source.slice(lastIdx, idx);
    out += repl;
    lastIdx = idx + full.length;
  }
  out += source.slice(lastIdx);
  return { source: out, count };
}

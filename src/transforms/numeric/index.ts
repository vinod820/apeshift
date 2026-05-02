/**
 * Normalize scientific literals so edits do not break operator precedence (`/ 1e8`).
 * Maps `1eN`/`1e+N`/`1EN` → `10**N`, and otherwise `XeN` → `(X * 10**N)`.
 */
import type { TransformModule } from "../types.js";

function replaceScientific(source: string): { source: string; count: number } {
  let count = 0;
  const next = source.replace(
    /\b(\d+(?:\.\d+)?)([eE])([+-]?\d+)\b/g,
    (_match: string, coef: string, _e: string, expRaw: string) => {
      count += 1;
      const exp = expRaw.replace(/^\+/, "");
      if (coef === "1") return `10**${exp}`;
      return `(${coef} * 10**${exp})`;
    },
  );
  return { source: next, count };
}

export const numericTransform: TransformModule = {
  name: "numeric",
  rulePath: "src/transforms/numeric/rule.yaml",
  apply(source: string) {
    return replaceScientific(source);
  },
};

export default numericTransform;

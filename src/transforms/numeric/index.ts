// Numeric transform is implemented as part of cleanup/index.ts
// This module re-exports a no-op to satisfy the transform registry.
// See cleanup/index.ts for the actual 1eN -> N * 10**N conversion.
import type { TransformModule } from "../types.js";

export const numericTransform: TransformModule = {
  name: "numeric",
  rulePath: "src/transforms/numeric/rule.yaml",
  apply: (source: string) => ({ source, count: 0 }),
};

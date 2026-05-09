// Testing transform is implemented as part of cleanup/index.ts
// This module re-exports a no-op to satisfy the transform registry.
// See cleanup/index.ts for fn_isolation and test helper rewrites.
import type { TransformModule } from "../types.js";

export const testingTransform: TransformModule = {
  name: "testing",
  rulePath: "src/transforms/testing/rule.yaml",
  apply: (source: string) => ({ source, count: 0 }),
};

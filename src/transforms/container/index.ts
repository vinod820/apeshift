// Container transform is implemented as part of cleanup/index.ts
// This module re-exports a no-op to satisfy the transform registry.
// See cleanup/index.ts for len(Contract) and Contract[-1] rewrites.
import type { TransformModule } from "../types.js";

export const containerTransform: TransformModule = {
  name: "container",
  rulePath: "src/transforms/container/rule.yaml",
  apply: (source: string) => ({ source, count: 0 }),
};

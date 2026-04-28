// Config transform is implemented as part of cleanup/index.ts
// This module re-exports a no-op to satisfy the transform registry.
// See cleanup/index.ts and runner.ts for Brownie config to Ape config handling.
import type { TransformModule } from "../types.js";

export const configTransform: TransformModule = {
  name: "config",
  rulePath: "src/transforms/config/rule.yaml",
  apply: (source: string) => ({ source, count: 0 }),
};

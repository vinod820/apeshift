import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("chain.sleep migration", () => {
  it("rewrites chain.sleep to chain.mine with TODO", () => {
    const result = cleanupTransform.apply("chain.sleep(100)");
    expect(result.source).toContain("chain.mine(1)");
    expect(result.source).toContain("TODO(apeshift)");
    expect(result.count).toBeGreaterThan(0);
  });
});

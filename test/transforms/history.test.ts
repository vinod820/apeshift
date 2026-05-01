import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("history migration", () => {
  it("rewrites history[-1] to chain.history[-1]", () => {
    const { source, count } = cleanupTransform.apply("tx = history[-1]");
    expect(source).toContain("chain.history[-1]");
    expect(count).toBeGreaterThan(0);
  });
});

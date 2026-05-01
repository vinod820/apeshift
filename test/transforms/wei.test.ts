import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("Wei() migration", () => {
  it("converts Wei('1 ether') to 1 * 10**18", () => {
    const { source } = cleanupTransform.apply('Wei("1 ether")');
    expect(source).toBe("1 * 10**18");
  });

  it("converts Wei('2 gwei')", () => {
    const { source } = cleanupTransform.apply('Wei("2 gwei")');
    expect(source).toBe("2 * 10**9");
  });

  it("adds TODO for dynamic Wei() calls", () => {
    const { source } = cleanupTransform.apply("Wei(amount)");
    expect(source).toContain("TODO(apeshift)");
  });
});

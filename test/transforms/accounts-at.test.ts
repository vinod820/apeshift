import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("accounts.at() migration", () => {
  it("adds TODO to accounts.at() calls", () => {
    const { source, count } = cleanupTransform.apply('accounts.at("0x123", force=True)');
    expect(source).toContain("TODO(apeshift)");
    expect(count).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { parsePytestCounts } from "../src/validator.js";

describe("validator helpers", () => {
  it("parses pytest counts from ape test output", () => {
    expect(parsePytestCounts("==== 12 passed, 2 failed in 4.2s ====")).toEqual({
      testsPassed: 12,
      testsFailed: 2,
    });
  });

  it("returns zero counts when no tests run", () => {
    expect(parsePytestCounts("no tests ran")).toEqual({
      testsPassed: 0,
      testsFailed: 0,
    });
  });
});

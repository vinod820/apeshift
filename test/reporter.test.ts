import { describe, expect, it } from "vitest";
import { calculateConfidenceScore } from "../src/reporter.js";

describe("reporter", () => {
  it("calculates confidence score from automation, compile, and tests", () => {
    const score = calculateConfidenceScore({
      patternsAutomated: 8,
      patternsTotal: 10,
      validation: {
        compileSuccess: true,
        compileErrors: [],
        testsPassed: 9,
        testsFailed: 1,
        testErrors: [],
        skipped: false,
      },
    });
    expect(score).toBe(85);
  });
});

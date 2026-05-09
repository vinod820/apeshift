import { describe, expect, it } from "vitest";
import { importsMultilineTransform } from "../../src/transforms/imports-multiline/index.js";

describe("imports multiline transform", () => {
  it("rewrites a simple multi-line Brownie import when all names are Ape names", () => {
    const input = ["from brownie import (", "    accounts,", "    Contract,", "    network,", ")"].join("\n");
    const result = importsMultilineTransform.apply(input);
    expect(result.count).toBe(1);
    expect(result.source).toContain("from ape import (");
    expect(result.source).toContain("    accounts,");
    expect(result.source).toContain("    Contract,");
    expect(result.source).toContain("    networks,");
  });

  it("leaves mixed imports unchanged for manual cleanup", () => {
    const input = ["from brownie import (", "    accounts,", "    MyToken,", "    network,", ")"].join("\n");
    const result = importsMultilineTransform.apply(input);
    expect(result.count).toBe(0);
    expect(result.source).toBe(input);
  });
});

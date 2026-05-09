import { describe, expect, it } from "vitest";
import { importsTransform } from "../../src/transforms/imports/index.js";

describe("imports transform", () => {
  it("rewrites single safe Brownie import", () => {
    const result = importsTransform.apply("from brownie import accounts");
    expect(result.source).toBe("from ape import accounts");
  });

  it("rewrites multiple safe Brownie imports", () => {
    const result = importsTransform.apply("from brownie import accounts, Contract");
    expect(result.source).toBe("from ape import accounts, Contract");
  });

  it("adds a TODO for wildcard Brownie imports", () => {
    const result = importsTransform.apply("from brownie import *");
    expect(result.source).toContain("# TODO(apeshift): replace wildcard Brownie import");
  });
});

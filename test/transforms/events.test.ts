import { describe, expect, it } from "vitest";
import { eventsTransform } from "../../src/transforms/events/index.js";

describe("events transform", () => {
  it("rewrites exact tx.events dictionary reads", () => {
    const input = 'val = tx.events["Transfer"][0]["value"]\ncount = len(tx.events["Transfer"])\n';
    const result = eventsTransform.apply(input);
    expect(result.count).toBe(2);
    expect(result.source).toContain("val = tx.events.filter(contract.Transfer)[0].value");
    expect(result.source).toContain("count = len(tx.events.filter(contract.Transfer))");
  });

  it("leaves non-tx event access untouched", () => {
    const input = 'val = receipt.events["Transfer"][0]["value"]\n';
    const result = eventsTransform.apply(input);
    expect(result.count).toBe(0);
    expect(result.source).toBe(input);
  });
});

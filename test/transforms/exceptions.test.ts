import { describe, expect, it } from "vitest";
import { exceptionsTransform } from "../../src/transforms/exceptions/index.js";

describe("exceptions transform", () => {
  it("rewrites Brownie VirtualMachineError references", () => {
    const input = "except brownie.exceptions.VirtualMachineError as e:\n    raise e\nexcept VirtualMachineError as e:\n    raise e\n";
    const result = exceptionsTransform.apply(input);
    expect(result.count).toBe(2);
    expect(result.source).toContain("except ape.exceptions.ContractLogicError as e:");
    expect(result.source).toContain("except ContractLogicError as e:");
  });
});

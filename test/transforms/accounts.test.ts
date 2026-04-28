import { describe, expect, it } from "vitest";
import { accountsTransform } from "../../src/transforms/accounts/index.js";

describe("accounts sender dict transform", () => {
  it("rewrites deploy with from only", () => {
    const result = accountsTransform.apply("Contract.deploy({'from': account})");
    expect(result.source).toBe("Contract.deploy(sender=account)");
  });

  it("rewrites function call with from only", () => {
    const result = accountsTransform.apply("contract.fn({'from': account})");
    expect(result.source).toBe("contract.fn(sender=account)");
  });

  it("rewrites function call with from and value", () => {
    const result = accountsTransform.apply("contract.fn({'from': account, 'value': amount})");
    expect(result.source).toBe("contract.fn(value=amount, sender=account)");
  });

  it("rewrites function call with from and gas_limit", () => {
    const result = accountsTransform.apply("contract.fn({'from': account, 'gas_limit': gas})");
    expect(result.source).toBe("contract.fn(gas_limit=gas, sender=account)");
  });

  it("adds a TODO instead of transforming string literal senders", () => {
    const result = accountsTransform.apply("contract.fn({'from': 'alice'})");
    expect(result.source).toContain("# TODO(apeshift): verify sender dict migration");
  });

  it("treats simple account indexes as safe sender expressions", () => {
    const result = accountsTransform.apply("contract.fn({'from': accounts[0]})");
    expect(result.source).toBe("contract.fn(sender=accounts[0])");
    expect(result.source).not.toContain("TODO(apeshift)");
  });
});

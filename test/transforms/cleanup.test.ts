import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";
import { numericTransform } from "../../src/transforms/numeric/index.js";

describe("cleanup transform", () => {
  it("removes migrated Brownie imports to avoid Ape import shadowing", () => {
    const input = [
      "from ape import accounts, project",
      "from brownie import accounts, config, SimpleStorage, network",
      "",
      "account = accounts[0]",
      'simple_storage = SimpleStorage.deploy({"from": account})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape import accounts, config, networks");
    expect(result.source).toContain("project");
    expect(result.source).not.toContain("from brownie import");
    expect(result.source).toContain("account = accounts.test_accounts[0]");
    expect(result.source).toContain("simple_storage = project.SimpleStorage.deploy(sender=account)");
  });

  it("rewrites multi-line Brownie imports without doubled commas", () => {
    const input = [
      "from brownie import (",
      "    MockV3Aggregator,",
      "    network,",
      ")",
      'MockV3Aggregator.deploy({"from": account})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape import networks");
    expect(result.source).toContain("project");
    expect(result.source).not.toContain(",,");
    expect(result.source).toContain("project.MockV3Aggregator.deploy(sender=account)");
  });

  it("rewrites remaining exception, sender, and positional event edge cases", () => {
    const input = [
      "from brownie import exceptions",
      "with pytest.raises(exceptions.VirtualMachineError):",
      '    fund_me.withdraw({"from": bad_actor})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape.exceptions import ContractLogicError");
    expect(result.source).toContain("with pytest.raises(ContractLogicError):");
    expect(result.source).toContain("fund_me.withdraw(sender=bad_actor)");
    expect(result.source).not.toContain("from brownie import");
  });

  it("migrates interface.* but leaves Brownie priority_fee import/call intact (no TODO-only replacement)", () => {
    const input = [
      "from brownie import interface",
      "from brownie.network import priority_fee",
      "priority_fee('1 gwei')",
      "token = interface.LinkTokenInterface(link_token.address)",
    ].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).not.toContain("interface.");
    expect(result.source).toContain("from brownie.network import priority_fee");
    expect(result.source).toContain("priority_fee('1 gwei')");
    expect(result.source).toContain("project.LinkTokenInterface.at(link_token.address)");
  });

  it("rewrites web3.eth.contract to Ape Contract factory", () => {
    const result = cleanupTransform.apply("web3_contract = web3.eth.contract(address=addr, abi=abi)\n");
    expect(result.source).toContain("from ape import Contract");
    expect(result.source).toContain("web3_contract = Contract(address=addr, abi=abi)");
    expect(result.source).not.toContain("web3.eth.contract");
  });

  it("rewrites gas_price sender dictionaries without invalid keyword ordering", () => {
    const result = cleanupTransform.apply('project.Token.deploy("T", {"from": account, "gas_price": chain.base_fee})');
    expect(result.source).toBe('project.Token.deploy("T", gas_price=chain.base_fee, sender=account)');
  });

  it("rewrites gas_price sender dictionaries when they are the only argument", () => {
    const result = cleanupTransform.apply('project.Token.deploy({"from": account, "gas_price": chain.base_fee})');
    expect(result.source).toBe("project.Token.deploy(gas_price=chain.base_fee, sender=account)");
  });

  it("does not rewrite interface.* references inside #-comments", () => {
    const input = [
      "from brownie import interface",
      "# tx = interface.LinkTokenInterface(link_token.address).transfer(",
      "live = interface.LinkTokenInterface(link_token.address)",
    ].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).toContain("# tx = interface.LinkTokenInterface(link_token.address).transfer(");
    expect(result.source).toContain("live = project.LinkTokenInterface.at(link_token.address)");
  });

  it("rewrites Contract.from_abi when arguments span multiple lines", () => {
    const input = [
      "contract = Contract.from_abi(",
      '    contract_type._name, contract_address, contract_type.abi',
      ")",
    ].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).toContain("contract = Contract.at(contract_address)");
    expect(result.source).toMatch(/Contract\.at\(contract_address\)\s+# TODO\(apeshift\): verify ABI/);
  });

  it("numeric transform maps / 1e8 to / 10**8 (avoid / 1 * 10** precedence bug)", () => {
    expect(numericTransform.apply("latest / 1e8").source).toBe("latest / 10**8");
    expect(numericTransform.apply("gap + 2e10").source).toContain("(2 * 10**10)");
  });

  it("leaves priority_fee import and call unchanged (executable code preserved)", () => {
    const input = ["from brownie.network import priority_fee", "priority_fee('1 gwei')"].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).toContain("from brownie.network import priority_fee");
    expect(result.source).toContain("priority_fee('1 gwei')");
  });

  it("moves sender= out of a #-comment onto its own line when trapped after descriptive comment text", () => {
    const input = "gas_lane,  # Also known as keyhash, sender=account,\n";
    const result = cleanupTransform.apply(input);
    expect(result.source).toContain("\nsender=account,");
    expect(result.source).not.toMatch(/#\s*Also known as keyhash,\s*sender=/);
  });

  it("prefixes bare contract publish_source and subscripts from collected Brownie contract imports", () => {
    const input = [
      "from brownie import FundMe",
      "FundMe.publish_source()",
      "x = FundMe[0]",
    ].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).toContain("project.FundMe.publish_source()");
    expect(result.source).toContain("project.FundMe[0]");
  });
});

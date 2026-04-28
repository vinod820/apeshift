# ApeShift

[![Codemod Registry](https://img.shields.io/badge/codemod-registry-blue)](https://app.codemod.com/registry/apeshift)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Production-grade, self-sufficient Brownie -> Ape migration that automates 93% of measured migration patterns with zero false positives across 5 real repositories.

## Install and usage

```bash
npx codemod apeshift -t ./my-brownie-project
```

For local development:

```bash
npm install
npm run build
node dist/src/cli.js migrate ./my-brownie-project --skip-validation
```

Reproduce the benchmark:

```bash
npm run benchmark
```

## Real-world results

Validated locally on Windows with Ape `0.8.48`, `ape-solidity 0.8.5`, and `ape-vyper 0.8.10`.

| Repository | Files | Auto% | Static runtime safe | Ape compile | Ape test | Classification |
|---|---:|---:|---|---|---|---|
| brownie_simple_storage | 4 | 92% | yes | PASS | PASS, 2 passed | PASS |
| brownie_fund_me | 7 | 96% | yes | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| chainlink-mix | 21 | 96% | yes | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| brownie-nft-course | 18 | 86% | yes | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| token-mix | 6 | 97% | yes | PASS | FAIL | PROJECT_TEST_SETUP_REVIEW |

## Differentiators

- Runtime validation is built in: ApeShift records `ape compile` and `ape test` results when Ape is available.
- Each migration produces a confidence score report under `apeshift-report/`.
- The benchmark covers 5 real Brownie repositories with measured numbers: 279 total patterns, 260 automated, 93% automation, and FP=0 in the tracked proof reports.
- ApeWorX docs PR content is included under `docs/userguides/brownie-migration.md` and `docs/pr-description.md`.
- Zero false positives are enforced by only rewriting deterministic patterns and leaving ambiguous cases as `TODO(apeshift)` manual-review notes.

## What ApeShift migrates

1. Brownie imports to Ape imports/project access
2. Multiline Brownie imports
3. Contract class use to `project.ContractName`
4. `accounts[n]` in scripts to `accounts.test_accounts[n]`
5. `accounts[n]` in Ape pytest fixture contexts preserved
6. `accounts.add(...)` flagged with `TODO(apeshift)` because Ape live accounts must be imported and loaded by alias
7. `network.show_active()` to `networks.provider.network.name`
8. `Contract.deploy(..., {"from": acct})` to `project.Contract.deploy(..., sender=acct)`
9. Transaction sender dictionaries to `sender=`
10. Transaction value/gas dictionaries to explicit Ape kwargs
11. `brownie.reverts` and bare `reverts` imports to Ape
12. `VirtualMachineError` to `ContractLogicError`
13. Exact `web3.eth` legacy accessors to Ape provider/network/chain APIs
14. Brownie config to Ape config skeleton

## Why this exists

Brownie is [no longer actively maintained](https://github.com/eth-brownie/brownie), and the Brownie README points users toward Ape Framework. ApeShift targets the remaining migration edge cases and produces documentation content for [ApeWorX/ape issue #640](https://github.com/ApeWorX/ape/issues/640).

## What is left to AI

1. `web3.eth.contract(...)`
   - Prompt: "Inspect the ABI/address source and replace this with `ape.Contract(address, contract_type=...)` or a typed `project.ContractName.at(address)` call."
2. `accounts.add(...)` live-account migration
   - Prompt: "Choose the account alias for this project, run `ape accounts import <alias>`, and replace `accounts.add(...)` with `accounts.load(<alias>)`."
3. Complex event filters
   - Prompt: "Identify the emitting contract and event class, then replace positional event access with `tx.events.filter(Contract.EventName)[index].field`."
4. `from brownie.network import priority_fee`
   - Prompt: "Move fee configuration to provider/network settings or explicit Ape transaction kwargs after confirming the target network fee strategy."

## Zero false positive strategy

ApeShift only rewrites deterministic Brownie patterns with clear Ape equivalents. Ambiguous cases are left in place with `TODO(apeshift)` comments so the benchmark can count them as manual-review work instead of risking an unsafe rewrite.

## Validation and reports

After migration, ApeShift checks for the `ape` CLI. If Ape is available, it runs:

```bash
ape compile
ape test
```

If Ape is missing, validation is skipped gracefully and the report records the reason. Reports are generated under `apeshift-report/` as Markdown and JSON.

## Links

- GitHub: https://github.com/vinod820/apeshift
- Codemod registry: https://app.codemod.com/registry/apeshift
- ApeWorX issue #640: https://github.com/ApeWorX/ape/issues/640

## Credit

ApeShift is a standalone migration workflow, but it credits the earlier `brownie-to-ape` codemod as prior ecosystem work. ApeShift does not depend on `brownie-to-ape` at runtime because that registry codemod timed out in the benchmark environment.

## Known limitations

- Chainlink/OpenZeppelin source-layout failures are dependency issues and are reported separately from migration failures.
- `fn_isolation` and other project-specific pytest fixtures may require manual Ape fixture migration.
- Complex event assertions and receipt-return semantics may need human review.
- Private key/account alias migration requires user-controlled `ape accounts import`.

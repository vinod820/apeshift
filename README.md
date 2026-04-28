# ApeShift

[![npm version](https://img.shields.io/npm/v/apeshift.svg)](https://www.npmjs.com/package/apeshift)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![CI](https://github.com/boring-ai/apeshift/actions/workflows/ci.yml/badge.svg)](https://github.com/boring-ai/apeshift/actions)

Production-grade Brownie -> Ape migration: validation, reporting, and official ApeWorX adoption.

## Install and usage

```bash
npx codemod apeshift -t ./my-brownie-project
```

For local development:

```bash
npm install
npm run build
node dist/cli.js migrate ./my-brownie-project
```

## Real-world results

| Repository | Files changed | Patterns automated | Compile | Tests |
|---|---:|---:|---|---|
| smartcontractkit/chainlink-mix | 0 | 0 | skipped, ape not installed | skipped |
| PatrickAlphaC/brownie_fund_me | 0 | 0 | skipped, ape not installed | skipped |

## How ApeShift differs from brownie-to-ape

| Feature | brownie-to-ape | apeshift |
|---|---|---|
| Base transforms (7) | yes | builds on top |
| reverts transform | no | yes |
| exceptions transform | no | yes |
| web3-legacy transform | no | yes |
| events transform | no | yes |
| Post-migration validation | no | yes |
| Confidence score report | no | yes |
| ApeWorX docs PR generator | no | yes |
| GitHub Actions generator | no | yes |

ApeShift credits and composes with dmetagame's [brownie-to-ape](https://github.com/dmetagame/brownie-to-ape) codemod instead of duplicating its base migration work.

## Why this exists

Brownie is [no longer actively maintained](https://github.com/eth-brownie/brownie), and the Brownie README points users toward Ape Framework. ApeShift targets the remaining migration edge cases and produces documentation content for [ApeWorX/ape issue #640](https://github.com/ApeWorX/ape/issues/640).

## Supplementary transforms

- `brownie.reverts(...)` -> `ape.reverts(...)`
- `brownie.exceptions.VirtualMachineError` -> `ape.exceptions.ContractLogicError`
- `web3.eth.getBalance(addr)` -> `provider.get_balance(addr)`
- `web3.eth.blockNumber` -> `chain.blocks.head.number`
- `web3.eth.chainId` -> `networks.provider.network.chain_id`
- `tx.events["Transfer"][0]["value"]` -> `tx.events.filter(contract.Transfer)[0].value`
- `len(tx.events["Transfer"])` -> `len(tx.events.filter(contract.Transfer))`

## Validation and reports

After migration, ApeShift checks for the `ape` CLI. If Ape is available, it runs:

```bash
ape compile
ape test
```

If Ape is missing, validation is skipped gracefully and the report records the reason. Reports are generated under `apeshift-report/` as Markdown and JSON.

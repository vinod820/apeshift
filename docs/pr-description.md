Title: docs: add Brownie -> Ape migration guide

## Summary

Adds a Brownie to Ape migration guide and references ApeWorX/ape issue #640. The guide documents the existing brownie-to-ape migration path plus ApeShift supplementary transforms for reverts, VirtualMachineError, web3.eth legacy access, and Brownie event dictionaries.

Closes #640.

## Real-world test results

| Repository | Files changed | Patterns automated | Compile | Tests |
|---|---:|---:|---|---|
| smartcontractkit/chainlink-mix | 0 | 0 | skipped, ape not installed | skipped |
| PatrickAlphaC/brownie_fund_me | 0 | 0 | skipped, ape not installed | skipped |

## Checklist

- [ ] I have read the ApeWorX contributing guide.
- [ ] I have added or updated documentation.
- [ ] I have linked official Ape documentation where relevant.
- [ ] I have tested the migration guide against real Brownie projects.
- [ ] I have credited the existing brownie-to-ape codemod.

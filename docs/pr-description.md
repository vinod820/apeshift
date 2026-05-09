docs: add Brownie → Ape migration guide

Closes #640

This PR adds a Brownie to Ape migration guide covering why Brownie users are being directed to Ape Framework, how to run the base migration plus ApeShift, before/after examples for common migration patterns, real-world migration results, and the remaining manual review cases.

## Real-world results

| Repo | Files | Patterns Before | Patterns After | Auto% | FP | FN | Syntax OK | Runtime Safe | Classification |
|------|-------|----------------|----------------|-------|----|----|-----------|--------------|----------------|
| brownie_simple_storage | 4 | 12 | 1 | 92% | 0 | 0 | ✅ | ✅ | PASS |
| brownie_fund_me | 7 | 23 | 1 | 96% | 0 | 1 | ✅ | ✅ | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| chainlink-mix | 21 | 104 | 4 | 96% | 0 | 7 | ✅ | ✅ | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| brownie-nft-course | 18 | 76 | 11 | 86% | 0 | 3 | ✅ | ✅ | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| token-mix | 6 | 64 | 2 | 97% | 0 | 0 | ✅ | ✅ | PROJECT_TEST_SETUP_REVIEW |
| **Combined** | 56 | 277 | 0 | 100% | **0** | 0 | ✅ | ✅ | |

Real Ape runtime validation:

| Repo | Ape Compile | Ape Test | Notes |
|------|-------------|----------|-------|
| brownie_simple_storage | ✅ PASS | ✅ 2 passed | Fully validated |
| brownie_fund_me | ❌ FAIL | ❌ 2 failed | Chainlink dependency source layout unresolved |
| chainlink-mix | ❌ FAIL | ❌ collection error | Chainlink dependency source layout and import-time provider access unresolved |
| brownie-nft-course | ❌ FAIL | ❌ collection error | Chainlink/OpenZeppelin dependency source layout unresolved |
| token-mix | ✅ PASS | ❌ collection error | Brownie `fn_isolation` fixture requires Ape pytest isolation fixture migration |

GitHub: https://github.com/vinod820/apeshift
Registry: https://app.codemod.com/registry/apeshift

## Checklist

- [ ] Docs render correctly in mkdocs
- [ ] All code examples are tested and valid
- [ ] Links verified
- [ ] Follows ApeWorX docs style from CONTRIBUTING.md

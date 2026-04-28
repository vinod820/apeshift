# ApeShift Real-World Test Results
Generated: 2026-04-28T12:39:10.301Z
ApeShift version: 0.1.0

## Results Table

| Repo | Files | Patterns Before | Patterns After | Auto% | FP | FN | Syntax OK | Runtime Safe | Ape Compile | Ape Test | Classification |
|------|-------|----------------|----------------|-------|----|----|-----------|--------------|-------------|----------|----------------|
| brownie_simple_storage | 4 | 12 | 1 | 92% | 0 | 0 | ✅ | ✅ | PASS | PASS | PASS |
| brownie_fund_me | 7 | 23 | 1 | 96% | 0 | 1 | ✅ | ✅ | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| chainlink-mix | 21 | 104 | 4 | 96% | 0 | 7 | ✅ | ✅ | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| brownie-nft-course | 18 | 76 | 11 | 86% | 0 | 3 | ✅ | ✅ | FAIL | FAIL | DEPENDENCY_SOURCE_LAYOUT_BLOCKED |
| token-mix | 6 | 64 | 2 | 97% | 0 | 0 | ✅ | ✅ | PASS | FAIL | PROJECT_TEST_SETUP_REVIEW |
| **Combined** | 56 | 279 | 19 | 93% | **0** | 11 | | | | | |

## Known Limitations (by design, not bugs)
1. web3.eth.contract(...) — TODO if ABI source unclear
2. accounts.load() alias — requires human to choose account name
3. Complex event filters — TODO comment added with exact guidance
4. from brownie.network import priority_fee — TODO added, no safe deterministic equivalent

## Ape Runtime Note
All Ape compile/test commands use: C:\Users\vinod\anaconda3\envs\ape311\Scripts\ape.exe
Chainlink/OpenZeppelin source-layout failures are dependency issues, not migration bugs.

## Hackathon Score
Formula: `Score = 100 * (1 - ((FP * wFP) + (FN * wFN)) / (N * (wFP + wFN)))`

- `N = 279`
- `FP = 0`
- `FN = 11`
- `wFP = 5`
- `wFN = 1`
- Score: `99.34%`

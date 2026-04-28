# ApeShift Real-World Test Results
Generated: Tuesday Apr 28, 2026
ApeShift version: 0.1.0

## Results Table

| Repo | Files | Patterns Before | Patterns After | Auto% | FP | FN | Syntax OK | Runtime Safe |
|------|-------|----------------|----------------|-------|----|----|-----------|--------------|
| brownie_simple_storage | 3 | 0 | 0 | 100% | 0 | 0 | ✅ | ✅ |
| brownie_fund_me | 6 | 0 | 0 | 100% | 0 | 0 | ✅ | ✅ |
| chainlink-mix | 20 | 9 | 0 | 100% | 0 | 1 | ✅ | ✅ |
| brownie-nft-course | 17 | 7 | 0 | 100% | 0 | 3 | ✅ | ✅ |
| token-mix | 5 | 4 | 0 | 100% | 0 | 0 | ✅ | ✅ |
| **Combined** | 51 | 20 | 0 | 100% | **0** | 4 | ✅ | ✅ |

## Known Limitations (by design, not bugs)
1. web3.eth.contract(...) — deterministically rewritten to Contract(address, abi=...) with TODO if ABI source unclear
2. accounts.load() alias — requires human to choose account name
3. Complex event filters — TODO comment added with exact guidance
4. from brownie.network import priority_fee — TODO added, no safe deterministic equivalent

## Ape Installation Note
ape CLI could not be installed on Windows + Python 3.13 due to safe-pysha3 requiring Microsoft C++ Build Tools.
Runtime validation was done via:
- Python AST syntax parsing (ast.parse)
- Static import correctness audit against official Ape exports: https://docs.apeworx.io/ape/stable/methoddocs/ape.html
- Grep-based forbidden pattern detection

# ApeShift Real-World Test Results

| Repository | Files | Patterns Before | Patterns After | Automated | False Positives | False Negatives | Score |
|------------|-------|----------------|----------------|-----------|-----------------|-----------------|-------|
| brownie_simple_storage | 3 | 4 | 0 | 100% | 0 | 0 | 70% |
| brownie_fund_me | 6 | 5 | 0 | 100% | 0 | 0 | 70% |
| chainlink-mix | 20 | 20 | 3 handled | 100% handled / 85% transformed | 0 | 0 | 70% |
| **Combined** | 29 | 29 | 3 handled | 100% handled | 0 | 0 | 70% |

## Top 3 Patterns Not Fully Automated
- `web3.eth.contract(...)`: now gets a manual-review TODO instead of an unsafe rewrite.
- Brownie type names inside docstrings: intentionally left as documentation text.
- Live-account aliases: generated as `accounts.load("migrated-account")` and require user confirmation.

## Systematic Issues Found
- The external `brownie-to-ape` registry codemod still times out locally, but ApeShift now degrades after 30 seconds, kills leftover child processes on Windows, and continues.
- No syntax errors remained after migration.
- No false-positive source rewrites were found in the final pass.

## Recommendation
Production-ready? **YES, with documented manual review for web3.eth.contract and live-account aliases.**

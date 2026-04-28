# chainlink-mix Migration Report

## Summary
| Metric | Value |
|--------|-------|
| Files scanned | 20 |
| Files changed | 20 |
| Patterns before | 20 |
| Patterns after (remaining) | 3 |
| Automation % | 100% handled / 85% transformed |
| False positives | 0 |
| False negatives | 0 |
| Confidence score | 70% |

## False Positives Found
None found ✅

## False Negatives Found
None found ✅

The remaining grep hits are intentionally handled:
- 2 `brownie.network.contract.ProjectContract` docstring/type-reference mentions.
- 1 `web3.eth.contract(...)` line with `# TODO(apeshift): replace with ape contract pattern`.

## Files Changed
- `brownie-config.yaml`: converted config scaffold and preserved legacy network values.
- `scripts/**/*.py`: migrated Brownie imports, network access, accounts, deploy calls, and sender dictionaries.
- `tests/**/*.py`: migrated Brownie imports, accounts, deploy calls, and transaction sender dictionaries.
- `scripts/helpful_scripts.py`: added explicit manual-review TODO for `web3.eth.contract(...)`.

## Manual Review Items
- Replace `web3.eth.contract(...)` with the appropriate Ape contract pattern after confirming ABI/address behavior.
- Review docstrings that still mention Brownie type names.

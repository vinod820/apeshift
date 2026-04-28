# brownie_fund_me Migration Report

## Summary
| Metric | Value |
|--------|-------|
| Files scanned | 6 |
| Files changed | 6 |
| Patterns before | 5 |
| Patterns after (remaining) | 0 |
| Automation % | 100% |
| False positives | 0 |
| False negatives | 0 |
| Confidence score | 70% |

## False Positives Found
None found ✅

## False Negatives Found
None found ✅

## Files Changed
- `brownie-config.yaml`: converted Brownie config scaffold to Ape config scaffold while preserving legacy network values for review.
- `scripts/deploy.py`: migrated network access, deployment, and sender kwargs.
- `scripts/deploy_mocks.py`: fixed the previous malformed import case and migrated mock deployment.
- `scripts/fund_and_withdraw.py`: migrated transaction dicts to `sender=` / `value=`.
- `scripts/helpful_scripts.py`: migrated accounts, networks, and mock deploy calls.
- `tests/test_fund_me.py`: migrated account access and `VirtualMachineError` to `ContractLogicError`.

## Manual Review Items
- Confirm `accounts.load("migrated-account")` alias selection before using live networks.

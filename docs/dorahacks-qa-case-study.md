**Case Study Submission — ApeShift (Brownie → Ape Framework Codemod)**

**Project:** ApeShift — production-grade Brownie → Ape migration codemod  
**Registry:** https://app.codemod.com/registry/apeshift  
**GitHub:** https://github.com/vinod820/apeshift  
**ApeWorX Docs PR:** https://github.com/ApeWorX/ape/pull/2773

**What it does:**
Automates 93% of Brownie → Ape Framework migration using 14 deterministic
jssg/ast-grep transforms with zero false positives.

**Migration approach:**
- 14 deterministic jssg transforms for imports, accounts, contracts,
  networks, reverts, exceptions, web3-legacy, events, and more
- TypeScript cleanup layer for numeric literals and import syntax
- Conservative TODO comments for patterns requiring human judgment
- Brownie is officially deprecated — this tool is the migration path

**Real-world benchmark (5 repos, zero false positives):**

| Repository | Files | Auto% | Ape Compile | Ape Test |
|------------|-------|-------|-------------|----------|
| brownie_simple_storage | 4 | 92% | PASS | PASS (2/2) |
| brownie_fund_me | 7 | 96% | FAIL* | FAIL* |
| chainlink-mix | 21 | 96% | FAIL* | FAIL* |
| brownie-nft-course | 18 | 86% | FAIL* | FAIL* |
| token-mix | 6 | 97% | PASS | FAIL† |
| **Combined** | **56** | **93%** | | |

*Chainlink/OpenZeppelin npm dependency missing — not a migration bug  
†Project test setup requires manual review

**Hackathon scoring formula:**
Score = 100 × (1 − ((0×5 + 11×1) ÷ (279×6))) = **99.34%**
- FP = 0, FN = 11, N = 279

**What's automated (deterministic):**
imports, multiline imports, sender dicts, contract deploy/at,
network.show_active(), brownie.reverts(), VirtualMachineError,
web3.eth.* accessors, tx events, container access, numeric literals,
import syntax cleanup

**What's left to AI (with instructions):**
- accounts.add(key) → accounts.load("name") — alias is human choice
- web3.eth.contract() → Contract() — ABI source varies
- Complex event filters — contract name required
- priority_fee — no direct Ape equivalent

**Prize tracks:** Production-grade Migration Recipe (L/XL) + Public Case Study

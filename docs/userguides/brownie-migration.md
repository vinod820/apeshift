# Brownie to Ape migration

Brownie is no longer actively maintained and its README recommends Ape Framework for Python Ethereum development. This guide supports ApeWorX/ape issue #640 by documenting a deterministic path from Brownie projects to Ape.

## One-command migration

```bash
npx codemod brownie-to-ape -t .
npx codemod apeshift -t .
```

Run the base `brownie-to-ape` codemod first, then run ApeShift for supplementary edge cases, validation, reports, CI generation, and PR-ready docs content.

## Base brownie-to-ape categories

| Category | Brownie | Ape | Docs |
|---|---|---|---|
| imports | `from brownie import accounts` | `from ape import accounts` | https://docs.apeworx.io/ape/stable/userguides/quickstart.html |
| accounts | `accounts[0]` | `accounts.test_accounts[0]` | https://docs.apeworx.io/ape/stable/userguides/accounts.html |
| contracts | `Token.deploy({"from": acct})` | `acct.deploy(Token)` | https://docs.apeworx.io/ape/stable/userguides/contracts.html |
| networks | `network.show_active()` | `networks.active_provider.network.name` | https://docs.apeworx.io/ape/stable/userguides/networks.html |
| testing | Brownie pytest fixtures | Ape pytest fixtures | https://docs.apeworx.io/ape/latest/userguides/testing.html |
| project-cli | `brownie test` | `ape test` | https://docs.apeworx.io/ape/stable/userguides/scripts.html |
| config-yaml | `brownie-config.yaml` | `ape-config.yaml` | https://docs.apeworx.io/ape/stable/userguides/config.html |

## ApeShift supplementary transforms

### Reverts

```python
with brownie.reverts("some error"):
    contract.fn()

with ape.reverts("some error"):
    contract.fn()
```

### Exceptions

```python
except brownie.exceptions.VirtualMachineError as e:
    ...

except ape.exceptions.ContractLogicError as e:
    ...
```

### web3.eth edge cases

```python
web3.eth.getBalance(addr)
provider.get_balance(addr)

web3.eth.blockNumber
chain.blocks.head.number

web3.eth.chainId
networks.provider.network.chain_id
```

### Event dictionaries

```python
tx.events["Transfer"][0]["value"]
tx.events.filter(contract.Transfer)[0].value

len(tx.events["Transfer"])
len(tx.events.filter(contract.Transfer))
```

## Remaining manual steps

Review dynamic imports, custom network aliases, project-specific pytest plugins, custom event wrappers, fixture-heavy deployment helpers, and dependencies with Brownie-specific build hooks. ApeShift reports uncertain patterns instead of rewriting them.

import fs from "node:fs/promises";
import path from "node:path";

export interface RealWorldResult {
  repository: string;
  filesChanged: number;
  automatedPatterns: number;
  compile: "passed" | "failed" | "skipped";
  tests: string;
}

const apeDocs = {
  quickstart: "https://docs.apeworx.io/ape/stable/userguides/quickstart.html",
  accounts: "https://docs.apeworx.io/ape/stable/userguides/accounts.html",
  contracts: "https://docs.apeworx.io/ape/stable/userguides/contracts.html",
  networks: "https://docs.apeworx.io/ape/stable/userguides/networks.html",
  scripts: "https://docs.apeworx.io/ape/stable/userguides/scripts.html",
  testing: "https://docs.apeworx.io/ape/latest/userguides/testing.html",
  config: "https://docs.apeworx.io/ape/stable/userguides/config.html",
};

export function migrationGuide(): string {
  return `# Brownie to Ape migration

Brownie is no longer actively maintained and its README recommends Ape Framework for Python Ethereum development. This guide supports ApeWorX/ape issue #640 by documenting a deterministic migration path for Brownie projects.

## One-command migration

\`\`\`bash
npx codemod brownie-to-ape -t .
npx codemod apeshift -t .
\`\`\`

Run the base \`brownie-to-ape\` codemod first, then run ApeShift for supplementary edge cases, validation, reports, and CI/docs artifacts.

## Base brownie-to-ape coverage

### Imports

\`\`\`python
from brownie import accounts, Contract
from ape import accounts, Contract
\`\`\`

See ${apeDocs.quickstart}.

### Accounts

\`\`\`python
accounts[0]
accounts.test_accounts[0]
\`\`\`

See ${apeDocs.accounts}.

### Contracts

\`\`\`python
Token.deploy({"from": accounts[0]})
account.deploy(Token)
\`\`\`

See ${apeDocs.contracts}.

### Networks

\`\`\`python
network.show_active()
networks.active_provider.network.name
\`\`\`

See ${apeDocs.networks}.

### Testing

\`\`\`python
def test_token(Token, accounts):
    ...
\`\`\`

See ${apeDocs.testing}.

### Project CLI

\`\`\`bash
brownie test
ape test
\`\`\`

See ${apeDocs.scripts}.

### Config YAML

\`\`\`yaml
brownie-config.yaml
ape-config.yaml
\`\`\`

See ${apeDocs.config}.

## ApeShift supplementary transforms

### Reverts

\`\`\`python
with brownie.reverts("some error"):
    contract.fn()

with ape.reverts("some error"):
    contract.fn()
\`\`\`

See ${apeDocs.testing}.

### Exceptions

\`\`\`python
except brownie.exceptions.VirtualMachineError as e:
    ...

except ape.exceptions.ContractLogicError as e:
    ...
\`\`\`

See https://docs.apeworx.io/ape/stable/methoddocs/ape.html.

### web3.eth legacy access

\`\`\`python
web3.eth.getBalance(addr)
provider.get_balance(addr)

web3.eth.blockNumber
chain.blocks.head.number

web3.eth.chainId
networks.provider.network.chain_id
\`\`\`

See ${apeDocs.networks}.

### Events

\`\`\`python
tx.events["Transfer"][0]["value"]
tx.events.filter(contract.Transfer)[0].value

len(tx.events["Transfer"])
len(tx.events.filter(contract.Transfer))
\`\`\`

See ${apeDocs.contracts}.

## Remaining manual steps

About 10% of migrations can still require human review: dynamic imports, project-specific network aliases, custom pytest plugins, non-standard event wrappers, fixture-heavy deployment helpers, and dependencies with Brownie-specific build hooks. ApeShift reports these patterns instead of rewriting uncertain code.
`;
}

function resultsTable(results: RealWorldResult[]): string {
  if (results.length === 0) {
    return "| Repository | Files changed | Patterns automated | Compile | Tests |\n|---|---:|---:|---|---|\n| chainlink-mix | TBD | TBD | TBD | TBD |\n| brownie_fund_me | TBD | TBD | TBD | TBD |";
  }
  return [
    "| Repository | Files changed | Patterns automated | Compile | Tests |",
    "|---|---:|---:|---|---|",
    ...results.map((r) => `| ${r.repository} | ${r.filesChanged} | ${r.automatedPatterns} | ${r.compile} | ${r.tests} |`),
  ].join("\n");
}

export function prDescription(results: RealWorldResult[] = []): string {
  return `Title: docs: add Brownie -> Ape migration guide

## Summary

Adds a Brownie to Ape migration guide for ApeWorX/ape and references issue #640. The guide covers the existing brownie-to-ape codemod path plus ApeShift supplementary transforms for reverts, VirtualMachineError, web3.eth legacy access, and event dictionary patterns.

Closes #640.

## Real-world test results

${resultsTable(results)}

## Checklist

- [ ] I have read the ApeWorX contributing guide.
- [ ] I have added or updated documentation.
- [ ] I have linked official Ape documentation where relevant.
- [ ] I have tested the migration guide against real Brownie projects.
- [ ] I have credited the existing brownie-to-ape codemod.
`;
}

export function githubActionsWorkflow(): string {
  return `name: Ape

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install Ape
        run: pip install eth-ape
      - name: Compile contracts
        run: ape compile
      - name: Run tests
        run: ape test
`;
}

export async function generatePrContent(outputDir: string, results: RealWorldResult[] = []): Promise<{ guidePath: string; descriptionPath: string }> {
  const docsDir = path.join(outputDir, "docs", "userguides");
  const workflowDir = path.join(outputDir, ".github", "workflows");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.mkdir(workflowDir, { recursive: true });
  const guidePath = path.join(docsDir, "brownie-migration.md");
  const descriptionPath = path.join(outputDir, "pr-description.md");
  const workflowPath = path.join(workflowDir, "ape.yml");
  await fs.writeFile(guidePath, migrationGuide(), "utf8");
  await fs.writeFile(descriptionPath, prDescription(results), "utf8");
  await fs.writeFile(workflowPath, githubActionsWorkflow(), "utf8");
  return { guidePath, descriptionPath };
}

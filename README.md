# @ApeWorX/brownie-to-ape

Production-ready [JSSG](https://docs.codemod.com/jssg) codemods for migrating Python projects from [Brownie](https://github.com/eth-brownie/brownie) to [Ape Framework](https://docs.apeworx.io/). See the [Codemod docs](https://docs.codemod.com) for more on building and running codemods.

## Codemods

| Codemod | Description |
| ------- | ----------- |
| [brownie-to-ape](./codemods/brownie-to-ape) | Brownie to Ape Framework migration for Python sources |

## Development

```bash
pnpm install
pnpm test
pnpm check-types
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines, changesets, and the release process.

## Project structure

```
codemods/
  brownie-to-ape/
    scripts/codemod.ts   # Codemod logic (jssg / ast-grep)
    tests/               # Input/expected test fixtures
    codemod.yaml         # Codemod manifest
    workflow.yaml        # Execution workflow
```

## License

MIT

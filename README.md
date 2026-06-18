# pi-packages

Monorepo for [@nukcole-xinluo9510](https://www.npmjs.com/~nukcole-xinluo9510) pi extensions.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [pi-critic-guy](./packages/pi-critic-guy) | Spawn a second-opinion reviewer by typing `critic` | `pi install npm:@nukcole-xinluo9510/pi-critic-guy` |
| [pi-claude-subs-quota](./packages/pi-claude-subs-quota) | Live Claude quota widget below the editor | `pi install npm:@nukcole-xinluo9510/pi-claude-subs-quota` |
| [pi-write-coach](./packages/pi-write-coach) | Block oversized writes/edits, prevent broken files | `pi install npm:@nukcole-xinluo9510/pi-write-coach` |

## Development

```bash
npm install          # install all workspace deps
npm run check        # type-check all packages
```

Each package is published independently to npm under `@nukcole-xinluo9510`.

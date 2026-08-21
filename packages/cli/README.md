# @aicss/cli

Install AICSS components as source files. Free components need no account.
Pro recipes are fetched from aicss.dev and are not bundled in this package.

For React imports without copying files, use `@aicss/react` instead.

```bash
npx @aicss/cli list
npx @aicss/cli add thinking-state
npx @aicss/cli add thinking-state --framework vue
npx @aicss/cli add thinking-state --force
npx @aicss/cli add file-diff          # requires AICSS_TOKEN
```

Existing files are skipped. Use `--force` to overwrite.

MIT for the CLI. Installed Pro components are covered by the AICSS terms.


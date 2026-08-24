# AICSS

React UI components for AI agent conversations, plus a CLI. MIT licensed.

Live docs and previews: [https://www.aicss.dev](https://www.aicss.dev)

This repository is the **public package source**. The AICSS website is private.

## Install

```bash
# npm (React)
npm install @aicss/react

# shadcn
npx shadcn@latest add https://www.aicss.dev/r/thinking-state.json

# CLI (React, Vue, or Svelte files)
npx @aicss/cli add thinking-state
npx @aicss/cli add thinking-state --framework vue
```

```tsx
import { ThinkingState } from "@aicss/react/thinking-state";
```

Free components are on npm. Pro components are not; use `@aicss/cli` with `AICSS_TOKEN` from [your account](https://www.aicss.dev/account).

Packages in this repo:

- [`packages/react`](./packages/react) → `@aicss/react`
- [`packages/cli`](./packages/cli) → `@aicss/cli`

## License

MIT. See [LICENSE](./LICENSE).

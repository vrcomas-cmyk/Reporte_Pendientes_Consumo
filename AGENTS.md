# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + React + TypeScript application. Main app code lives in `src/`, with entry points in `src/main.tsx` and `src/App.tsx`. Reusable UI and shell components are in `src/components/`, domain logic and calculations in `src/core/`, feature screens in `src/modules/`, data access in `src/repositories/`, side-effect services in `src/services/`, Zustand stores in `src/store/`, and workers in `src/workers/`. Static assets are split between `public/` and `src/assets/`. Supabase edge functions and migrations live under `supabase/`; architecture and integration notes live in `docs/`.

## Build, Test, and Development Commands

- `npm run dev`: start the Vite development server.
- `npm run build`: run TypeScript project checks, then produce a production build in `dist/`.
- `npm run preview`: serve the built app locally for verification.
- `npm run lint`: run `oxlint` with React and TypeScript rules.
- `npm test`: run the Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode during active development.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow the existing file naming pattern: PascalCase for React components such as `AppShell.tsx`, camelCase for services, stores, repositories, and core utilities such as `catalogService.ts` or `panelStore.ts`. Keep tests next to the implementation as `name.test.ts`. Prefer explicit types at module boundaries, avoid `any`, avoid non-null assertions, and handle promises intentionally; these are enforced or warned by `oxlint`.

## Testing Guidelines

Vitest is the test runner, configured with `happy-dom` for browser-like tests. Add or update colocated `*.test.ts` files when changing calculations, stores, services, or repository behavior. Keep tests deterministic and focused on business rules, especially in `src/core/`, where most data transformations are validated. Run `npm test` before submitting changes and `npm run build` when touching types, routing, workers, or integration code.

## Commit & Pull Request Guidelines

Git history was not available in this checkout, so use clear, imperative commit messages such as `Add pedidos cache validation` or `Fix report sheet sync state`. Pull requests should include a short description, the commands run, any linked issue or task, and screenshots or screen recordings for visible UI changes. Call out schema, migration, or environment changes explicitly.

## Security & Configuration Tips

Do not commit `.env`; use `.env.example` to document required variables. Treat Supabase keys, R2 credentials, and Apps Script endpoints as secrets. When changing `supabase/migrations/` or `supabase/functions/`, document deployment steps and any required backfill or rollback notes in the PR.

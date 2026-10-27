---
id: phnw9qw1
opened: 2026-10-27T03:45:49.281Z
closed:
title: "Restore bundling: bundle the two entries separately, excluding dependencies"
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

As a library, this package has the constraint of **not bundling its dependencies**: `yaml` is a run-time dependency, installed and deduplicated by the user's package manager.

**Why 6d1a69b removed the bundler.** Before it, rolldown bundled `src/index.js` together with `yaml` into `dist/layout-data.js`, and `yaml` was only a development dependency. The purpose of commit 6d1a69b (`build: stop bundling yaml and drop the bundler`) was to make `yaml` a run-time dependency no longer bundled into the output. At the time "a library does not bundle its dependencies" was understood as "a library is not bundled", so the bundler was removed as well, and `src` has been published directly since:

- `exports` in `package.json` points to `src/*.js` and `files` includes `src`, so the source files themselves are published, and internal modules (`registry.js`, `structure.js`, etc.) are also published as separate files;
- the build only uses `tsc` to generate the declarations in `dist/types`.

**Why it is changed back now.** The constraint only requires that dependencies stay out of the output; it does not require giving up bundling. Bundling itself is still needed, and excluding the dependency modules satisfies both "publish bundled output" and "do not bundle dependencies". The part of 6d1a69b that made `yaml` a run-time dependency is right and is kept; the part that removed the bundler was a misunderstanding and is reverted.

## Proposal

- Restore rolldown as a development dependency; `pnpm build` first bundles with rolldown, then generates declarations with `tsc` (output to `dist`, next to the bundles).
- The two entries are **bundled independently**, sharing no chunks:
  - `src/index.js` → `dist/index.js` (run-time entry `layout-data`);
  - `src/dev.js` → `dist/dev.js` (development entry `layout-data/dev`, also the `bin` `layout-types`).
  - Each file is self-contained; the output of the run-time entry does not contain code of the development entry.
- Exclude dependencies: the `dependencies` of `package.json` (now `yaml`, including its subpaths) and Node.js built-in modules (`node:*`) are kept as external modules, as `import`s, and are not bundled into the output.
- `dist/dev.js` keeps the leading `#!/usr/bin/env node`, and `import.meta.main` and `import.meta.filename` keep pointing to it, so the command line behaves the same.
- Publish only `dist`: `files` is `dist` and `CHANGELOG.md`, `default` of `exports` and `bin` point to the outputs under `dist`, `types` points to the declarations under `dist`. `src` is no longer published.
- Clear `dist` before building, leaving no old outputs.
- Tests: unit tests still target `src`; add tests against the outputs, confirming that both outputs can be imported, their exports match the entries, `yaml` is still an external `import` in the outputs rather than bundled code, and the command line tests run the output that `bin` points to.

This does not change the public API but the published form: users importing through `exports` are not affected; paths referencing `layout-data/src/...` directly were never within `exports` and are not supported.

## Decision

Accepted, implemented as proposed. The library's constraint is only not to bundle dependencies; bundling itself is still needed: the two entries are bundled into independent outputs, `yaml` and Node.js built-in modules are kept as external `import`s, and only `dist` is published. The public API is unchanged.

---
id: qwtplakg
opened: 2026-10-27T03:45:49.281Z
closed: 2026-10-27T04:30:16.000Z
title: 恢复打包：两个入口各自打包，排除依赖
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [672c0ec]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

本包作为库，约束条件是**不把依赖打包进来**：`yaml` 是运行时依赖，由使用方的包管理器安装和去重。

**6d1a69b 为什么去掉打包器。** 在此之前，rolldown 把 `src/index.js` 连同 `yaml` 一起打包为 `dist/layout-data.js`，`yaml` 只是开发依赖。提交 6d1a69b（`build: stop bundling yaml and drop the bundler`）的目的是让 `yaml` 成为运行时依赖、不再打进产物。当时把"库不打包依赖"理解成了"库不打包"，所以连打包器一起去掉了，此后直接发布 `src`：

- `package.json` 的 `exports` 指向 `src/*.js`，`files` 包含 `src`，发布的是源码文件本身，内部模块（`registry.js`、`structure.js` 等）也作为独立文件发布；
- 构建只用 `tsc` 生成 `dist/types` 的声明。

**现在为什么改回来。** 这个约束只要求依赖不进产物，并不要求放弃打包。打包本身仍然需要，只要把依赖模块排除在外，就同时满足了"发布打包产物"和"不打包依赖"。6d1a69b 中让 `yaml` 成为运行时依赖的部分是对的，保留；去掉打包器的部分是误解，改回来。

## 解决提案

- 恢复 rolldown 作为开发依赖，`pnpm build` 先用 rolldown 打包，再用 `tsc` 生成声明（输出到 `dist`，与产物并排）。
- 两个入口**各自独立打包**，互不共享 chunk：
  - `src/index.js` → `dist/index.js`（运行时入口 `layout-data`）；
  - `src/dev.js` → `dist/dev.js`（开发期入口 `layout-data/dev`，也是 `bin` 的 `layout-types`）。
  - 每个文件自成一体，运行时入口的产物不含开发期入口的代码。
- 排除依赖：`package.json` 的 `dependencies`（现在是 `yaml`，包括它的子路径）和 Node.js 内置模块（`node:*`）都作为外部模块保留为 `import`，不打进产物。
- `dist/dev.js` 保留开头的 `#!/usr/bin/env node`，并保持 `import.meta.main` 和 `import.meta.filename` 指向它自己，命令行的行为不变。
- 只发布 `dist`：`files` 为 `dist` 和 `CHANGELOG.md`，`exports` 的 `default` 和 `bin` 指向 `dist` 下的产物，`types` 指向 `dist` 下的声明。`src` 不再发布。
- 构建前清空 `dist`，不留下旧的产物。
- 测试：单元测试仍针对 `src`；另加针对产物的测试，确认两个产物能导入、导出与入口一致，产物里 `yaml` 仍是外部 `import` 而不是打包进来的代码，命令行测试运行 `bin` 指向的产物。

这不改变公开 API，改变的是发布形态：使用方通过 `exports` 导入，不受影响；直接引用 `layout-data/src/...` 的路径本来就不在 `exports` 之内，不受支持。

## 裁定

接受，按解决提案实施。库的约束只是不打包依赖，打包本身仍然需要：两个入口各自打包为独立的产物，`yaml` 和 Node.js 内置模块保留为外部 `import`，只发布 `dist`。公开 API 不变。

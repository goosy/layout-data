---
id: rn1ain7j
opened: 2026-10-26T19:26:00.817Z
closed: 2026-10-26T19:45:28.000Z
title: 类型生成移到开发期入口，由描述生成，不再定位 Ldata 的模块
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

spec-layout §8 的类型生成是登记域的方法 `scope.render_types(options)`（issue#h57v9x2x），v0.4.0 已发布。它有两个问题：

- **混淆了开发与运行时。** 类型声明只给编辑器读取，生成它是开发时的事，由开发脚本在布局改动后运行一次；应用运行时用不到它。可它是 `Layout_Scope` 的成员，运行时的每个登记域都带着这个方法，运行时入口也包含了它的实现。
- **承担了调用方的模块定位。** 生成的声明要导入 `Ldata`，`options.ldata_module` 规定导入的模块说明符，"相对于输出文件"。这要求本包知道调用方把文件放在哪里、怎样组织模块，而这是调用方的事，不该由本包的参数表达。本仓库的类型测试按包名自引用 `"layout-data"`，也不需要这个选项。

## 解决提案

- 从 `Layout_Scope` 删除 `render_types`。新增开发期入口 `layout-data/dev`（`package.json` 的 `exports["./dev"]`，文件 `src/dev.js`）。运行时入口 `layout-data` 不再包含类型生成。
- 开发期入口导出 `render_types(descriptions, options)`，由描述生成声明文本：
  - `descriptions` 与 `register_layout` 接受的相同：描述文件的路径、描述对象，或它们的列表。函数在内部创建登记域并注册这些描述，为其中的全部布局生成文本；
  - `options.scope` 是登记域名，只用于头部注释给出的示例，默认 `app`，应当写应用里实际使用的登记域名；
  - `options.source` 是头部注释写出的来源；省略时，描述全是文件路径则写这些文件名，否则头部只说明这是生成的文本；
  - 描述不合法时抛出与 `register_layout` 相同的带 `errors` 的 `Error`；登记域名不合法时抛出与 `create_scope` 相同的异常。
- 删除 `options.ldata_module`。生成的文本固定写 `import type { Ldata } from "layout-data";`：这是本包的名字，不是一个位置。类型在开发时生成，开发者的项目依赖本包，生成的声明由这个项目的编辑器读取，所以它总能解析。
- 同一个文件兼作命令行工具，`package.json` 的 `bin` 名为 `layout-types`，用 `import.meta.main` 判断是否作为入口运行。命令行只解析参数，再调用 `render_types`：
  - `layout-types <描述文件...> [--scope <名>] [-o|--out <文件>]`；
  - 位置参数是描述文件，至少一个；
  - `--scope` 对应 `options.scope`，默认 `app`；
  - `-o`/`--out` 是输出文件，省略时写到标准输出；
  - `-h`/`--help` 显示用法，包括版本要求；
  - 出错时把原因写到标准错误输出（描述不合法时逐条列出），以非 0 退出码结束，不写输出文件。
- 命令行只能处理描述文件；布局在代码里以描述对象给出时，用函数入口写开发脚本。
- `import.meta.main` 要求 Node >= 24.2。这只约束生成类型的开发环境，不影响运行时的 `engines`（`node >= 20.11`），函数入口也只需要 `node >= 20.11`；在开发时切换 Node 版本来生成类型，是开发者应备的能力。规范和命令行的帮助都写明这一要求；在更早的 Node 上运行命令行时，不能静默无输出，要说明所需版本、当前版本和改用函数入口的写法，以非 0 退出码结束。

这是破坏性变更：`scope.render_types(options)` 改为从 `layout-data/dev` 导入的 `render_types(descriptions, options)`，参数是描述而不是登记域，`ldata_module` 不再提供。

否决的方案：

- `render_types(scope, options)`，接收已注册的登记域对象：生成类型只需要描述，接收登记域对象把开发工具绑在运行时对象上，也让函数入口和命令行的输入不一致。
- 保留 `ldata_module`，改为"提供 `Ldata` 的包名"：仍由本包替调用方写出模块说明符，而开发时总有本包可用，不需要这个选项。
- 生成的文件不导入 `Ldata`，只生成 `<布局>_Tags`：`<布局>_Ldata` 消失，`Ldata & <布局>_Tags` 要由使用方自己组合，写法冗长。
- 本包声明全局类型（如 `Layout_Data.Ldata`），生成文件不需要导入：污染全局类型空间，还要为此手写声明文件。
- 用 `import.meta.url`/`import.meta.resolve` 算出 `Ldata` 的位置：那是运行时 JS 文件的绝对路径，不是类型声明的位置，写进生成文件也不可移植。
- 函数和命令行分成两个文件：多一个文件，判断入口也可以用 `import.meta.main` 在同一个文件里完成。

## 裁定

接受，按解决提案实施。类型生成是开发期的事，移到开发期入口 `layout-data/dev`，运行时入口不再包含它；类型由描述生成，与 `register_layout` 的输入一致；生成的文本固定从 `"layout-data"` 导入 `Ldata`，不再替调用方定位模块。命令行 `layout-types` 要求 Node.js >= 24.2，只约束生成类型的开发环境，运行时的 `engines` 不变。这是破坏性变更，只涉及开发期的类型生成，运行时 API 不变。

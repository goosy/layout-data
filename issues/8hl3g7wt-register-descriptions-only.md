---
id: 8hl3g7wt
opened: 2026-10-27T06:08:40.924Z
closed:
title: register_layout 只接受描述对象，YAML 文本与文件由导出的 yaml、yaml_file 解析
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

`scope.register_layout(descriptions)` 的描述是描述文件的路径（字符串）或描述对象，或它们的列表（spec-layout §5.2）。这带来两个问题：

- **无法直接从 YAML 文本注册。** 字符串固定表示路径，在代码里写成文本的 YAML 只能由调用方自己解析成对象。调用方为此要直接依赖 `yaml`（pnpm 不允许导入传递依赖），解析设置（YAML 1.2）和错误格式也可能与本包读文件时不一致。
- **注册承担了文件读取。** 读文件、解析 YAML 和注册布局是三件事，`register_layout` 把它们合在一起：参数类型是 `string | Layout_Description`，字符串一律是路径，读不到文件和语法错误也算作注册的违例。在字符串上再加一种含义（文本）只能靠猜，有歧义。

## 解决提案

- `register_layout(descriptions)` 只接受描述对象（`Layout_Description`）或它们的列表。字符串不再是路径，作为描述给出时是违例，错误提示改用 `yaml` 或 `yaml_file`。读取与解析从注册里移出。
- 运行时入口 `layout-data` 导出两个函数，返回描述对象，由调用方组合后交给 `register_layout`：
  - `yaml`：把 YAML 1.2 文本解析成描述对象。可以作为标签模板（``yaml`...` ``，插值按文本拼接），也可以普通调用（`yaml(text)`）；
  - `yaml_file`：读取并解析一个描述文件。可以作为标签模板（``yaml_file`pump.yaml` ``），也可以普通调用，参数是路径字符串或 `file:` URL（`yaml_file(new URL("./pump.yaml", import.meta.url))`）。相对路径按当前工作目录解析；
  - 解析与读取的错误在调用时立即抛出，是带 `errors` 的 `Error`，与注册的错误格式相同；解析设置与原先读描述文件时相同。
- `yaml_file` 在返回的对象上用一个内部的、不可枚举的 symbol 记下文件路径。注册时，重名错误用它称呼这个描述（`item table Pump is defined in a.yaml and b.yaml`），没有它的描述仍按位置称作 `layout description #2`。这个标记不是公开 API，展开或复制对象后就没有了。两个入口各自打包，各有一份运行时代码，开发脚本从 `layout-data` 取 `yaml_file`、从 `layout-data/dev` 取 `render_types` 时，两边要认得同一个标记，所以它是 `Symbol.for` 登记的全局 symbol，不是模块内的 `Symbol()`。
- `render_types(descriptions, options)` 的 `descriptions` 随之只接受描述对象。省略 `options.source` 时，全部描述都带文件标记就写出这些路径，否则头部只说明这是生成的文本。
- 开发期入口不重新导出 `yaml`、`yaml_file`：开发脚本与应用一样从 `layout-data` 导入它们，每个函数只有一个导入位置。
- 命令行 `layout-types` 的用法不变，仍接受描述文件：它用 `yaml_file` 读取每个文件，收集全部文件的错误一并报告，再调用 `render_types`。

示例：

```js
import { create_scope, yaml, yaml_file } from "layout-data";

const scope = create_scope("app");
scope.register_layout([
  yaml_file`common.yaml`,
  yaml`
layouts: [Pump]
item_tables:
  Pump:
    - { name: id, type: UInt, offset: 0 }
`,
  { layouts: ["Valve"], item_tables: { Valve: [{ name: "open", type: "Bool", offset: 0 }] } },
]);
```

这是破坏性变更：`register_layout("pump.yaml")` 改为 ``register_layout(yaml_file`pump.yaml`)``，`render_types` 同样。

否决的方案：

- 字符串按内容区分路径和文本（如有无换行）：靠猜，有歧义。
- 描述对象里用 `{ yaml: text }` 包装文本：`yaml` 根键会再占用一个调用方的根键名，而且本包只读取 `layouts` 和 `item_tables`（issue#66mnmtg6），其他根键不应改变描述的含义。
- 保留 `register_layout` 接受路径，只增加 `yaml`：注册仍承担文件读取，参数有两种来源的含义。
- `yaml_file` 接受以 `|` 分隔的多个路径：`|` 在 Linux、macOS 上是合法的文件名字符，还要另定转义；一次一个文件语义最简单，多个文件由调用方 `map` 成列表即可。
- 文件来源不做标记，一律按位置称呼：重名错误不再指出是哪个文件，不便定位。

## 裁定

接受，按解决提案实施。注册只做注册：`register_layout` 与 `render_types` 只接受描述对象，YAML 文本与描述文件由 `layout-data` 导出的 `yaml`、`yaml_file` 解析成描述对象，由调用方组合；`yaml_file` 一次一个文件，用 `Symbol.for` 的全局 symbol 记下来源，使两个入口的错误与生成的头部仍能写出文件名；命令行用法不变。这是破坏性变更，`register_layout("pump.yaml")` 改为 ``register_layout(yaml_file`pump.yaml`)``。

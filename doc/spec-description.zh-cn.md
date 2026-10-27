# 描述规范

> 本文规定描述，即布局在注册、编译之前的形式：描述文件与描述对象、条目表与 `item_tables`、`layouts`、条目、遍历与合并，以及描述必须满足的规则，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。注册和注册得到的布局对象见 [spec-layout.zh-cn.md](spec-layout.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 形式

描述是**描述对象**，即代码中的 §2 结构（§6）。同一结构也可以写成 YAML 1.2 文本，放在**描述文件**里或写在代码里；运行时入口 `layout-data` 把这样的文本变成描述对象（§1.1）。

描述对象交给登记域的 `register_layout` 注册（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3）。一次注册可以给出多份描述，它们合并后一起处理（§4）。

### 1.1 读取 YAML

```js
import { create_scope, yaml, yaml_file } from "layout-data";

create_scope("app").register_layout([
  yaml_file`common.yaml`,
  yaml`
layouts: [Pump]
item_tables:
  Pump:
    - { includes: common_head, offset: 0 }
    - { name: id, type: UInt, offset: 16 }
`,
]);
```

- `yaml` 把 YAML 1.2 文本解析成描述对象。它是模板字面量的标签，``yaml`...` ``，也可以用文本普通调用，`yaml(text)`；
- `yaml_file` 读取一个描述文件并解析成描述对象。它也是标签，``yaml_file`pump.yaml` ``，也可以用路径字符串或 `file:` URL 普通调用，`yaml_file(new URL("./pump.yaml", import.meta.url))`。相对路径按当前工作目录解析。一次调用读一个文件：多个文件就是多次调用，由调用方放进一个列表；
- 作为标签时，两者取模板的原始文本，与 `String.raw` 相同：反斜杠按原样保留，所以 Windows 路径和 YAML 双引号字符串的转义原样到达文件系统和 YAML 解析器。插值按字符串放进文本；
- 所以模板里的文本按 YAML 解释，不按 JavaScript 解释：`\t`、`\n` 这样的转义只在 YAML 的双引号字符串里表示制表符、换行。单引号字符串和不加引号的标量按原样保留反斜杠，也不报错，所以在 JavaScript 字符串里看起来一样的写法，在这里得到的是另一个值：

  ```js
  yaml`comment: "tab\tdone"`  // { comment: "tab<TAB>done" }，制表符
  yaml`comment: 'tab\tdone'`  // { comment: "tab\\tdone" }，反斜杠和 t
  yaml`comment: tab\tdone`    // { comment: "tab\\tdone" }，反斜杠和 t
  ```

  用字符串普通调用时，`yaml(text)` 拿到的是 JavaScript 已经处理过转义的文本，与任何字符串相同；
- 读取或解析错误在调用时抛出，是 `errors` 属性列出各项错误的 `Error`，与注册的错误相同：`yaml` 的标题是 `invalid YAML text`，`yaml_file` 的是 `invalid description file <路径>`。其他类型的参数抛出 `TypeError`；
- 读取时不检查结构：根不是映射以及 §5 的其他违规由注册报告；
- `yaml_file` 返回的描述对象记得它的文件，所以注册的错误（§5.1）和生成的类型的头部（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5）用路径称呼它。只有返回的那个对象带着它：副本，例如 `{ ...description }`，不带。

## 2. 结构

描述的根是映射，本包只使用其中两个根键：

- **`layouts`**：布局名的列表。列出的每个名字都是一个条目表的名字，这个条目表注册为同名的布局；
- **`item_tables`**：条目表名到条目表的映射。**条目表**是条目的列表（§3），供 `layouts` 列为布局，或供条目的 `includes`、`coupling` 按名引用。

```yaml
layouts: [NODE]

item_tables:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }

  node_commands:
    - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
    - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

  node_parameters:
    - { name: max_pressure, type: Real, offset: 0, init_value: 10 }
```

- 布局和被引用的条目表是同一种东西，差别只在用法：一个条目表可以既列在 `layouts` 里，又被别的条目表引用；
- `layouts` 和 `item_tables` 之外的根键都归调用方：本包不读取、不校验，条目表名也不会与它们冲突。所以描述可以带别的内容，例如一份更大的配置，其中一部分是描述，它可以直接作为描述传入，不必先剪出条目部分；
- `item_tables` 中，本包只读取从 `layouts` 出发遍历到的条目表（§4）。因此多份描述可以共用一份较大的 `item_tables`，各自列出不同的布局；
- 根键的顺序不影响含义。**建议把 `layouts` 写在 `item_tables` 前面**：读者先看到有哪些布局，再按名字找到各条目表。本文的示例都按这个顺序写。

## 3. 条目

条目表的每个元素是一个条目：

| 字段 | 说明 |
| --- | --- |
| `name` | tag 名。它是所有语言都认的标识符（§5.2），所以 tag 总能写成 `data.名字`，也与 PLC 数据块里的字段一致。设备点表里点位的名字若不同，把那个名字写进 `comment` |
| `type` | [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §1 所列类型之一，大小写不敏感 |
| `offset` | 位偏移；非 Bool 必须在整字节上，多字节类型必须从偶数字节开始 |
| `length` | 位长，可省略，省略时由类型决定；写出时须与类型一致 |
| `init_value` | 初值；给出时须是该类型可表示的值（整型是范围内的整数，`Real` 是 float32 范围内的有限数）。可以省略：此时布局不给该 tag 初值，它在数据块中从 `0` 开始（`Bool` 为 `false`）；组合字与组成位见 §5.2 |
| `comment` | 可选的说明文字，供生成点表、类型声明等使用 |
| `coupling` | 组合字的组成位：条目表名或内联条目列表，各位的 `offset` 相对于该字 |
| `is_combined` | 可选，说明性标记（整字与各位双向联动的组合字）；联动由 `coupling` 决定，不依赖它 |
| `includes` | 与 `offset`（可加 `name_prefix`）一起，把条目表名或内联列表指定的条目整体偏移后拼接进来 |

被引用的条目表中的条目也可以引用其他条目表。

条目有两种，类型声明里各有名字（`Layout_Item` 是两者之一）：

| 条目 | 字段 | 声明 |
| --- | --- | --- |
| tag | `name`、`type`、`offset` 必填；`length`、`init_value`、`comment`、`is_combined`、`coupling` 可选；没有 `includes` | `Tag_Item` |
| 包含 | `includes` 和 `offset` 必填；`name_prefix` 可选；没有 `name` 和 `type` | `Include_Item` |

- `coupling` 是条目表名或内联的 tag 条目列表，不能是名称列表：各位的名称是注册的结果（出现在布局的 `items` 里，[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §4），不是输入；
- 描述对象的声明是 `Layout_Description`：`layouts` 是字符串列表，`item_tables` 是名字到 `Layout_Item` 列表的映射，其余根键可以是任何值。类型声明里登记域的 `register_layout` 的参数用它标注，所以在代码里写条目时，编辑器能补全条目的字段，拼错字段名时会提示。

## 4. 遍历与合并

注册时，先把各描述合并，再从 `layouts` 出发遍历：

- **合并 `layouts`。** 每份描述都可以有 `layouts`，各份的列表合并成一个列表。描述不必有 `layouts`（只放公共条目表的文件就没有），但合并后的列表至少有一个名字；
- **遍历。** 从合并后的 `layouts` 列出的名字出发，顺着条目中 `includes` 和 `coupling` 给出的条目表名，找到所有被引用的条目表。只有遍历到的条目表被读取、校验，并出现在注册的结果里；内联列表中的条目也照此遍历；
- **按名查找跨描述。** 一个名字在全部描述的 `item_tables` 中查找，与描述在列表中的顺序无关：布局可以引用任何一份描述中的条目表。其他根键无论叫什么名字，都不参与查找；
- **只比较遍历到的名字。** 遍历到的条目表必须恰好在一份描述中定义；没有遍历到的条目表不比较，所以两份描述可以各有一个同名、但没有布局遍历到的条目表。

遍历到的条目表随注册的结果返回（`register_layout` 的返回值 `tables`，[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3），按条目表名索引，内容是引用展开后的条目：`includes` 和 `coupling` 都是条目列表，不会是名称，每个 `length` 都存在，偏移相对于条目表起点。它们仍是描述的形式，声明是 `Layout_Item`；例如可以用它取得参数块的全部 tag 名。

## 5. 合法性

违反下列任何一条都是违规。注册时报告全部违规项，什么都不登记（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3）。

### 5.1 描述

- `layouts` 给出时必须是字符串列表；
- `item_tables` 给出时必须是映射；
- 合并后的 `layouts` 至少有一个名字，且名字互不重复：同一份描述中重复，或不同描述中重复，都是违规，不做去重；
- `layouts` 列出的名字必须是 JavaScript 的标识符（任何文字的字母、数字、`_` 和 `$`，不以数字开头），因为布局名是类型名的一部分（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5）；
- `layouts` 列出的名字和条目引用的条目表名都必须在 `item_tables` 中有对应的条目表，且它是条目列表，不是列表时是违规；
- 遍历到的条目表在两份描述中都有定义时是违规，错误写出这两份描述（由 `yaml_file` 读取的描述用它的文件路径，其他描述用它在列表中的位置，如 `layout description #2`）；不做覆盖；
- 条目表之间不得循环引用；
- 每个条目是 §3 的 tag 条目或包含条目之一，字段符合 §3 的规定。

### 5.2 布局

列在 `layouts` 里的每个条目表，展开引用后作为一个布局，还要满足：

- tag 名是标识符（字母、数字和 `_`，不以数字开头；数字、空名和缺少 name 都不是），在布局内唯一，且不是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；双方都不给出时，组合字与组成位都没有初值；
- 布局总长是整数个寄存器（16 位的整数倍）。

只被引用、不在 `layouts` 里的条目表不单独按布局校验：它的条目展开到引用它的布局里，随那个布局一起校验。

## 6. 在代码中给出描述

描述不一定要有文件。把一个描述对象，即 §2 的结构，交给登记域的 `register_layout`，写成对象，或用 `yaml` 写成 YAML 文本（§1.1）：

```js
const scope = create_scope("app");
scope.register_layout({
  layouts: ["Pump"],
  item_tables: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = scope.get_layout("Pump").create_ldata("pump_1");
```

- 条目就是 §3 的条目；`length` 可以省略；`coupling` 和 `includes` 接受内联列表，或同一次注册的任一描述中某个条目表的名字；
- 应用的配置对象里带有 `layouts` 和 `item_tables` 时，可以把整个配置对象作为描述传入，其余根键和没有从 `layouts` 遍历到的条目表都不被读取；
- 传入的描述对象和其中的条目不会被修改；
- 没有单独登记一个条目列表的函数，也没有单独展开或校验结构的函数：注册是唯一做校验的步骤。

---
id: 66mnmtg6
opened: 2026-10-27T08:08:11.934Z
closed: 2026-10-27T08:47:31.041Z
title: 描述结构改为 item_tables 条目表加 layouts 名称列表，只处理从 layouts 遍历到的条目表
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [6078048]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

描述（描述文件与描述对象）的结构是：根键 `layouts` 是布局名到条目列表的映射，其余根键都是片段（spec-layout §2）。布局和片段是两类不同的东西，放在不同的位置，这带来三个问题：

- **一个条目表不能既是布局又是片段。** 一组条目若既要单独作为布局使用，又要被别的布局 `includes`，只能写两遍，或者拆出一个片段再让布局整体包含它。
- **根上不能有别的内容。** 除 `layouts` 外的根键一律当作片段，值不是条目列表就是违例。应用的描述往往是一个更大的配置的一部分（同一个文件或对象里还有别的设置），传入前必须先把条目部分剪切出来。
- **校验和返回的范围是全部片段。** 没有任何布局引用的片段也要解析、出错也会报告，`register_layout` 返回的 `fragments` 也包含它们，与"只关心布局"的使用方式不符。

此外，描述的结构现在写在 spec-layout §2、§3、§6 里，与登记域、注册、布局对象混在一起，没有一份专门说明描述的文档。

## 解决提案

**结构。** 布局和片段统一为**条目表**。根键 `item_tables` 是条目表名到条目列表的映射；根键 `layouts` 是布局名的列表，列出的条目表就是布局。条目表可以既列在 `layouts` 里，又被 `includes` / `coupling` 引用。本包只使用 `layouts` 和 `item_tables` 两个根键，其余根键都留给调用方。

```yaml
layouts: [NODE]

item_tables:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - { name: response_code, type: Word, offset: 128, coupling: node_commands }

  node_commands:
    - { name: stop_pumps, type: Bool, offset: 8, init_value: false }
    - { name: cancel_stop, type: Bool, offset: 9 }
```

根键的顺序不影响含义。文档建议把 `layouts` 写在 `item_tables` 前面：读者先看到有哪些布局，再按名字找到各条目表。文档中的示例都按这个顺序写。

**遍历。** 本包只读取 `layouts` 和 `item_tables`：从 `layouts` 列出的名字出发，在 `item_tables` 中按名字查找，顺着 `includes` 和 `coupling` 的名字引用遍历，只读取、缓存和校验遍历到的条目表。其余根键和 `item_tables` 中没有遍历到的条目表都不读取、不校验，所以描述可以带别的内容，布局描述的超集可以直接传入，多份描述也可以共用一份较大的 `item_tables`、各自列出不同的布局。

**多份描述。**

- 每份描述都可以有 `layouts` 和 `item_tables`，注册时 `layouts` 合并成一个列表。合并后的列表里名字不得重复，无论重复出现在同一份描述里还是不同描述里，都是违例；
- 遍历到的条目表必须恰好在一份描述的 `item_tables` 里定义，在两份描述里都有是违例，错误写出这两份描述；没有遍历到的条目表不做比较；
- 合并后的 `layouts` 至少有一个名字。

**校验。**

- `layouts` 不是名字的列表、`item_tables` 不是映射、列出或引用的名字在 `item_tables` 中没有对应的条目表、遍历到的条目表不是条目列表，都是违例；
- 列在 `layouts` 里的条目表按布局完整校验（spec-layout §4）；只被引用、不在 `layouts` 里的条目表只校验条目本身和引用（片段存在、无循环），不做布局级的检查（重叠、总长等）。

**由此带来的变化（破坏性）。**

- 所有描述文件和描述对象都要改写：`layouts: { Pump: [...] }` 改为 `layouts: [Pump]` 加 `item_tables: { Pump: [...] }`，原来的片段根键移入 `item_tables`；
- 布局和片段共用 `item_tables` 一个名字空间，一个名字只能有一个条目表；
- 未被引用的条目表不再报错；
- `register_layout` 返回值中的 `fragments` 改为遍历到的全部条目表（展开引用后），名称随之调整；
- 类型声明 `Layout_Description` 随之改变：`layouts` 为名字列表，`item_tables` 为条目表名到条目列表的映射，其余根键为任意内容；内联写条目表时编辑器仍能按条目补全字段。

**文档。** 新建 `doc/spec-description.md`（及 `doc/spec-description.zh-cn.md`），专门说明描述：描述文件与描述对象、条目表与 `item_tables`、`layouts`、遍历与合并、条目（现 spec-layout §3）、在代码中给出描述（现 §6）、描述层面的合法性，以及把 `layouts` 写在最前面的书写建议。spec-layout 中这些章节就地改为指向新文档的简介；布局级的合法性、登记域、注册、布局对象和类型声明留在 spec-layout。spec.md 引用新文档。

**与 issue#8hl3g7wt 的关系。** 两者都是对描述与注册接口的破坏性变更，应在同一个版本发布。issue#8hl3g7wt 中的示例和"`{ yaml: text }` 会占用根键"这条否决理由按新结构改写。

否决的方案：

- 保留 `layouts` 为映射、另加"片段也可作布局"的标记：两种位置仍然并存，超集仍需剪切。
- 条目表直接作为根键（根键名即条目表名）：条目表与调用方自己的根键共用一个名字空间，调用方占用的根键名不能再用作条目表名；`includes` / `coupling` 写错的名字可能正好指向调用方的根键，报出的是"不是条目列表"而不是"未知的条目表"，难以定位；根上允许任意内容后，类型声明不能再按条目补全字段。
- 不在 `layouts` 里的根键一律当作片段并全部校验：根上不能有别的内容。
- `item_tables` 中的条目表全部校验：多份描述不能再共用一份较大的 `item_tables`，未被引用的条目表又要报错，回到问题描述的第三点。
- 把 `layouts` 也收进一个根键（如 `layout_data: { layouts, item_tables }`），只占一个根键：每份描述都多一层缩进，两个固定的根键已经足够少。
- 合并多份 `layouts` 时对重复名字去重：重复多半是把同一份描述注册了两次或命名冲突，静默去重会掩盖它。

## 裁定

接受。统一为条目表并放在 `item_tables` 下后，一个条目表可以既是布局又是片段，条目表名不占用调用方的根键；只处理从 `layouts` 遍历到的条目表后，描述可以带别的内容，超集无需剪切。破坏性变更与 issue#8hl3g7wt 在同一版本发布。

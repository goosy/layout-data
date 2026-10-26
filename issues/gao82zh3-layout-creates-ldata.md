---
id: gao82zh3
opened: 2026-10-26T08:36:00.584Z
closed:
title: 布局对象化，由布局产生 ldata
status: open        # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

spec-data-api §2.1 规定 `new Ldata(layout, name)` 的 `layout` 可以是已登记布局的名字，也可以是布局对象，并把按名创建作为通常的用法。由此：

- 按名创建要在构造时按字符串查找布局，名字写错、布局未注册，都要到创建数据块时才报错。传入布局对象时，还要检查它是不是其名字下已登记的那个（spec-data-api §2.1、design §5）。
- 构造过程绕弯：`new Ldata(...)` 先构造一个基类实例，再在构造函数里返回布局对应子类的新实例，基类实例被丢弃（design §5）；各布局的子类另存在 `Ldata.js` 里一张按布局名索引的表中（design §4）。
- 接口以 `Ldata` 为主角，看不出"ldata 是依据布局产生的"这一关系。
- `io_index_table(layout, endian)` 只取决于一个布局和字节序，却是全局函数。布局是不含方法的纯数据（spec-data-api §6.6、design §3），与布局有关的操作只能做成全局函数或放到别处。

## 解决提案

布局从纯数据改为带方法的对象，由布局产生 ldata：

- `layout.create_ldata(name)` 是产生 ldata 的唯一方式。`name` 的规则不变（必须是字符串，否则 `TypeError`）。
- `Ldata` 仍然导出，供 `instanceof`、类型标注和 `Ldata.on_access` / `off_access` 使用，但不能用 `new` 构造：`new Ldata(...)` 抛出 `TypeError`，错误信息写出正确的用法；类型声明中构造函数是私有的，在 TypeScript 和 `checkJs` 中编译期即报错。
- 不再有按名创建：创建数据块时手里必须已有布局对象，按名查找只发生在取得布局的那一步（`get_layout`）。
- 每个布局对应的 Ldata 子类保存在布局对象的私有成员里，不公开；`create_ldata` 直接构造这个子类。`Ldata.js` 里按名索引子类的表、构造函数里先建基类实例再返回子类实例的绕弯都随之取消。只有已登记的布局带有这个子类，复制出来的对象（如 `{ ...layout }`）没有 `create_ldata`，所以"是不是已登记的那个布局"不再是使用方会遇到的问题。
- `io_index_table` 改为布局的方法 `layout.io_index_table(endian)`，取消全局的 `io_index_table`。
- 布局仍然只读、深度冻结：`name`、`length`、`size`、`items` 的含义不变，布局不公开编译数据（spec-data-api §6.6）。子类和编译数据存放在哪里、何时构建，由 design 决定。
- 这是破坏性变更。迁移：`new Ldata("Pump", name)` 改为 `get_layout("Pump").create_ldata(name)`，`new Ldata(layout, name)` 改为 `layout.create_ldata(name)`，`io_index_table(layout, endian)` 改为 `layout.io_index_table(endian)`。

由此有以下设计要求：

- spec-data-api §2.1 改写为由布局创建；§6 开头"注册一次，再按名使用"的流程改为注册后取得布局、由布局创建；§2.9 和 §7 的 `io_index_table` 改为布局的方法；§6.6 列出布局的方法；spec §6 的导出表去掉 `io_index_table`。
- `Layout` 的类型声明从冻结对象的类型改为类，只作为类型导出，不作为可构造的值导出。
- design 中"布局是不可变的纯数据，不含类，`layout.js` 不依赖 `Ldata`"要重写：布局所在的模块依赖 `Ldata.js` 来构建子类，`Ldata.js` 不依赖布局模块，不形成循环。tag 访问器要读写 `Ldata` 的私有缓冲区，所以子类仍在 `Ldata.js` 里构建，由它向布局提供内部函数。
- `Ldata` 的保留名（spec-data-api §2.10）不变：新方法在布局上，不在 ldata 上。

否决的方案：

- 保留 `new Ldata`，另加 `layout.create_ldata` 作为等价写法：同一件事有两种写法，按名创建的失败也仍然存在。
- 只让 `new Ldata` 改为只接受布局对象，不加 `create_ldata`：能消除按名查找的失败，但接口仍以 `Ldata` 为主角，构造函数的绕弯也还在。
- 把布局的子类作为公开成员放在布局上：使用方会拿它直接 `new`，又回到构造函数的问题。
- `io_index_table` 改为 `Ldata` 的静态方法：只是换个地方挂，还是要传布局；改为 ldata 的实例方法：会多一个保留名，tag 不能再用这个名字。

## 裁定

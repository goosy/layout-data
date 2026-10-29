---
id: fh06gn2t
opened: 2026-10-28T14:56:11.517Z
closed: 2026-10-28T15:34:47.336Z
title: scope.register_layout 改名为 scope.load
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [a0b149c, 011b91d]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

issue#yxhoe1w3 之后，`scope.register_layout(descriptions)` 做两件事：把描述的布局注册进域，再建出描述中 `blocks` 列出的 ldata（spec-layout §3）。返回值 `{ layouts, ldata }` 也包含这两部分。这个名字有两处不准确：

- 它只说了注册布局，没有说建实例。一份同时带 `layouts` 和 `blocks` 的描述，只看 `scope.register_layout(desc_file\`pump.yaml\`)` 这行代码，看不出它会建出 ldata。
- `layout` 是单数，可一次调用注册的是多个描述中的全部布局。

## 解决提案

- 把 `scope.register_layout(descriptions)` 改名为 `scope.load(descriptions)`，意思是把描述装入域。参数、行为和返回值 `{ layouts, ldata }` 都不变。
- `load` 同时包含定义和产生两层意思：布局进入域，块建成实例。描述没有 `blocks` 时只有前一层，这个名字同样说得通。
- 错误标题随之改为 `invalid descriptions of scope X`（原为 `invalid layout descriptions of scope X`），因为装入的是描述，违例也包括块的违例。
- `load` 只接受编译好的 `Description`，不读文件；读文件和编译由 `desc_file`、`yaml` 完成，这一点在 spec 中写明。
- 这是不兼容的改动，需要同步修改 spec、design、README、实现、类型声明、测试、基准和 `type_check/consumer.ts`，`render_types` 中提到 `register_layout` 的说明也要一并修改，spec 与 design 的英文和 zh-cn 两个版本都要修改。不保留旧名字。
- 与 issue#qpupna3c（块的 layout 只写布局名）在同一个版本中实施。

否决的方案：

- 加别名 `scope.register_ldata` 指向同一个函数：同一个函数有两个名字，读者会以为它们做的是两件事；这个名字也不准确，因为调用首先注册的是布局，只有 `layouts` 的描述根本不建 ldata；而且 ldata 是建出来的，不是注册的。
- `register` 或 `register_description`：只表达了定义，没有表达建实例；`register_description` 是单数，参数却可以是一个列表。
- `apply`：让人联想到 `kubectl apply` 那样可以反复执行，而这里重复装入同样的 `blocks` 会报重名。
- `instantiate`：只表达了实例，可布局不是实例，本包里的实例指块和 ldata。
- `install`、`deploy`：带着包管理和运维的含义，暗示只做一次。
- `add`、`define`：`add` 太空泛，`define` 只表达了定义。
- 拆成注册布局和建块两个方法：一份描述要调用两次，"全有或全无"只能分两段保证，建块的方法仍然要接收整个 `Description`。

## 裁定

接受，按解决提案实施。注册同时建出块之后，`register_layout` 只说了注册布局，名不副实；`load` 表达把描述装入域，同时包含布局进入域和块建成实例两层意思，参数、行为和返回值不变，只改名字。

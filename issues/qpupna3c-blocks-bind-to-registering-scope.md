---
id: qpupna3c
opened: 2026-10-28T14:40:53.409Z
closed:
title: 块的 layout 只写布局名，块所属注册域由代码决定
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

issue#yxhoe1w3 规定，描述的根键 `blocks` 里每个块的 `layout` 都写成 `<scope>.<layout>`，域名不能省略（spec-description §2、§5.3）；块在注册时建在这个字符串指定的布局上（spec-layout §3）。这样写有以下问题：

- 描述里写死了域名，和"描述不绑定域"的约定相矛盾。spec-description §1.2 规定，`Description` 的编译结果只取决于描述自身和它的 `imports`，可以缓存起来注册进任意多个域。可是带 `blocks` 的描述，块的去向已经写死，注册进别的域时，布局进了那个域，块却仍然建在原来写的域里。
- 块引用本描述自己的布局时，必须提前写出这个描述将来要注册进的域名。这个信息在调用 `register_layout` 时才确定，描述却必须预先知道。
- 想从一份描述生成几组同名 ldata，spec-layout §3 的做法是把布局注册进不同的域，同时让块写出这些域名。域名写死在 YAML 里，实际做法就只能复制描述，每份写一个域名。
- 一次注册可以改动别的域。`app.register_layout(...)` 能在 `lib_a` 的布局上建 ldata，可"全有或全无"只保证被调用的这个域不变，`lib_a` 的状态不在保证之内。
- 块可以引用别的描述的布局（spec-description §2 允许只有 `blocks` 的描述），描述因此依赖注册时的环境：只看描述本身，无法知道它的块能否建成，结果取决于和谁一起注册、注册进哪个域。

## 解决提案

- 块的 `layout` 只写布局名，必须是 JavaScript 标识符，不再接受 `<scope>.<layout>` 形式。
- 描述只关心布局和数据，不关心环境：块的 `layout` 必须是本描述 `layouts` 列出的布局，编译时检查，不是本描述的布局就是违例。只有 `blocks`、没有 `layouts` 的描述因此不再合法。描述不含域名，也不依赖别的描述的布局，编译时就能知道每个块用哪个布局。
- 编译后 `Description.blocks` 中块的 `layout` 仍是布局名字符串，编译只检查它在本描述的 `layouts` 中，不解析为 `Layout_Desc`，`Description` 仍是纯数据。
- 违例的归属随之改变：块的 `layout` 不是标识符，或不在本描述的 `layouts` 中，由 `yaml` 和 `desc_file` 在读入时报出，带原文件的位置，例如 `block pump_1: unknown layout Pump`；注册时对块只剩一种违例，即块名与该布局已有的 ldata 重名（`ldata X.Y.Z already exists`）。
- 块属于描述被注册进的域：`scope.register_layout(descriptions)` 把描述的布局注册进 `scope`（新建，或按指纹复用已有布局），再在得到的布局上建块。`Description` 仍然可以注册进任意多个域。
- 想从一份描述生成几组同名 ldata，就把这份描述分别注册进几个域。
- 要在库的布局上建应用自己的块，应用的描述用 `imports` 引入库的条目表，在自己的 `layouts` 中以相同的布局名列出这个布局，再注册进库的域，例如 `get_scope("lib_a").register_layout(...)`。结构与名字都相同，布局按指纹复用库已有的布局，块就建在这个布局上；结构相同而名字不同，或名字相同而结构不同，都按指纹规则报错。这样每次注册只改动一个域，"全有或全无"也完整覆盖了这次注册。
- 块不再引用同一次调用中别的描述的布局，注册时也就不必先注册全部布局再建全部块；块名在一次调用内不得重复的规则保留，因为它们合并在返回值的同一个索引里。
- 这是不兼容的改动，需要同步修改（英文与 zh-cn 两个版本）：
  - spec-description：§1.2、§2 中 `blocks` 的说明和"只有 `blocks` 的描述"一句、§5.3 的块规则；
  - spec-layout：§3 的块规则与违例清单（删去"块中写的域名随之不同"的说法）、§6 错误表中"a block naming a layout that does not exist"一项；
  - design、README（`<scope>.<layout>` 的说明）、实现、测试和示例。
- 与 issue#fh06gn2t（`register_layout` 改名为 `load`）在同一个版本中实施。

否决的方案：

- 新增必填的 `scope` 根键，`layout` 只写布局名：这和 `register_layout` 的调用方重复说明了域，两者不一致时必须另设一种违规；描述也因此绑定在一个域上，违背 §1.2 的约定。它也不必兜底：`register_layout` 是域的方法，注册总在某个域上进行，这个域就是块所属的域。域只能由代码中的 `create_scope` 创建，布局也由代码注册，所以要在某个域的布局上建块，代码一定已经知道这个域名，YAML 里的域名只是它的副本。如果将来出现由配置文件决定域的通用加载程序，可以用调用方自己的根键（spec-description §2），到那时再考虑让 `Description` 保留这些根键。
- 保留 `<scope>.<layout>`，同时允许省略域名、默认取注册进的域：同一件事有两种写法，跨域修改的问题也依然存在。
- 块只写布局名，但可以引用注册进的域中已有的布局（保留只有 `blocks` 的描述）：描述因此隐含地依赖环境，能否建成块要到注册时才知道；而要在库的布局上建块，用 `imports` 引入条目表、按指纹复用布局就能做到，不需要这个依赖。

## 裁定

接受，按解决提案实施。块的 `layout` 写死域名，使描述绑定在一个域上，并让一次注册能改动别的域；让块只引用本描述的布局、属于描述被注册进的域，描述就不再依赖环境，编译时即可检查块的布局，域名只由代码决定。

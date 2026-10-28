---
id: yxhoe1w3
opened: 2026-10-28T04:48:53.930Z
closed:
title: 描述只用 YAML，每份描述自包含并用 imports 引入依赖，yaml 与 desc_file 编译成 Description，blocks 描述 ldata 实例
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

现在的流程是：`yaml` / `yaml_file` 把 YAML 解析成描述对象，`scope.register_layout(descriptions)` 合并描述列表、从 `layouts` 遍历、校验并生成布局（spec-description §1、§4，spec-layout §3）。这带来五个问题：

- **一份描述不能单独得到布局。** 一份描述可以引用另一份描述的条目表（如 spec-layout §1 的 `pump.yaml` 引用 `common.yaml`），它的含义取决于和谁一起注册，所以布局只有在注册时合并之后才能生成。注册前无法从一份描述稳定地得到它的布局；按内容复用布局只能对整个描述列表做规范化再算特征值（modbus-emulator issue#99agfr7m，以及 TODO 中 `layout_fingerprint` 的提议）。
- **描述对象是不必要的中间产物。** 它便于程序操作，但不适合做配置：配置要让人容易阅读，人读的是 YAML，不是对象。实际的依赖方也不需要它：TLMS_ESD.js 的布局都在 `src/layouts.yaml` 里，运行时动态生成的是 ldata 实例的描述（交给 modbus-emulator 的 `blocks`），不是布局的描述；动态拼出的描述对象只出现在 `test/share.js` 中，用来和 `layouts.yaml` 一起注册测试布局。保留描述对象，spec 就要同时讲描述文件和描述对象两种形式（spec-description §1、§6），声明 `Layout_Description`，并支持把应用的配置对象整个当描述。
- **`yaml_file` 的名字没有说出它读的是什么。** 它读的是 spec 所说的描述文件，名字却像一个通用的 YAML 文件读取函数。
- **实例不能按名字查找，域只能注册一次。** ldata 没有任何按名字查找的地方，实例名可以任意重复；每个域只能注册一次，因为描述之间互相引用，只能合并后一次生成。
- **ldata 实例没有描述的格式。** 本包只提供 `layout.create_ldata(name)`，实例写在哪里、怎么写由各应用自定。modbus-emulator 的描述文件把 `blocks`（`{ name, unit_id, layout, start, offset }`）与 `layouts`、`item_tables` 写在一起，并在 `#read_blocks` 里自己逐个查布局、建 ldata、检查块名重复、收集错误；其中只有 `name` 与 `layout` 属于数据块，`unit_id`、`start`、`offset` 是 Modbus 地址映射。

## 解决提案

### 描述只用 YAML

- 描述只有一种形式：YAML 1.2 文本，写在代码里（``yaml`...` ``）或写在描述文件里（`desc_file`）。JSON 是合法的 YAML 1.2，spec 写明 JSON 文本和 `.json` 文件也是合法的描述，不另加函数。
- 去掉描述对象这一公开概念：`register_layout` 不再接受对象，`Layout_Description` 不再导出，spec-description §6（在代码里给出描述）及「把应用的配置对象整个当描述」的用法随之删除。用程序生成描述的使用方改为生成 YAML 文本，或用 `yaml` 标签插值。

### 每份描述自包含，依赖用 imports 显式声明

- 一份描述连同它引入的描述是完整的：编译它只需要它自己和它的 `imports`，结果只由这些内容决定。
- 新增根键 `imports`，与 `layouts`、`item_tables` 并列，列出被引入的描述文件的路径：

  ```yaml
  imports:
    - common.yaml
  layouts: [Pump]
  item_tables:
    Pump:
      - includes: Motor_Status   # from common.yaml
  ```

- `imports` 只提供条目表：被引入描述的 `layouts` 一律忽略，遍历只从引入方的 `layouts` 出发。按现有的遍历规则，只读取、校验遍历到的条目表，所以引入一份大的公共描述不会把其中与本描述无关的条目带进布局，公共描述可以放心做大。
- 名字冲突只比较遍历到的名字：一张遍历到的条目表在本地和被引入的描述中（或在两份被引入的描述中）都有定义，是违例，直接报错，不引入限定名。
- 被引入的描述可以再有 `imports`；循环引入是违例。
- 描述文件里的相对路径相对于该文件。``yaml`...` `` 写的文本没有所在文件，模板标签也无法另传基准，其中的相对路径是违例，只接受绝对路径与 `file:` URL；需要相对位置的调用方自己插值，如 `${new URL("common.yaml", import.meta.url)}`。
- 条目表名只需在一份描述及其引入范围内唯一，不再要求在域内唯一。
- `imports` 成为本包读取的根键，此后不能再由调用方挪作他用。

### yaml 与 desc_file 一步编译成 Description

- `yaml` 与 `desc_file` 读取、解析并编译，返回这份描述编译后的 `Description`（其中的布局尚未注册），不再产出描述对象。解析、引入和校验的错误在调用时抛出，是带 `errors` 的 `Error`。
- 编译出的是尚未绑定域的布局：遍历、校验、编译、指纹都已完成，只差 `scope`。未绑定的布局不能 `create_ldata`（抛出）。调用方使用的布局只从域取得（注册结果或 `get_layout`），所以公开的 `Layout` 类型中 `scope` 总是存在。
- ``yaml`...` `` 与 `desc_file` 返回一份描述 `Description`，交给 `register_layout`（与 `render_types`）：

  ```js
  /**
   * @typedef {Omit<Layout, "scope">} Layout_Desc           // one compiled layout, not bound to a scope
   * @typedef {{ name: string, layout: string } & Record<string, unknown>} Block_Desc
   * @typedef {{ layouts: Record<string, Layout_Desc>, blocks: Block_Desc[] } & Record<string, unknown>} Description
   */
  ```

  - `layouts` 是描述中的布局名到未绑定布局的映射，键与根键 `layouts` 列出的名字相同；
  - `blocks` 是解析出的块列表本身，经过检查，不复制、不改动，保留应用自己的键。原文缺省（没有这个根键）时它是 `[]`，这是 `layouts` 之外返回值唯一的改变；缺省的补全在检查之前，所以 `blocks` 给出而不是列表时仍是违例。应用读取自己的键（如 modbus-emulator 的 `unit_id`、`start`、`offset`）时，用这里的值还是自己解析描述，由应用决定；
  - 其他根键原样返回：YAML 解析出的根对象中，只有 `layouts` 换成编译结果，其余根键（包括 `imports`、`item_tables` 和应用自己的根键）以解析出的对象原样放进 `Description`，`imports` 保留原文的路径，`item_tables` 保留未展开的条目。应用读取自己的根键不必再解析一次 YAML；本包只读 `layouts` 与 `blocks`，不读其他键。只返回被读入的描述自己的根键，被引入描述的根键不并入；
  - `Description` 连同其中的一切深度冻结，原样返回的根键也是如此：它们是解析新建的对象，冻结不影响调用方；
  - 类型名按描述一侧命名，与 `desc_file` 的缩写一致。
- 每份描述独立编译后，注册不再需要一次完成：「每个域只注册一次」的规则删除。`scope.register_layout` 可以多次调用，对每个布局按下面的指纹规则绑定、复用或报错。
- `register_layout(descriptions)` 的参数是一个 `Description` 或一组 `Description`。返回 `{ layouts, ldata }`：`layouts` 按布局名索引本次注册的布局（已绑定到本域，复用的就是域中已有的那个），`ldata` 按块名索引本次由 `blocks` 建出的 ldata。同一次调用里各描述的块名不能重复，否则是违例，因为它们合并在同一个索引里。
- 注册从不改动传入的 `Description`：每次都由其中的 `Layout_Desc` 生成新的已绑定布局，或复用域中指纹相同的已有布局；所以同一个 `Description` 可以缓存，并注册进任意多个域。
- 域内以单个布局为单位做指纹：布局是否相同以指纹为准，布局名只用于查找和定位。指纹只由编译结构决定（各标签的名字、类型、偏移、初值），不含布局名与注释。指纹是内部的，不对外提供；TODO 中 `layout_fingerprint` 的提议由此取代。
- 在一个域里注册一个布局时：
  - 域中已有指纹相同的布局：名字也相同就复用已有布局，不生成新布局；名字不同是违例；
  - 域中没有指纹相同的布局：名字与已有布局相同是违例，否则由传入的布局生成一个绑定到这个域的新布局。
- 一次 `register_layout` 调用要么全部生效，要么全部不生效：违例收集齐后一起抛出（带 `errors` 的 `Error`），域保持调用前的状态，已有的布局与 ldata 都不变。
- 指纹到布局的映射由每个域自己维护，本包不持有跨域的指纹表，所以指纹只在一个域内比较：同一份描述注册进两个域，各自生成独立的布局，不要求重复的布局只有一个实例。
- 布局名就是描述中 `layouts` 列出的名字，注册时不能改。
- 注册结果不再含 `tables`（遍历到的条目表的展开形式）：它只是编译的中间产物，依赖方用的条目表是自己从 YAML 读的。
- 编译出的布局本来就与描述在内存上无关（引用的条目表在展开时逐处深拷贝，布局之间只共享模块常量 `CODECS`），所以一份描述编译出的布局可以直接缓存、复用，不受其他描述影响。

### 域管理布局，布局管理实例

- 域管理一组布局：布局名在域内唯一，一个布局只属于一个域（保留 `layout.scope`）。同一份编译结果注册进两个域，得到两个互不相关的布局；重复的布局各占一份资源，换来简单的所属关系。
- 布局管理它的 ldata：一个 ldata 只属于一个布局（`ldata.layout`）。新增 `layout.get_ldata(name)`，按名字查到这个布局建出的 ldata，名字不存在时抛出（`unknown ldata X.Y.Z`），与 `get_layout` 一致。ldata 名在它的布局内唯一，`create_ldata` 遇到重名抛出 `Error`（`ldata X.Y.Z already exists`，与 `unknown ldata X.Y.Z` 对应）；不同布局（包括不同域里同名的布局）的 ldata 可以同名。
- 需要多组同名实例的使用方，把布局注册进不同的域，各域的布局各自管理自己的实例。
- ldata 的日志名仍是 `<域名>.<布局名>` 加 ldata 名。
- 本 issue 不提供释放 ldata 的机制（现在也没有），由另一个 issue 处理；布局持有 ldata 的方式要给以后加入释放留出余地。

### blocks 描述 ldata 实例

- 新增根键 `blocks`，与 `layouts`、`item_tables`、`imports` 并列，列出这份描述的 ldata 实例。每个条目是一个映射，本包只读其中的 `name`（实例名）与 `layout`（布局）；条目的其他键不读，留给应用，如 modbus-emulator 的 `unit_id`、`start`、`offset`：

  ```yaml
  layouts: [PUMP]
  blocks:
    - { name: pump_1, layout: app.PUMP, unit_id: 1 }   # unit_id is read by the application
  ```

- 编译结果只含 `blocks` 这份清单（纯数据），不含 ldata，所以仍可与布局一起缓存、复用。块的 ldata 在注册时建：一次 `register_layout` 先注册调用中的所有布局，再建所有块，所以块可以引用同一次调用中另一份描述的布局。每个块在 `layout` 所指的布局上建 ldata，由该布局按块名管理；块名与该布局已有的 ldata 重名是违例，包括在同一个域里再次注册含同样 `blocks` 的描述：布局按指纹复用，块却不复用，这是配置错误。同一份描述要建多组同名实例，要把布局注册进不同的域，块中写的域名也随之不同，这由调用方安排。
- `layout` 是配置，只能是字符串，不能是布局对象的引用；它的形式固定为 `<域名>.<布局名>`，必须写出域名。域名与布局名都是标识符，不含 `.`，所以写法没有歧义，与 `get_layout` 的错误信息 `unknown layout X.Y` 的写法一致。没有这个名字的域，或域中没有这个布局，都是违例。
- 布局要注册后才能按域名找到，所以 `layout` 在注册时解析，不在编译时解析；同一份描述里的块引用本描述的布局，也要写出它将注册进的域名。
- 块名在一份描述内唯一。违例收集齐后一起报出（带 `errors` 的 `Error`），不在第一个错误处中断。
- 检查分两处做：
  - `yaml` / `desc_file` 做与域无关的检查，错误在读入时报出，带原文件的位置：`blocks` 是列表、条目是映射；`name` 必须给出且是字符串；块名在一份描述内唯一；`layout` 是形如 `<标识符>.<标识符>` 的字符串；被引入描述的 `blocks` 在这里丢弃。
  - 注册时只做与域状态有关的检查：`<域名>` 对应的域存在，域中有这个布局，块名不与该布局已有的 ldata 重名。
- 被引入描述的 `blocks` 一律忽略，与 `layouts` 一样：实例只来自引入方。
- `blocks` 成为本包读取的根键，条目中的 `name`、`layout` 归本包；条目的其他键始终留给应用。

### 命名

- 保留 `yaml`。模板标签惯例上以模板中所写的语言命名，不以返回值命名（lit 的 `html`、graphql-tag 的 `gql`、各数据库库的 `sql` 都返回对象）；「这是布局描述」的含义由调用处提供。
- `yaml_file` 改名为 `desc_file`。它不是标签惯例适用的场合（参数是路径，不是内容），按参数是什么命名：参数是描述文件，与 spec 术语一致，也不会被误读为通用的 YAML 读取函数。
- 否决的命名：
  - `desc` 代替 `yaml`：描述还包括曾经的描述对象，不一定是 YAML，且 `desc(...)` 会让人以为它接受对象或负责构造描述；
  - `file` 代替 `yaml_file`：过于通用，容易与使用方的变量互相遮蔽，单看名字也看不出用途；
  - `descfile`：缩写也算一个词，按 snake_case 应分隔，与 `yaml_file` 的先例一致。

### 受影响的部分

- `render_types` 的输入改为 `Description`（`yaml` / `desc_file` 的返回值），命令行 `layout-types` 仍接受描述文件。
- modbus-emulator 转发 `yaml`、`yaml_file`，要同步改名；它的 `create_upward` 在注册时收集 `errors`，描述错误提前到读入时抛出后要相应调整。
- TLMS_ESD.js 的 `test/share.js` 改为用 `yaml` 写测试布局、以 `imports` 引入 `layouts.yaml`。
- modbus-emulator 的 `#read_blocks` 改由本包建实例，自己读 `unit_id`、`start`、`offset` 并挂到单元表；块的 `name` 必须写出，`unit_${unit_id}` 的默认名由 emulator 在生成配置时自己补上；`BLOCK_KEYS` 的检查随之调整。块的 `layout` 改写为 `<域名>.<布局名>`。注册布局时由调用方显式指定域名，`blocks` 中写的就是这个名字；自动生成的域名（如 `s<fingerprint>`）拿不到或写错，是调用方自己的事，本包不为它提供任何查找途径。

这是破坏性变更：描述对象被移除，`yaml_file` 改名为 `desc_file`，`yaml` 与 `desc_file` 的返回值从描述对象变为 `Description`，注册的参数随之改变，注册结果不再含 `tables`，条目表的作用域从域缩小到描述，`blocks` 成为本包读取的根键，「每个域只注册一次」的规则删除，ldata 名在其布局内必须唯一。

否决的方案：

- 取消注册、改由 ES 模块导出布局：注册仍要保留，它提供按名字查找布局的域。
- 用 YAML 注释声明引入（如 `# @import common.yaml`）：注释不是数据，解析时被丢弃，让注释承载语义违背 YAML 的本意。
- 用自定义 YAML 标签声明引入（如 `!include common.yaml`）：依赖解析器扩展，不是通用的 YAML。
- 返回值的类型沿用 `Layout_Description`：它还带 `blocks`，不只是布局描述；旧名含义改变，迁移者会以为仍可传对象。
- 返回值的类型用 `Compiled_Description`、`Unbound_Layout` 一类名字：把内部的编译状态写进了公开名字。
- `Description` 只含 `layouts` 与 `blocks`：应用要读自己的根键（如设备模拟器的整体配置），就得对同一份文本再解析一次 YAML，也拿不到 `desc_file` 解析过的同一份内容。
- 本包定义完整的实例描述（包括地址等字段）：除 `name`、`layout` 外的字段属于设备通信，在本包范围之外。
- `layout` 只写布局名、在默认域或本描述中查找：本包不设默认域（spec-layout §2），只写布局名会让块的含义取决于和谁一起使用。
- 实例不进描述，只保留 `create_ldata`：各应用继续各写一份查布局、建实例、查重名的代码，实例的写法也无法统一。
- 由调用方持有的实例组管理 ldata 名（`blocks` 返回一组，直接建的实例加入组）：分别注册的多份描述各有 `blocks` 时，注册方法无从指定放进哪一组；注册后用布局建实例、也用布局查实例，心智模型更自然。
- 域只管名字、不管身份（布局与 ldata 都不引用域，同一对象可放进多个域，域也可以放 ldata）：调用者要自己记录每个对象放进了哪些域，心智负担过重；它只是让重复的布局共用一个实例，省下资源占用，不提高运行效率。
- 严格自包含、不提供引入：公共条目表只能在每份描述里复制，失去共享。
- 注册时用可省略的映射参数给布局改名，以便不动描述源就能改布局名：它要解决的同名冲突，把布局注册进另一个域就能解决；改名后同一份描述里按原名写的 `blocks` 找不到布局，`render_types` 生成的类型名也与域中的布局名不一致。现有依赖方都不需要它；它是可省略的参数，需要时再加也不破坏已有用法。
- 加 `json` 作为 `yaml` 的别名：名字承诺了并不检查的 JSON 格式，`` json`a: 1` `` 也能通过；需要标明的使用方可以导入时自己改名。严格的 `json`（按 `JSON.parse` 解析）是只增不改的功能，需要时在 1.0 之后再加。

## 裁定

接受，按解决提案实施。描述只用 YAML 且每份自包含，布局才能脱离注册时的组合单独得到并按指纹复用，「每个域只注册一次」随之可以删除；域管理布局、布局管理 ldata 的所属关系保持简单，`blocks` 为批量建块的调用方省去重复代码。ldata 的释放另开 issue。

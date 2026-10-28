# layout-data 设计

> 需求见 [spec.zh-cn.md](spec.zh-cn.md)，编程接口见 [spec-description.zh-cn.md](spec-description.zh-cn.md)（描述）、[spec-layout.zh-cn.md](spec-layout.zh-cn.md)（布局）和 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)（数据对象）。本文说明实现。

## 1. 源文件

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 包的公开接口 |
| `src/Ldata.js` / `src/Ltag.js` | 数据对象与 tag 句柄；`Ldata.js` 还构建各布局的 Ldata 子类及其原型访问器 |
| `src/yaml.js` | `yaml` 和 `desc_file`：读取 YAML 文本和描述文件及其引入的文件，交给 `layout.js` 编译成 `Description` |
| `src/layout.js` | 描述的遍历与编译，`Description` 的组装，注册（布局的绑定、复用与块的创建），`Layout` 类 |
| `src/scope.js` | 登记域：`Layout_Scope` 类、`create_scope` 和 `get_scope` |
| `src/internal.js` | 包内部的 Symbol 键：一个文件定义、另一个文件使用的成员以它们为键，每个键注明定义者和使用者。`index.js` 不导出它们，`package.json` 的 `exports` 也不开放这个文件，所以使用方不会误用（内部使用，包不导出） |
| `src/registry.js` | 登记表：按登记域名保存的登记域，以及每个登记域按布局名、按指纹保存的布局（内部使用，包不导出） |
| `src/structure.js` | 结构展开（`build_structure`）与布局校验（`validate_structure`）；内部使用，包不导出 |
| `src/dispatch.js` | `emit_all`：调用一个事件的每个监听函数，收集它们抛出的异常（内部使用，包不导出） |
| `src/reserved.js` | 保留的 tag 名与保留的事件名的静态清单（内部使用，包不导出） |
| `src/codecs.js` | 各类型在大端缓冲区上的编解码 |
| `src/observer.js` | 快照比对，变化事件 |
| `src/endian.js` | 单个条目和整块数据的设备字节序转换（内部使用，包不导出） |
| `src/dev.js` | 开发期入口 `layout-data/dev`：导出 `render_types(descriptions, options)`；作为入口运行时（`import.meta.main`）是命令行工具 `layout-types`（`package.json` 的 `bin`） |
| `src/types.js` | 由布局生成 TypeScript 类型声明的文本（`dev.js` 调用它；内部使用，包不导出） |
| `src/typedefs.js` | 公开类型的 JSDoc 定义（类型的唯一来源，无运行时内容） |
| `dist/index.js` / `dist/dev.js` | 构建时由 rolldown 生成的两个入口的产物（`rolldown.config.js`，§7），即发布的文件，不入库 |
| `dist/*.d.ts` | 构建时由 `tsc` 从 JSDoc 生成的声明文件（`tsconfig.json`），与产物同在 `dist`：`index.d.ts`、`dev.d.ts` 是两个入口的声明，其余是它们引用的模块声明；不入库 |

## 2. 组成

| 部分 | 职责 | 实例数 | 可变性 |
| --- | --- | --- | --- |
| Layout | 由列在 `layouts` 里的条目表编译而来：公开的 `name`、`length`、`size`、`items` 和方法 `create_ldata`、`get_ldata`、`delete_ldata`、`io_index_table`；私有的编译数据（各 tag 的字节位置、编解码、字节到 tag 的反查表）、该布局的 Ldata 子类和按名持有 ldata 的表 | 每份描述的每个布局一个未绑定的；每个登记域每种结构一个已绑定的 | 公开部分不可变，ldata 表可变 |
| Ldata | 值缓冲区（私有，大端）、按名访问、原始读写方法、`get(name)` 返回的 Ltag | 每个 ldata 一个 | 可变 |
| Observer | 快照比对，发出变化事件 | 每个 ldata 一个 | 可变 |

依赖方向：Layout 依赖描述和 Ldata（它构建子类、创建 ldata）；Ldata 使用 Layout 在构建子类时交给它的布局和编译数据，`Ldata.js` 不引用 `layout.js`，不成环；Observer 只使用 Ldata 交给它的缓冲区和编译数据。使用方的调度和 IO 在包之外，包只通过 Ldata 的 `write` 事件通知它们，任何一方都可以监听。

### 2.1 组件边界

- 包代码不依赖使用方的配置、业务和日志器；
- 出错时抛出异常，不写日志、不调用 `process.exit`；
- 描述对包是外部输入：使用方给出 YAML 文本或描述文件，由 `yaml`、`desc_file` 读取并编译。读文件、解析和编译与注册分开，注册只接受编译出的 `Description`。

### 2.2 开发期入口与命令行的边界

开发期入口 `layout-data/dev`（`src/dev.js`）和命令行 `layout-types` 只在开发时使用，与应用的运行时无关：

- 输入只有描述，输出只有声明文本。它们不接收、不返回、也不读取应用运行时的任何对象（登记域、布局、ldata）；
- 它们运行在开发者自己的进程里（开发脚本或命令行），不创建登记域，也不创建 ldata；
- 运行时入口 `layout-data`（`src/index.js`）不引用 `dev.js`，应用不加载类型生成的代码；`dev.js` 只经由 `desc_file`、`scope.js` 的 `check_scope_name` 和 `layout.js` 的 `check_descriptions`、`plan_layouts`、`registration_error` 使用运行时的实现，读入、校验和布局冲突的规则因此和运行时完全相同；
- 生成的文本固定从 `"layout-data"` 导入 `Ldata`：读取它的是开发者项目的编辑器，这个项目依赖本包。应用怎样打包运行时代码，与类型生成无关；
- 命令行是同一个函数的参数外壳：解析参数后调用 `render_types`，两者的输入和结果相同，只是命令行只接受描述文件，并用 `desc_file` 读取它们。

## 3. 描述与注册

公开的术语（描述、描述文件、`Description`、条目表、布局、登记域、块）见 spec.zh-cn.md §2。读入与注册要经过几个阶段，各阶段的产物是内部的，本文这样称呼它们：

| 术语 | 含义 | 代码中 |
| --- | --- | --- |
| 来源 | 一份描述的名字空间中的一个描述：出处（文件路径或 `YAML text`）和解析出的根 | `load_imports` 返回的列表的元素 `{ origin, root }`，第一个是被读入的描述本身 |
| 条目表缓存 | 遍历到的条目表，按条目表名索引，引用已解析 | `compile_description` 的 `tables` |
| 结构 | 列在 `layouts` 里的条目表，引用已解析、展开为扁平条目 | `Data_Struct`，由 `build_structure` 生成 |
| 编译数据 | `Ldata` 需要而公开的 Layout 不展示的部分：`entries` 和 `tags_at_byte` | `Compiled_Layout`，Layout 的私有字段 `#compiled` |
| 指纹 | 布局的编译结构的规范文本：按布局顺序，每个 tag 的名字、小写的类型、偏移、初值 | `fingerprint(items)` 的返回值 |

**读入。**

- `yaml.js` 读入描述（spec-description.zh-cn.md §1.1）。`yaml(...args)` 和 `desc_file(...args)` 接受模板调用（第一个参数是带 `raw` 的数组）或一个普通参数。模板调用用 `String.raw` 连接成一个字符串。`yaml` 取文本；`desc_file` 接受字符串或 `URL`（URL 的路径是 `fileURLToPath(url)`，它也拒绝不是 `file:` 的 URL），用 `readFileSync(path, "utf8")` 读取。其他参数抛出 `TypeError`。YAML 都用 `parseDocument(text, { version: "1.2" })` 解析，结果是 `doc.toJS()`。
- `load_imports` 从被读入的描述出发，按深度优先读取它的 `imports`，返回名字空间的全部来源。被读入的描述的出处是 `desc_file` 收到的路径，或 `YAML text`；它的目录（`yaml` 文本没有）用于解析相对路径。每个引入的路径：以 `file:` 开头的用 `fileURLToPath` 转换，绝对路径原样使用，相对路径用 `path.resolve` 相对于引入方文件的目录解析，`yaml` 文本里的相对路径报错。引入的文件以解析后的绝对路径为出处和身份：已读过的路径不再读，所以同一个文件只算一份；路径已在当前引入链上时报告循环引入（`b: circular import a -> b -> a`，以引入方文件 `b` 开头）。根不是映射、`imports` 不是字符串列表、文件不能读取或解析，都带着出处进入错误列表，读取和解析错误的每一项以文件路径开头。引入的描述只读 `imports` 和 `item_tables`，`layouts`、`blocks` 不读也不检查。
- 来源交给 `layout.js` 的 `compile_description(sources, errors)`（下文），结果交给 `make_description`。有任何错误时 `yaml.js` 抛出带 `errors` 的 `Error`，标题是 `invalid YAML text` 或 `invalid description file <路径>`；否则返回 `Description`。

**编译。** `compile_description(sources, errors)` 完成与登记域无关的全部工作，问题推入 `errors`。它返回描述处理的中间值 `desc_process`：被读入的描述解析出的根对象，`layouts` 换成编译的结果，`blocks` 缺省时补为 `[]`，即 `{ ...root, layouts, blocks }`。中间值一路以 `{ ...desc_process, <要换的键> }` 传递，每一步只处理自己要换的键，不理会其他键，所以其他根键原样到达 `Description`：

- 被读入的描述的 `layouts` 必须是字符串列表；名字重复、不匹配 `IDENTIFIER`（`structure.js`）都报错。各来源的 `item_tables`（没有时为空映射）必须是映射。
- 从 `layouts` 的每个名字出发，用 `resolve_table` 遍历条目表（spec-description.zh-cn.md §4）：按名字在全部来源的 `item_tables` 中查找，找不到、在两个来源中都有（写出两处出处）、值不是列表时报错；名字在当前引用链上时报告循环引用。`resolve_items` 解析一个列表中 `includes`、`coupling` 的引用并补全省略的 `length`，它复制每个条目和嵌套列表。每个条目表只解析一次，结果存入条目表缓存，所以同一条目表被引用多次时错误只报告一次；引用处得到缓存内容的深拷贝（`structuredClone`），展开时对它的修改不会影响缓存和别的引用处。没有遍历到的条目表既不读取也不比较。
- 之后对每个布局取缓存中它的条目表的深拷贝，调用 `build_structure` 展开为扁平的 `items`（计算结构总长 `length`，把 coupling 规范为名称数组），用 `validate_structure` 校验（§3.1），全部合法时用 `compile_structure` 编译为未绑定登记域的 Layout。
- `blocks` 缺省（`undefined`）时先补为 `[]`，再检查：必须是列表，每个块是映射，`name` 是字符串且在本描述内唯一，`layout` 匹配 `<IDENTIFIER>.<IDENTIFIER>`；出错的块用它的名字或序号（`block #i`）指出，前面是被读入的描述的出处（`YAML text` 不加）。`check_blocks` 只检查，不返回值，也不复制块：解析出的列表本身留在 `desc_process` 中，最后随 `Description` 一起冻结。
- 没有错误时由 `make_description(desc_process, path)` 组装 `Description`：`{ ...desc_process }`，其中 `layouts` 是布局名到未绑定布局的对象（按 `layouts` 的顺序），`blocks` 是解析出的块列表，其余根键是解析出的值，整体深度冻结。根对象由 `doc.toJS()` 新建，只属于这次读入，所以就地冻结不影响调用方。被引入的描述的根键不并入。它带两个不可枚举的属性，键都在 `internal.js`：`DESCRIPTION`（值为 `true`），表明它由 `yaml` 或 `desc_file` 产生；`desc_file` 读入的还带 `ORIGIN`，值是路径。两个键都是 `Symbol.for(...)` 注册的 Symbol，不是自己的 `Symbol()`，因为每个入口打包时各带一份 `yaml.js` 和 `layout.js`（§7）：`layout-data` 的 `desc_file` 得到的 `Description` 会交给 `layout-data/dev` 的 `render_types`，两份代码必须读同一个键。
- 条目的字段与类型：每个 tag 条目包含 `{ name, type, offset }`，可选 `length`、`init_value`、`comment`；`offset` 和 `length` 的单位都是位（bit），`length` 省略时由类型决定。`type` 取值（大小写不敏感）：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。`Word` 条目带 `coupling`（条目表名或内联列表）时，表示由若干 Bool 组成的状态字或命令字；`is_combined: true` 只是说明性标记：整字与各位共用同一块字节，联动不依赖它。coupling 内各项的 `offset` 相对于该字的起点。`{ includes: <条目表名或内联列表>, offset }` 把一组公共条目整体偏移后拼接进来，可加 `name_prefix`。条目的类型（`Tag_Item`、`Include_Item`、`Layout_Item`）在 `internal_types.js` 中，不公开。
- 组合字与组成位只由一方给出 `init_value`：`build_structure` 展开时，组合字未给出则由组成位合成（未给出的位为 false），组合字给出则组成位的值从整字拆出；双方都不给出时都保持没有初值；双方都给出时保留给出的值，由校验报告。

**Layout。**

- `Layout` 是 `layout.js` 里的类，实例深度冻结（构造函数最后 `Object.freeze(this)`），公开的属性只有 `name`、`length`、`size`、`items`，另有原型上只读的 `scope`（spec-layout.zh-cn.md §4），其中 `items` 是展开后条目的冻结副本，只含文档规定的字段；方法 `create_ldata`、`get_ldata`、`delete_ldata` 和 `io_index_table` 在原型上，所以 `{ ...layout }` 只复制这四个属性。编译结果，即按名称索引的条目表 `entries`（字节偏移、位掩码、编解码）和字节到 tag 的反查表 `tags_at_byte`，存放在私有字段 `#compiled`，从不作为属性出现，所以公开接口里不出现 entry。
- 构造函数是 `(key, name, length, items, compiled, scope)`，要求 `layout.js` 模块私有的键 `CREATE_KEY`，否则抛出 `TypeError`，所以布局只由编译和注册产生，`new layout.constructor(...)` 也不行。类型声明中构造函数是私有的（JSDoc `@private`），`typedefs.js` 的 `Layout` 引用这个类，`Layout_Desc` 是 `Omit<Layout, "scope">`，包只导出类型，不导出类。
- 未绑定的布局由 `compile_structure(data_struct)` 生成，`scope` 为 `undefined`。绑定由 `bind_layout(desc, scope)` 完成：以未绑定布局的 `name`、`length`、`items` 和编译数据（以 Symbol 为键的只读 getter `layout[COMPILED]`，键在 `internal.js`）构造一个新的 Layout，`scope` 是这个登记域。冻结的 `items` 和编译数据都不可变，所以由同一份未绑定布局绑定出的各个布局直接共用它们；每个已绑定的布局有自己的私有状态（Ldata 子类、ldata 表）。`scope` 是读取私有字段 `#scope` 的 getter；登记域对象不是冻结对象的属性，所以放在私有字段里。
- 构造已绑定的 Layout 时调用 `Ldata` 以 Symbol 为键的静态方法 `Ldata[LDATA_FACTORY](layout, compiled)`（键在 `internal.js`），它构建该布局的 Ldata 子类（§4），返回创建其 ldata 的函数；布局把这个函数存放在私有字段 `#create_ldata`。未绑定的布局不构建子类，`#create_ldata` 为 `null`，`create_ldata` 抛出 `Error`（`layout X is not bound to a scope`）。子类和键 `CREATE_KEY` 都不离开 `Ldata.js`，布局只知道这个创建函数。`io_index_table(endian)` 把 `size` 和 `#compiled` 交给 `endian.js` 的同名内部函数（§6）。tag 访问器要读写 `Ldata` 的私有缓冲区，所以子类在 `Ldata` 的类体内构建；这个静态方法就在类体里，能直接访问私有成员，不需要静态初始化块和模块变量做中转，Symbol 键也不会与 tag 名冲突（spec-data-api.zh-cn.md §2.10）；`layout.js` 依赖 `Ldata.js`，`Ldata.js` 不依赖 `layout.js`。
- 布局的 ldata 表是私有字段 `#ldata`，一个 `Map<string, Ldata>`，以普通的强引用持有。`create_ldata(name)` 在 `name` 是字符串且已在表中时抛出 `ldata X.Y.Z already exists`，否则调用创建函数（它检查 `name` 是字符串，`TypeError`），把结果放进表里再返回。`get_ldata(name)` 查表，没有时抛出 `unknown ldata X.Y.Z`；`delete_ldata(name)` 返回 `this.#ldata.delete(name)`。ldata 本身不知道这张表，所以解除绑定不影响它。
- `fingerprint(items)` 由公开的 `items` 计算指纹：按顺序取每个 tag 的 `name`、小写的 `type`、`offset` 和 `init_value`（没有时为 `null`），`JSON.stringify` 得到的文本就是指纹，直接作为 `Map` 的键，不再取散列。组成位的关系由偏移决定（§3.1 的组合字规则），`length` 由类型决定，所以都不必计入。它只读公开成员，所以对另一份打包代码编译的布局也能计算（`render_types`）。

**登记域与注册。**

- 登记域（spec-layout.zh-cn.md §2）是 `scope.js` 的类 `Layout_Scope`。`create_scope(name)` 用 `check_scope_name(name)` 检查名字（不是字符串时 `TypeError`，不匹配 `IDENTIFIER` 时 `Error`），再以模块私有的键 `CREATE_KEY` 构造登记域；构造函数没有这个键时抛出 `TypeError`，类型声明中它是私有的，`typedefs.js` 的 `Layout_Scope` 引用这个类，包只导出该类型。构造时用 `registry.js` 的 `add_scope` 在登记表里占用这个名字（重名时抛出 `Error`），最后 `Object.freeze(this)`：登记域可以按名取得，冻结使取得它的模块不能替换它的方法或重新定义 `name`。`get_scope(name)` 从登记表取得登记域，没有时返回 `undefined`。
- 登记表（`registry.js`，它不引用任何模块）按登记域名保存登记域，只供 `get_scope` 和名字查重使用；每个登记域的布局表另存在一张以登记域对象为键的表里，每项有两个 `Map`：按布局名索引的 `by_name` 和按指纹索引的 `by_fingerprint`。`layouts_of(scope)` 按对象本身查找，从不通过名字，所以一个读起来名字相同的对象到不了别的登记域的布局表，这是冻结之外的又一层保证。`scope.js` 写入登记域，`layout.js` 写入布局，登记域的 `get_layout` 读取。登记表不会清空：登记域和其中的布局在进程的整个生命期内有效。
- 登记域的 `register_layout(descriptions)` 调用 `layout.js` 的内部函数 `register_descriptions(descriptions, scope)`，可以多次调用。测试在一个进程里要注册很多次，通常每次用自己的登记域（`test/api/share.js` 的 `fresh_scope`），走公开的接口。
- `register_descriptions(descriptions, scope)` 先检查参数：空列表、列表里再放列表、没有 `DESCRIPTION` 标记的值都是错误，后者提示用 `yaml` 或 `desc_file`。每份描述的出处是它的 `ORIGIN`，否则是列表中第 i 份的 `description #i`（单独一份时为 `description`）。之后分三步，前两步只检查、不改动任何状态：
  1. **布局。** `plan_layouts(list, existing, errors)` 按列表顺序取每个未绑定布局，算出指纹，在暂存表和登记域的 `by_fingerprint` 中查找：找到且名字相同就复用（登记域已有的布局，或本次暂存的那个），名字不同报错；找不到时，名字在暂存表或登记域的 `by_name` 中已有则报错，否则用 `bind_layout` 生成绑定到本登记域的新布局，放进暂存表。结果是本次的布局（按名索引）和要新登记的布局；
  2. **块。** 收集全部描述的块，块名在本次调用中重复时报错并写出两处出处。每个块按 `.` 分成登记域名和布局名：登记域名是本登记域时先在暂存表、再在本登记域中查找布局，否则用 `find_scope` 找登记域、在它的布局表中查找；找不到登记域或布局报错。布局已有这个名字的 ldata 时报错；
  3. **生效。** 有任何错误时抛出带 `errors` 的 `Error`，标题写出登记域名（`invalid layout descriptions of scope X`），什么都没有改动。否则把新布局写入登记域的两张表，再对每个块调用其布局的 `create_ldata(name)`，返回 `{ layouts, ldata }`。块名已检查不重复，tag 的初值已通过校验，所以这一步不会失败，登记域不会停在一半的状态。
- `register_structure(data_struct, scope)` 编译一个结构并直接登记到登记域，不经校验和指纹比较；只有测试辅助函数 `one_tag` 为了随意补齐数据块而调用它，名字已被该登记域使用时抛出 `another layout is already named X.Y`。除此之外没有任何路径会登记未经校验的布局。
- 登记域的 `get_layout(name)` 返回本登记域的布局，没有时抛出 `unknown layout X.Y`。错误信息都用 `登记域名.布局名` 指出布局：子类的类名（`Ldata_X.Y`）、保留 tag 名的错误、Observer 的振荡错误，以及 ldata 的 `X.Y.Z`。
- Bool 的定位规则：`byte = offset >> 3`，`bit = offset % 8`。内部缓冲按大端存放，一个字的第一个字节是寄存器的高字节，所以 coupling 中偏移 8–15 对应寄存器的 bit0–7，偏移 0–7 对应 bit8–15。布局文件按 8–15、0–7 的顺序列出，就是按寄存器 bit0 到 bit15 的顺序排列。

### 3.1 布局校验

布局规则在布局阶段集中校验，不分散到 Ldata 和 Ltag 的运行时：

- `validate_structure(data_struct)` 对 `build_structure` 展开后的扁平 `items` 做校验，返回违规描述的数组（空数组表示合法），不在发现第一个错误时退出。它是内部函数。
- 校验内容：
  - 名称：不是匹配 `TAG_NAME`（`/^[A-Za-z_][A-Za-z0-9_]*$/`，各种语言和 PLC 都认的 ASCII 标识符）的字符串，所以 YAML 里的数字、空名、缺少 name 都在这里失败；`items` 中名称重复；名称与 Ldata 的成员（`Ldata.prototype` 上的方法、getter，以及 `name` 等实例字段）冲突。
  - 类型与长度：`type` 不在支持的类型中；`length` 与类型不符（Bool 1，Byte / SInt / USInt 8，Int / UInt / Word 16，DInt / UDInt / DWord / Real 32）。
  - 对齐：非 Bool 的 `offset` 必须是 8 的倍数；多字节类型的字节偏移必须是偶数。
  - 重叠：把非 Bool 条目按字节区间排序后检查相邻区间是否相交；Bool 按 `offset` 检查是否重复占用同一位；Bool 落在某个非 Bool 区间内时，要求该 Bool 条目的 `coupling`（展开后是它所属组合字的名称数组）包含这个非 Bool 条目的名称。
  - 组合字：带 `coupling` 的条目，其每个组成位必须存在、是 Bool，且 `offset` 都在 `[offset, offset + length)` 内。
  - 总长：`length % 16 === 0`。
  - 给出的 `init_value` 的类型与取值范围与 `type` 相符；没有初值的 tag 不检查。
  - 组合字与它的组成位不同时给出 `init_value`（展开时记录冲突，由校验报告）。
- `build_structure` 遇到重名或不合法的名字时保留条目，交给校验报告。只有纯包含条目（有 `includes` 且没有 name）才会被丢弃；其余条目都是 tag，所以缺少 name 的 tag 条目会被报告，不会丢失。名称前缀只加在字符串类型的名字前。
- `compile_description` 对描述中的全部布局调用校验，有违规时由 `yaml` 或 `desc_file` 抛出包含全部违规项的错误（`error.errors`）。
- 校验通过后，Ldata 和 Ltag 不重复做这些检查；`register_structure` 只保留防御性断言。

## 4. 编解码与原型访问器

- 编解码表 `codecs.js` 中每种类型有一项，`get(buffer, byte, mask)` 从大端缓冲区解码，`set(buffer, byte, mask, value)` 编码写入；设备字节序不在表中处理。
- 每个布局在编译时构建一个 Ldata 子类（`Ldata.#build_class(layout, compiled)`，由静态方法 `Ldata[LDATA_FACTORY]` 调用），在其原型上为每个条目定义一次访问器，同一布局的实例共用。子类只由 Layout 私有保存的创建函数持有（§3），`Ldata.js` 不按名字索引子类。子类的构造函数是 `(key, name)`，把它所属的布局和编译数据交给 `super`（§5），没有公开的静态属性。访问器：
  - getter 每次用编解码表从 `buffer` 解码，不缓存值；
  - setter 用编解码表写入 `buffer`，再调用 `after_write`。
- 组合字与它的组成位共用同一块字节，写任何一方，另一方读到的自然是新值，不需要额外联动。
- tag 名不得是保留名（spec-data-api.zh-cn.md §2.10），否则访问器会遮蔽成员。保留名是 `reserved.js` 里的静态集合：Ldata 的成员、Node.js 20.11 中 EventEmitter 的方法名与字段名、`Object.prototype` 的名字。运行时不做任何探测，所以集合不随 Node.js 版本而变。`reserved.js` 导出 `is_reserved_name(name)`，只供 `structure.js` 和 `Ldata.js` 使用；包不导出它，Ldata 也没有对应的静态方法。`validate_structure` 报告保留名，`Ldata` 构建子类时也会抛出错误。测试把该集合与运行中的 Node.js 里实例上能找到的名字比对，所以 EventEmitter 新增成员会使测试失败，那时再扩充集合。
- 保留的事件名（`change`、`write`、`read`）是 `reserved.js` 里的常量 `RESERVED_EVENTS`，供测试和文档使用；这是对使用方的规则，运行时不强制。`Ldata` 和 `Ltag` 覆盖 `on`、`once`、`off`（各自只调用 `EventEmitter` 的同名方法），仅为携带带类型的重载：处理器类型由事件名通过 `typedefs.js` 里的条件类型 `Data_Listener<E>` 和 `Tag_Listener<E>` 决定，所以 `change`、`write` 的处理器写错是编译期错误，其他名字可以用任意处理器。从 1.0 起，以后给 Ldata 增加的成员只用 `Symbol` 为键或静态方法。
- `access` 事件（spec-data-api.zh-cn.md §2.8）的监听器有两种。实例监听器是数据块的 `EventEmitter` 上的监听器；类监听器单独存放在 `Ldata.js` 模块私有的一个 `Set` 里（`Ldata.on_access` 和 `Ldata.off_access` 往里加、从里删），所以 `removeAllListeners()` 或任何对实例的调用都碰不到它们。在构造任何东西之前，`#has_access_listeners()` 判断 `class_access_listeners.size > 0 || this.listenerCount("access") > 0`，所以没有监听器的数据块，每次访问只多一次开销很小的检查。实例部分不缓存成由 `newListener`、`removeListener` 事件维护的标志，因为 `removeAllListeners()` 会把这两个内部监听器一起移除，标志就会出错；类部分由 `Set` 自己计数，而它只被两个静态方法改动。`#emit_access(kind, tags, errors)` 先通过 `emit_all` 调用实例监听器，再调用类监听器（各自在自己的 `try` 里，参数是 `(this, kind, tags)`），它们抛出的东西推入 `errors`。模块标志 `in_access` 在这两次调用期间置位，监听器自己在此期间对任何 ldata 的访问都不触发。读取在监听器都调用完之后抛出 `errors[0]`；写入把 `errors` 交给 `#written()`，它在 `touch()` 之后、检测之前发出 `access`，最后才抛出第一个错误，这样缓冲区、快照和事件始终一致。tags 是 `get(name)` 的句柄（用到时才创建）：按名访问是那一个 tag；字节范围则由 `#tags_in(start, end, mask)` 遍历 `tags_at_byte`，去重、去掉位不在 `mask` 内的 Bool，并按条目的序号排序。
- `dev.js` 的 `render_types(descriptions, { scope = "app", source })`（spec-layout.zh-cn.md §5）先用 `scope.js` 的 `check_scope_name(scope)` 检查登记域名（与 `create_scope` 相同的异常），不创建登记域；再用 `layout.js` 的 `check_descriptions` 检查参数（与 `register_layout` 相同），用 `plan_layouts` 按注册进一个空登记域的规则合并各描述的布局，不绑定，有冲突时抛出与 `register_layout` 相同的带 `errors` 的 `Error`。两者只读 `Description` 的公开成员和 `DESCRIPTION`、`ORIGIN` 两个注册的 Symbol 键，所以 `layout-data` 编译的 `Description` 交给 `layout-data/dev` 也能处理。`source` 省略且每份描述都有 `ORIGIN`（由 `desc_file` 读取）时，以 `, ` 连接这些路径作为 `source`。然后连同登记域名把合并后的布局交给 `types.js` 的内部函数 `render_declarations(scope_name, layouts, options)`，它为每个布局生成一个接口 `<布局>_Tags`（每个 tag 一个属性）和类型 `<布局>_Ldata = Ldata & <布局>_Tags`，只读布局的 `name` 和 `items`。布局名原样使用，不做大小写折叠（大小写风格由调用者决定），所以类型名就是 `scope.get_layout("<布局>")` 里的名字，同一登记域里名字不同就不会冲突。编译时已经检查过布局名匹配 `IDENTIFIER`，tag 名也已经过校验，所以都原样写出，不再检查。`IDENTIFIER` 使用 Unicode 属性 `ID_Start` 和 `ID_Continue`（加上 `_`、`$`），任何文字的名字都能接受。`doc_comment` 把 `comment` 写成单行或多行文档注释，并转义 `*/`。导入 `Ldata` 的模块说明符固定为 `"layout-data"`；没有 `source` 时头部不写文件名，头部注释给出为值指定类型的 JSDoc 类型转换写法，其中用 `get_scope("<登记域>")` 取得登记域。`create_ldata` 的返回类型是 `Ldata`：同一个方法的声明不能随布局返回不同的类型。
- 命令行（spec-layout.zh-cn.md §5.1）也在 `dev.js` 里，模块顶层按 `import.meta.main` 分三种情况：
  - 为 `true`（作为入口运行，Node.js >= 24.2）：调用 `run_cli(process.argv.slice(2))`，它返回退出码，赋给 `process.exitCode`；
  - 为 `undefined`（Node.js 早于 24.2）且本文件是入口：在标准错误输出写出所需版本、当前版本（`process.version`）和改用函数入口的提示，`process.exitCode = 1`。判断"本文件是入口"用 `realpathSync(process.argv[1])` 与 `import.meta.filename` 比较（pnpm 的 bin 可能经过符号链接或 `.cmd` 包装），只为这条提示使用；
  - 其余情况（被导入）：什么都不做。
- `run_cli(args)` 用 `node:util` 的 `parseArgs`（`allowPositionals`，选项 `scope`、`out`/`o`、`help`/`h`）解析参数，未知选项和缺少描述文件是参数错误：写出原因和用法，返回 1。`--help` 写出用法（含版本要求）到标准输出，返回 0。之后用 `desc_file` 读取每个文件，收集全部失败文件的 `errors`（没有 `errors` 的错误取它的 message）；有文件失败时，把它们写到标准错误输出的 `invalid description files` 之下，返回 1，什么都不生成。然后调用 `render_types(descriptions, { scope })`，把文本写到 `--out` 或标准输出，返回 0。`render_types` 抛出的错误写到标准错误输出（带 `errors` 时逐条列出），返回 1，不写输出文件。`run_cli` 不调用 `process.exit`，所以进程结束前输出都已写完。它不导出：测试像使用方一样用 `process.execPath` 以子进程运行 `dev.js`，在没有 `import.meta.main` 的 Node.js 上跳过。

## 5. Ldata

- ldata 只由 `layout.create_ldata(name)` 创建（spec-data-api.zh-cn.md §2.1），它调用 `Ldata[LDATA_FACTORY]` 返回的创建函数，即以 `Ldata.js` 模块私有的键 `CREATE_KEY` 构造布局的子类（§4）。`Ldata` 的构造函数是 `(key, name, layout, compiled)`：在调用 `super()` 之前，先检查 `key` 是 `CREATE_KEY`，否则抛出 `TypeError`（信息是 `an ldata is created by its layout: layout.create_ldata(name)`），再检查 `name` 是字符串（`TypeError`）。所以 `new Ldata(...)` 和对子类（例如 `data.constructor`）使用 `new` 都抛出错误；类型声明中构造函数是私有的（JSDoc `@private`），TypeScript 中既不能 `new` 也不能继承。`Ldata` 本身不会是任何实例的直接类。实例分配 `buffer`（`layout.size` 字节），按条目的 `init_value` 依次编码写入，没有初值的条目跳过，保持缓冲区的 0。
- `name`、`layout`、`size` 都只读（只有 getter，赋值抛出 `TypeError`）；`name` 是私有字段 `#name`，构造函数在检查私有键之后、`super()` 之前检查它是字符串（`TypeError`），再赋值。Ldata 的 `setMaxListeners(100)` 和 Ltag 的 `setMaxListeners(20)` 固定写在各自的构造函数里。缓冲区是私有字段（`#buffer`），没有访问器，统一按大端存放；Observer 和事务所需的缓冲区由创建它们的 Ldata 传入。带类型的访问走 tag，不带类型的访问走字节：没有按宽度分类的原始方法。
- 写缓冲区有两种途径，都经过 Ldata，任何时候都允许：

  | 途径 | 使用者 |
  | --- | --- |
  | 按名赋值（`data[name] = v` 或 `tag.value = v`） | 任何代码 |
  | 原始方法 `write_bytes(offset, source)`、`write_bit(offset, mask, value)`，以字节偏移定位 | 与寄存器地址打交道的代码，如 Modbus 服务端，以及 IO 层 |

- `read_bytes(offset = 0, length = size - offset)` 返回一段字节的副本（`Buffer.from(buffer.subarray(...))`），所以无法通过它改动缓冲区。
- 原始方法在碰缓冲区之前先检查参数，出错时数据不变，也不会走到 `#written()`：`offset`、`length` 须为整数，且 `0 <= offset`、`offset + length <= size`，`mask` 须为 1 到 0xff 的整数（`RangeError`），`source` 须为 `Uint8Array`（`TypeError`）。`write_bytes` 用 `buffer.set(source, offset)` 复制。原始写入把它碰过的字节范围登记给 Observer（§5.1）。
- `load_tag(name, io_buffer, endian)` 和 `store_tag(name, io_buffer, endian)`（spec-data-api.zh-cn.md §2.9）把 `name` 解析为布局的编译条目（名字不存在时抛出 `Error`），检查 `endian`、`io_buffer` 和该条目在其中的范围（`io_range`），再以私有缓冲区调用 `endian.js` 的 `load_entry` / `store_entry`。`load_tag` 登记该条目的字节范围，像任何写入一样以 `#written()` 结束；`store_tag` 只读缓冲区。`Ltag.load(io_buffer, endian)` 和 `Ltag.store(io_buffer, endian)` 以 tag 名调用它们，所以 Ltag 不需要检查自己属于哪个 ldata。

- Ldata 出错时抛出异常（布局冲突、值被拒绝），不写日志、不退出。
- **值检查。** 每个编解码器在 `get`、`set` 之外有 `check(value)`：值可接受时返回 `null`，否则返回原因文字。tag 访问器的 setter 在 `codec.set` 之前调用它，所以被拒绝的值不会碰缓冲区和 Observer；`typeof value` 不是 `"number"` 时抛出 `TypeError`，是数字时抛出 `RangeError`（消息为 `<ldata 名>.<tag>: <原因>`）。`Bool` 总是返回 `null`。整型编解码器要求是数字、满足 `Number.isInteger` 并在类型范围内；`Real` 编解码器要求是数字，放过 `NaN` 和 `±Infinity`，拒绝绝对值超过 `FLOAT32_MAX`（`3.4028234663852886e38`，与 `structure.js` 的 `check_init_value` 用的值相同）的有限值。`Buffer.write*` 只作为最后一道防线，不当作检查。
- `data.get(name)` 返回该 tag 的 `Ltag`，首次访问时创建并缓存，名称不存在时返回 `undefined`。Ltag 不持有值：读 `value` 从 Ldata 的缓冲区解码，写 `value` 与 `data[name] = v` 完全等价；`name`、`type`、`size` 来自布局的编译条目，Ltag 私有地持有它，不对外公开；`change` 事件由 Observer 发出。

### 5.1 检测、事务与 Observer

所有写入路径最后都汇到 Ldata 的同一个私有方法：

```js
#written() {
    if (this.#transaction) { this.#transaction.written = true; return; }  // in a transaction: only remember
    this.#observer.diff();                                                // detect right now
    this.emit("write", this);                                             // then tell the listeners
}
```

- 事务之外，在写入语句内部同步调用 `diff()`，再发出 `write`。
- `diff()` 是内部方法，没有任何公开方法能触发检测。所有写入路径都经 `#written()` 到达它，所以在写入或事务之外，缓冲区与快照不会有差异。

**事务。** `transaction(fn)` 在已有事务时抛出 `Error`；否则复制一份缓冲区，登记事务状态 `{ written: false, read: Set, write: Set }`，同步调用 `fn()`：

- 访问：事务中 `#emit_access` 把 tags 加入状态的 `read` 或 `write` 集合，不调用监听器。只有 `#has_access_listeners()` 为真时才会走到这里，且 `in_access` 置位时它先返回，所以没有监听器时、监听器运行期间都不累积。结束时由 `#in_layout_order(tags)` 按条目序号排序；
- `fn` 正常返回：关闭事务，先发出累积的 `access` `read`，再发出累积的 `access` `write`，调用一次 `diff()`，`written` 为真时发出一次 `write`，返回 `fn` 的返回值（不检查它是否是 Promise）；
- `fn` 抛出异常：关闭事务，把副本写回缓冲区，只发出累积的 `access` `read`（其监听器抛出的异常丢弃），重新抛出原异常；
- Observer 的快照在事务中保持不动：提交时的 `diff()` 就是事务之前最近一次检测与现在之间的净变化；回滚后缓冲区回到事务开始时的内容，与快照重新一致；
- 事件在事务关闭之后发出，处理器中的写入和事务按普通情形处理；提交时处理器抛出的异常在全部事件和 `write` 派发完之后由 `transaction` 抛出（见下文派发），不回滚；
- 事务期间 Node.js 不运行别的 JS 代码，同一线程中没有其他代码能访问这个 ldata，所以事务不需要加锁或隔离；`written` 只是布尔标记，不计次数，因为 `write` 事件没有载荷之外的信息。

**快照比对。** Observer 持有与缓冲区等长的快照，创建时复制缓冲区。每条写入路径都知道自己写了哪一段字节，并把它登记给 Observer（`touch(start, end)`；事务中各段累计为一段）；`diff()` 只逐字节比较登记范围内缓冲区与快照的差异（其余字节按构造必然相等），并清除登记。只对不同的字节经反查表 `tags_at_byte` 找到相关 tag，从快照解码旧值、从 `buffer` 解码新值，值不同（两个 NaN 视为相同）的记为变化；比对完成后更新快照，再统一报告：

- 按布局顺序报告（组合字在其组成位之前），每个变化先由 Ldata 发出 `change(tagname, old, new)`，再由该 tag 的 Ltag 发出 `change(old, new)`；事件总在新值生效之后发出；
- 两次检测之间同一 tag 的多次写入合并为一个事件，值改变后又恢复的不发事件；
- 事件处理器中再写 tag 时，嵌套的比对只登记，等当前这一轮变化报告完再比对一轮；连续 16 轮仍有新变化时停止后续轮次，并把振荡异常记为这次派发的一个错误；
- **派发与错误**（spec-data-api.zh-cn.md §4.4）。`#written()` 和事务的提交各持有一个 `errors` 数组，依次传给 `diff(errors)` 和 `emit_all`；派发期间什么都不抛，直到最后。`dispatch.js` 中的 `emit_all(emitter, event, args, errors)` 对 `emitter.rawListeners(event)` 的每个函数在各自的 `try` 里以 `emitter` 为 `this` 调用，监听函数抛出的东西推入 `errors`；`once` 的包装函数照常在 `rawListeners` 里自行移除。Observer 对每个变化都调用 `report(entry, old, new, errors)`，即使其中一个抛出也不中止，因为一轮的变化在报告第一个之前就已收集完、快照也已更新。`diff(errors)` 之后，写入同样经 `emit_all` 发出 `write`，最后才在有错误时抛出 `errors[0]`。嵌套的 `diff()`（`#diffing`）只登记待处理的一轮，不推入任何错误。第一个异常原样抛出，不包装（不用 `AggregateError`），其余丢弃；
- 旧值从快照解码，不缓存任何值。

## 6. 字节序转换

`endian.js` 按编译条目实现设备字节序与内部大端之间的转换（`load_entry` / `store_entry` / `io_index` / `io_range`），并为整个数据块生成字节下标表（`io_index_table(block_size, compiled, endian)`），与设备整块交换的使用方可以据此直接按字节复制。包不导出这些函数：下标表由布局的方法 `io_index_table(endian)`（§3）传入大小和编译数据调用，其余由 Ldata 的 `load_tag` / `store_tag`（§5）传入私有缓冲区调用。下标表与 `load_entry` / `store_entry` 对每个条目的结果一致（有测试保证）。这些函数只接受 `BE`、`LE`、`BEBS`、`LEBS` 四种字节序（其他值抛出 `RangeError`，没有别名），都不检测变化：

- 2 字节：`BE` 原样复制；`LE` / `BEBS` 交换两个字节；
- 4 字节：支持 `BE`、`LE`、`BEBS`、`LEBS` 四种排列；
- Bool 和单字节类型（Byte、SInt、USInt）只读写一个字节，不做字节内转换；它在 IO 缓冲区中的下标按 16 位寄存器换算：`LE` / `BEBS` 时为 `byte ^ 1`，`BE` / `LEBS` 时为 `byte`。Bool 按位掩码只改自己的位。

## 7. 构建与测试

- `pnpm build`：先 `rolldown -c` 打包，再 `tsc -p tsconfig.json` 从 JSDoc 生成声明文件，同样输出到 `dist`。`rolldown.config.js` 加载时先清空 `dist`，再导出两份配置，两个入口各自打包、不拆分 chunk：`src/index.js` → `dist/index.js`，`src/dev.js` → `dist/dev.js`（`platform: "node"`，`format: "es"`）。`external` 由 `package.json` 的 `dependencies` 的名字（及其子路径）和 `node:` 前缀的内置模块组成，所以 `yaml` 在产物中保留为 `import`。`dist/dev.js` 保留源文件开头的 `#!/usr/bin/env node`，`import.meta` 原样保留，`import.meta.main`、`import.meta.filename` 指的就是这个产物；
- 发布：`package.json` 的 `files` 是 `dist` 和 `CHANGELOG.md`；`exports` 的 `default` 和 `bin` 指向 `dist/index.js`、`dist/dev.js`，`types` 指向 `dist/index.d.ts`、`dist/dev.d.ts`；
- `pnpm bench`：`bench/change_detection_bench.js` 测量读取一个 86 个 tag、146 字节的数据块（从设备字节序缓冲装载每个 tag，并检测、报告变化）的开销。开发机上，在一个事务中对每个 tag 调用 `load_tag`，每周期无变化约 3.1–3.2 µs，少量变化 3.1–4.5 µs，全部变化 8.5–8.6 µs（每次 `load_tag` 还要检查一次是否有 `access` 监听器，86 个 tag 合计约 0.6 µs）；用 `layout.io_index_table` 按字节复制再一次 `write_bytes` 时分别约 0.4 µs、0.6–1.7 µs、5.7–5.9 µs；
- `pnpm test`：先构建，再运行类型测试、`node --test`（全部测试，针对 `src`）和 `pnpm test:dist`（产物测试）；`pnpm lint`：ESLint。测试分三类：
  - 内部测试（`test/*_test.js`，打包测试除外）：用到内部模块（编译数据 `COMPILED`、`endian.js`、`reserved.js`、`register_structure` 等），只针对 `src`；辅助函数在 `test/share.js`；
  - 公开接口测试（`test/api/*_test.js`）：只用公开接口，从 `test/api/target.js` 取得被测的入口，辅助函数在 `test/api/share.js`。`target.js` 默认取 `src` 的两个入口；`pnpm test:dist` 以 `node --test --import ./test/api/dist.js` 运行这些测试，`dist.js` 设置环境变量 `LAYOUT_DATA_TEST_TARGET=dist`，`target.js` 于是按包名导入 `layout-data`、`layout-data/dev`，即 `dist` 中的产物。所以同一组测试先后针对源码和产物各运行一次，即产物测试。命令行测试在两遍中都运行 `package.json` 的 `bin` 指向的产物；
  - 打包测试（`test/bundle_test.js`）：检查打包本身，即 `exports` 和 `bin` 指向 `dist` 中的产物、导出与 `src` 的入口一致、产物中只有 `yaml` 和 `node:` 模块的外部 `import`、运行时产物不含开发期入口的代码、`dist/dev.js` 保留 hashbang。

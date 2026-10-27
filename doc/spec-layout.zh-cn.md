# 布局规范

> 本文规定登记域、注册，以及注册得到的布局：布局对象的属性和方法、由布局生成的类型声明，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。布局在注册之前的形式，即描述的结构、条目和必须满足的规则，见 [spec-description.zh-cn.md](spec-description.zh-cn.md)。由布局创建的数据对象（Ldata / Ltag）见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 流程

流程是**创建登记域，注册一次，取得布局，由布局创建**：先描述布局（[spec-description.zh-cn.md](spec-description.zh-cn.md)），创建一个登记域，用它的一次 `register_layout` 调用把布局全部注册（§3），此后用登记域的 `get_layout("Pump")` 按名取得布局（§4），再用它的 `create_ldata("pump_1")` 创建数据块（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1）。使用方需要知道的是怎样把布局表达成 YAML 结构、它叫什么名字、注册在哪个登记域；它是否经过编译、编译成什么，不属于这个流程。

```js
import { create_scope, get_scope, yaml_file } from "layout-data";
const scope = create_scope("lib_a");                              // 创建登记域
scope.register_layout([yaml_file`common.yaml`, yaml_file`pump.yaml`]); // 每个登记域注册一次
const pump = scope.get_layout("Pump").create_ldata("pump_1");     // 此后取得布局，由它创建
get_scope("lib_a").get_layout("Pump");                            // 在别处按登记域名取得登记域
```

## 2. 登记域

登记域（`Layout_Scope`）是布局名的分隔单位，让基于 layout-data 的库能自带并自己注册布局，应用可以在同一进程里组合多个这样的库。

- 每个登记域有自己的布局和条目表：布局名和条目表名只在登记域内唯一，一个登记域的布局只能引用本登记域的条目表，不同登记域里的同名布局、同名条目表互不冲突；
- **布局只注册到显式创建的登记域里。** 库和应用都创建自己的登记域，注册和取得布局都通过登记域的方法；
- `create_scope(name)` 创建登记域。登记域名和布局名一样必须是 JavaScript 的标识符（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5.1），所以不含 `.`；包名这类含 `@`、`/`、`-` 的字符串不能直接用作登记域名。登记域名在进程内唯一，由创建它的库或应用选择；不是字符串时抛出 `TypeError`，不是标识符时抛出 `Error`，已被别的登记域使用时抛出 `Error`（`a scope is already named X`）。登记域创建后一直存在，不能删除；
- `get_scope(name)` 返回已创建的那个登记域，没有这个名字的登记域时返回 `undefined`，所以也可以用来判断登记域是否存在；
- 登记域的成员：只读的 `name`，即登记域名；`register_layout(descriptions)`，注册布局（§3）；`get_layout(name)`，按布局名（不带登记域名）取得本登记域的布局。登记域对象是冻结的：任何模块都能按名取得它，但不能替换它的方法和属性，修改抛出 `TypeError`。`Layout_Scope` 只作为类型导出，登记域只由 `create_scope` 产生；
- 布局的 `scope` 是它所属的登记域（§4）。错误信息写成 `登记域名.布局名` 来指出布局，例如 `unknown layout lib_a.Pump`、`lib_a.Pump: changes do not settle after 16 rounds`；布局名本身仍是 `Pump`；
- 谁可以向哪个登记域注册，本包不作规定：任何取得登记域的一方都能向它注册，冲突只由"每个登记域只注册一次"保证（§3），第二次注册总是报错。库要防止自己的布局被别人决定，就在创建登记域时立即注册，例如在模块顶层创建后紧接着注册，此前别的代码取不到这个登记域；库也可以把登记域留给使用方注册，例如让使用方在库的描述之外补充自己的布局。库与使用方如何交互，由库自行约定。

## 3. 注册

`scope.register_layout(descriptions)` 把各描述中的布局注册到登记域。布局注册之后才能使用。描述怎样合并、遍历和校验，见 [spec-description.zh-cn.md](spec-description.zh-cn.md) §4、§5。

- `descriptions`：一个描述对象，或描述对象的列表（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1）。列表里不能再放列表，空列表是错误。注册不读文件，也不解析 YAML：字符串不是描述，描述文件用 `yaml_file` 读取，YAML 文本用 `yaml` 解析（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1）；
- **每个登记域只能调用一次。** 布局一次注册，登记域的布局和条目表就是同时全部已知的，不依赖调用的先后。第二次调用抛出 `Error`（`register_layout can be called only once in scope X`），第一次登记的布局保持不变。失败的调用什么都不登记，也不算用掉这一次，所以可以在同一登记域重试，例如自己的文件不合法时改用备用描述；
- 有任何违规时抛出 `Error`，其 `errors` 属性列出所有描述的全部违规项，且什么都不登记：这些描述要么全部登记，要么都不登记。错误的标题写出登记域名（如 `invalid layout descriptions of scope lib_a`）；布局和条目表方面的错误写出布局或条目表的名字，不写文件名；
- 传入的描述不会被修改；
- 返回值：`{ layouts, tables }`。`layouts` 是按名字索引的已登记布局，与 `scope.get_layout(name)` 返回的相同；`tables` 是遍历到的全部条目表（[spec-description.zh-cn.md](spec-description.zh-cn.md) §4）。上面的流程不需要它们；
- 布局在进程的整个生命期内保持登记。`scope.get_layout(name)` 返回已登记的布局（§4），名字未登记时抛出 `unknown layout X.Y`（X 是登记域名，Y 是布局名）；
- 只注册一次的后果：改过的布局文件只在新进程里生效（没有热重载，REPL 里也无法在同一登记域重新注册改过的布局）；
- 依赖树里有两份本包时（例如不同版本各装一份），两份互不相通：各有自己的登记域，用一份注册的布局，另一份按名找不到。

## 4. 布局对象

布局（`Layout`）是注册的产物，是带方法的只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `scope` | 布局所属的登记域（§2），只读；登记域名是 `layout.scope.name` |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 列表，按布局顺序（组合字在其组成位之前） |
| `create_ldata(name)` | 创建该布局的一个 ldata（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1） |
| `io_index_table(endian)` | 与设备整块交换用的字节下标表（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）；`endian` 不是四种字节序之一时抛出 `RangeError` |

- `items` 的每一项（`Layout_Tag`）有：`name`；`type`（保持描述中的写法，不改大小写，而 `Ltag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位，总是存在）；`init_value`（如果该 tag 有初值）；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。包含条目已经展开，`includes` 和 `name_prefix` 不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- `Layout` 只作为类型导出，不作为可构造的值导出：布局只由注册产生（§3）；
- 不同登记域可以各有一个同名的布局，它们是不同的布局，各自创建的 ldata 也各有自己的类。所以按布局归类时，要用布局对象，或登记域名加布局名，只按布局名归类会把它们混在一起，例如 `Ldata.on_access` 的观察者（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.8）；
- 布局不公开按名索引表、字节位置、位掩码、编解码器等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 Ltag，与设备交换数据用 `load_tag` / `store_tag` 或 Ltag 的 `load` / `store`（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）。

## 5. 供编辑器使用的类型声明

类型声明让编辑器能补全数据块的 tag。生成它是开发时的事：布局改动后由开发脚本或命令行运行一次，把文本写到代码旁边的文件里，例如 `layout_types.d.ts`；应用运行时用不到它。所以它不在运行时入口 `layout-data` 里，而由开发期入口 `layout-data/dev` 提供，这个入口同时是命令行工具 `layout-types`（§5.1）。

`render_types(descriptions, options)`（从 `layout-data/dev` 导入）由描述生成一份 TypeScript 声明文件（`.d.ts`）的文本。生成类型只需要描述：`descriptions` 与 `register_layout` 接受的相同（§3）；函数在内部创建登记域并注册这些描述，为其中的全部布局生成文本。声明只供编辑器读取类型，所以总是为全部布局生成，不能只为部分布局生成，多出来的类型无害。描述不合法时抛出与 `register_layout` 相同的带 `errors` 的 `Error`。

- 每个布局生成 `<布局>_Tags` 和 `<布局>_Ldata`：前者是接口，布局的 `items` 中每个 tag 一个属性（Bool 是 `boolean`，其余类型都是 `number`；`comment` 成为该属性的文档注释），后者是 `Ldata & <布局>_Tags`；
- 布局名原样使用，大小写不变：布局 `Pump` 生成 `Pump_Tags` 和 `Pump_Ldata`，`my_block` 生成 `my_block_Tags`，`Pump_Station` 生成 `Pump_Station_Tags`。大小写风格由调用者决定，建议用 `Snake_Pascal_Case`，也就是本包类型名的风格，库不强制。它就是 `scope.get_layout("Pump")` 里写的名字，同一登记域里名字不同的两个布局不会生成同名的类型；
- 不同登记域的同名布局生成同名的类型，所以每个登记域生成到自己的文件，由 import 路径区分，例如库的 `lib_a/layout_types.d.ts` 和应用的 `layout_types.d.ts` 各有一个 `Pump_Ldata`；
- 布局名和 tag 名都是标识符（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5），所以原样作为类型名的一部分和属性名。注释里的 `*/` 会被转义，所以生成的文本总是合法的声明文件；
- 文本固定写 `import type { Ldata } from "layout-data";`：`"layout-data"` 是本包的名字，不是一个位置，本包不替调用方决定怎样组织模块。类型在开发时生成，开发者的项目依赖本包，生成的声明由这个项目的编辑器读取，所以它总能解析；
- `options.scope` 是登记域名，只用于头部注释给出的示例（`get_scope("<登记域>")`），默认 `app`，应当写应用里实际使用的登记域名。它也是内部创建的登记域的名字，不合法时抛出与 `create_scope` 相同的异常（§2）；
- `options.source` 是头部注释写出的来源。省略时，描述全由 `yaml_file` 读取则写这些文件名（以 `, ` 连接，[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1），否则头部只说明这是生成的文本。`options` 参数本身可以省略。

在开发脚本里使用函数入口：

```js
import { writeFileSync } from "node:fs";
import { yaml_file } from "layout-data";
import { render_types } from "layout-data/dev";

writeFileSync("layout_types.d.ts", render_types(yaml_file`pump.yaml`, { scope: "app" }));
```

### 5.1 命令行工具 `layout-types`

```
layout-types <描述文件...> [--scope <登记域名>] [-o|--out <输出文件>]
```

命令行只解析参数，再调用 `render_types`：

- 位置参数是描述文件，至少一个。每个文件用 `yaml_file` 读取，得到的描述对象即 `descriptions`；有文件不能读取或解析时，一并报告全部这些文件的错误，什么都不生成；
- `--scope` 即 `options.scope`，默认 `app`；
- `-o`/`--out` 是输出文件，省略时写到标准输出；
- `-h`/`--help` 显示用法，包括版本要求；
- 参数不对、描述不合法时，在标准错误输出写出原因（描述不合法时列出每一条错误），退出码非 0，不写输出文件。

命令行只能处理描述文件。布局在代码里以描述对象给出时，用函数入口写开发脚本。

命令行要求 Node.js >= 24.2（判断入口用 `import.meta.main`）。这只约束生成类型的开发环境：运行时入口和函数入口仍是 Node.js >= 20.11。在更早的 Node.js 上运行命令行时，它不生成任何东西，在标准错误输出说明所需的版本、当前的版本，以及可以改用函数入口，退出码非 0。

怎样使用这些类型。`scope.get_layout("Pump").create_ldata("pump_1")` 的类型是 `Ldata`：`create_ldata` 的声明不能随布局返回不同的类型，所以值的类型要手工指定一次。在 JavaScript 里用 JSDoc 类型转换就够了，编辑器能据此补全 tag；文件开启检查（`checkJs` 或 `// @ts-check`）时，还能指出拼错的 tag 和类型不对的值：

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // 会补全，且知道它是数字
```

括号是 JSDoc 类型转换的一部分。把 `/** @type {...} */` 写在 `const pump = scope.get_layout("Pump").create_ldata(...)` 上面也能补全，但开启检查的文件会报“`Ldata` 不能赋给 `Pump_Ldata`”。

在 TypeScript 里写 `const pump = scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`。

## 6. 错误

YAML 的读取、登记域的创建、布局的注册、查找和类型声明生成出错时抛出异常：

| 情况 | 异常 |
| --- | --- |
| `create_scope` 的登记域名不是字符串 | `TypeError`（§2） |
| `create_scope` 的登记域名不是标识符，或已被别的登记域使用 | `Error`（§2） |
| `yaml` 或 `yaml_file` 的文本不是合法的 YAML，或文件不能读取 | 带 `errors` 的 `Error`（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1） |
| `yaml` 或 `yaml_file` 的参数不是文本、路径或 `file:` URL | `TypeError`（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1） |
| `scope.get_layout` 的名字在该登记域中未登记 | `Error`（`unknown layout X.Y`，§3） |
| 描述不合法（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5），包括 tag 名是保留名 | `scope.register_layout` 抛出带 `errors` 的 `Error`，什么都不登记（§3） |
| `scope.register_layout` 在该登记域成功登记之后再次调用 | `Error`，第一次登记的布局保持不变（§3） |
| `layout-data/dev` 的 `render_types` 的描述不合法，或 `options.scope` 不是合法的登记域名 | 与 `scope.register_layout`、`create_scope` 相同（§5） |

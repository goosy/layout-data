# 布局规范

> 本文规定登记域、注册，以及注册得到的布局：布局对象的属性和方法、布局对 ldata 的管理、由布局生成的类型声明，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。布局在注册之前的形式，即描述的结构、条目和必须满足的规则，以及 `yaml`、`desc_file` 的编译，见 [spec-description.zh-cn.md](spec-description.zh-cn.md)。由布局创建的数据对象（Ldata / Ltag）见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 流程

流程是**编译描述，注册到登记域，取得布局，由布局创建和查找 ldata**：先描述布局（[spec-description.zh-cn.md](spec-description.zh-cn.md)），用 `yaml` 或 `desc_file` 读入并编译，创建一个登记域，用它的 `register_layout` 注册（§3），此后用登记域的 `get_layout("Pump")` 按名取得布局（§4），再用它的 `create_ldata("pump_1")` 创建数据块（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1），用 `get_ldata("pump_1")` 按名找到它。描述中的 `blocks` 在注册时由本包创建 ldata。

```js
import { create_scope, desc_file, get_scope } from "layout-data";
const scope = create_scope("lib_a");                          // create a scope
const { ldata } = scope.register_layout(desc_file`pump.yaml`); // register, creating the ldata of its blocks
const pump = scope.get_layout("Pump").create_ldata("pump_9"); // from then on, get the layout and create
get_scope("lib_a").get_layout("Pump").get_ldata("pump_9");    // elsewhere, find the ldata by its names
```

## 2. 登记域

登记域（`Layout_Scope`）管理一组布局，是布局名的分隔单位，让基于 layout-data 的库能自带并自己注册布局，应用可以在同一进程里组合多个这样的库。

- 布局名在登记域内唯一，一个布局只属于一个登记域；不同登记域里的同名布局互不冲突。同一份 `Description` 注册进两个登记域，得到两个互不相关的布局；
- **布局只注册到显式创建的登记域里。** 库和应用都创建自己的登记域，注册和取得布局都通过登记域的方法；本包不设默认登记域；
- `create_scope(name)` 创建登记域。登记域名和布局名一样必须是 JavaScript 的标识符（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5.1），所以不含 `.`；包名这类含 `@`、`/`、`-` 的字符串不能直接用作登记域名。登记域名在进程内唯一，由创建它的库或应用选择；不是字符串时抛出 `TypeError`，不是标识符时抛出 `Error`，已被别的登记域使用时抛出 `Error`（`a scope is already named X`）。登记域创建后一直存在，不能删除；
- `get_scope(name)` 返回已创建的那个登记域，没有这个名字的登记域时返回 `undefined`，所以也可以用来判断登记域是否存在；
- 登记域的成员：只读的 `name`，即登记域名；`register_layout(descriptions)`，注册布局并创建块的 ldata（§3）；`get_layout(name)`，按布局名（不带登记域名）取得本登记域的布局。登记域对象是冻结的：任何模块都能按名取得它，但不能替换它的方法和属性，修改抛出 `TypeError`。`Layout_Scope` 只作为类型导出，登记域只由 `create_scope` 产生；
- 布局的 `scope` 是它所属的登记域（§4）。错误信息写成 `登记域名.布局名` 来指出布局，例如 `unknown layout lib_a.Pump`、`lib_a.Pump: changes do not settle after 16 rounds`；布局名本身仍是 `Pump`；
- 谁可以向哪个登记域注册，本包不作规定：任何取得登记域的一方都能向它注册，可以注册多次。库要防止别人在自己的登记域里注册冲突的布局，就在创建登记域时立即注册自己的布局，例如在模块顶层创建后紧接着注册：此后同名而结构不同的布局在这个登记域里注册不进去（§3）。库与使用方如何交互，由库自行约定。

## 3. 注册

`scope.register_layout(descriptions)` 把各描述中的布局注册到登记域，再创建各描述中的块的 ldata。布局注册之后才能使用。描述怎样引入、遍历和校验，见 [spec-description.zh-cn.md](spec-description.zh-cn.md) §4、§5，这些在 `yaml` 和 `desc_file` 读入时已经完成。

- `descriptions`：一个 `Description`，或 `Description` 的列表（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.2）。列表里不能再放列表，空列表是错误。`Description` 只由 `yaml` 和 `desc_file` 产生：注册不读文件，也不解析 YAML，字符串、手写的对象或其他值都不是描述；
- **可以多次调用。** 每份描述是独立编译的，所以一个登记域可以分多次注册，每次调用按下面的规则，对每个布局绑定、复用或报错；
- **布局按指纹判断是否相同。** 每个布局有一个指纹，只由编译出的结构决定：按布局顺序的各 tag 的名字、类型、偏移、初值；不含布局名和注释。布局是否相同以指纹为准，布局名只用于查找和定位。指纹是内部的，不对外提供，也只在一个登记域内比较：本包不持有跨登记域的指纹表。注册一个布局时：
  - 登记域中已有指纹相同的布局：名字也相同就复用已有的布局，不生成新布局；名字不同是违规；
  - 登记域中没有指纹相同的布局：名字与已有布局相同是违规，否则由 `Description` 中的布局生成一个绑定到这个登记域的新布局；
  - 同一次调用中先注册的布局，对后注册的布局而言也是"已有"的；
- 布局名就是描述中 `layouts` 列出的名字，注册时不能改；
- **块。** 一次调用先注册其中全部描述的布局，再创建全部描述的块，所以块可以引用同一次调用中另一份描述的布局。每个块在 `layout`（`<登记域名>.<布局名>`）所指的布局上创建一个以块名为名的 ldata，由该布局按名管理（§4）。块名在同一次调用的各描述之间也不能重复，因为它们合并在返回值的同一个索引里。以下是违规：
  - 没有 `<登记域名>` 这个登记域，或该登记域中没有这个布局（本次调用注册进本登记域的布局算在内）；
  - 块名与该布局已有的 ldata 重名，包括在同一个登记域里再次注册含同样 `blocks` 的描述：布局按指纹复用，块却不复用，这是配置错误。同一份描述要创建多组同名实例，要把布局注册进不同的登记域，块中写的登记域名也随之不同，这由调用方安排；
- **全部生效或全部不生效。** 有任何违规时抛出 `Error`，其 `errors` 属性列出本次调用的全部违规项，登记域保持调用前的状态：不登记任何布局，不创建任何 ldata，已有的布局与 ldata 都不变。错误的标题写出登记域名（如 `invalid layout descriptions of scope lib_a`），各项错误写出出错的布局或块，以及它所在的描述（`desc_file` 读入的用文件路径，其他用它在列表中的位置，如 `description #2`）；
- 传入的 `Description` 不会被修改：每次都由其中的布局生成新的已绑定布局，或复用登记域中指纹相同的已有布局；
- 返回值：`{ layouts, ldata }`。`layouts` 按布局名索引本次注册的布局（已绑定到本登记域，复用的就是登记域中已有的那个），与 `scope.get_layout(name)` 返回的相同；`ldata` 按块名索引本次由 `blocks` 创建的 ldata；
- 布局在进程的整个生命期内保持登记。`scope.get_layout(name)` 返回已登记的布局（§4），名字未登记时抛出 `unknown layout X.Y`（X 是登记域名，Y 是布局名）；
- 改过的布局文件，结构不同而名字相同，注册不进原来的登记域，只在新进程或新登记域里生效（没有热重载）；
- 依赖树里有两份本包时（例如不同版本各装一份），两份互不相通：各有自己的登记域，用一份注册的布局，另一份按名找不到，一份编译的 `Description` 也不能交给另一份注册。

## 4. 布局对象

布局（`Layout`）是注册的产物，是带方法的只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `scope` | 布局所属的登记域（§2），只读；登记域名是 `layout.scope.name` |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 列表，按布局顺序（组合字在其组成位之前） |
| `create_ldata(name)` | 创建该布局的一个 ldata（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1），由布局按名管理 |
| `get_ldata(name)` | 按名取得该布局创建的 ldata |
| `delete_ldata(name)` | 解除名字到 ldata 的绑定，交还这个名字 |
| `io_index_table(endian)` | 与设备整块交换用的字节下标表（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）；`endian` 不是四种字节序之一时抛出 `RangeError` |

- `items` 的每一项（`Layout_Tag`）有：`name`；`type`（保持描述中的写法，不改大小写，而 `Ltag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位，总是存在）；`init_value`（如果该 tag 有初值）；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。包含条目已经展开，`includes` 和 `name_prefix` 不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- `Layout` 只作为类型导出，不作为可构造的值导出：布局只由注册产生（§3）。`Description` 中尚未绑定登记域的布局是 `Layout_Desc`，即没有 `scope` 的 `Layout`（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.2），它不能创建 ldata；
- 不同登记域可以各有一个同名的布局，它们是不同的布局，各自创建的 ldata 也各有自己的类。所以按布局归类时，要用布局对象，或登记域名加布局名，只按布局名归类会把它们混在一起，例如 `Ldata.on_access` 的观察者（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.8）；
- 布局不公开按名索引表、字节位置、位掩码、编解码器、指纹等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 Ltag，与设备交换数据用 `load_tag` / `store_tag` 或 Ltag 的 `load` / `store`（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）。

### 4.1 布局管理 ldata

一个 ldata 只属于一个布局（`ldata.layout`），布局按名管理它创建的 ldata：

- ldata 名在它的布局内唯一。`create_ldata(name)` 遇到该布局已有的名字时抛出 `Error`（`ldata X.Y.Z already exists`，X 是登记域名，Y 是布局名，Z 是 ldata 名）。不同布局的 ldata 可以同名，包括不同登记域里同名布局的 ldata；需要多组同名实例时，把布局注册进不同的登记域，各登记域的布局各自管理自己的实例；
- `get_ldata(name)` 返回这个布局以该名字创建、且尚未解除绑定的 ldata，没有时抛出 `Error`（`unknown ldata X.Y.Z`），与 `get_layout` 一致。注册时由 `blocks` 创建的 ldata 也由布局管理，同样能这样找到；
- `delete_ldata(name)` 从布局中删除这个名字到 ldata 的绑定，返回值与 `Map.prototype.delete` 相同：删除了绑定返回 `true`；名字不存在时什么也不做，返回 `false`。之后 `get_ldata(name)` 找不到它，这个名字在该布局中可以再次使用，`create_ldata` 与注册 `blocks` 不再因它报重名；布局不再持有它，调用方丢掉引用后它即可被回收；
- `delete_ldata` 只解除名字绑定，ldata 本身不受影响：仍可读写，事件照常，`ldata.layout` 不变。本包不提供消除 ldata 自身的能力，也不提供销毁登记域的方法；
- 布局以普通的强引用持有它的 ldata：名字的占用只由 `delete_ldata` 解除，与垃圾回收无关。所以按名找到的 ldata 不会在被找到之前被回收；忘记删除时，再用这个名字总会报重名；
- 在同一进程里重建实例的使用方（例如测试反复创建、停止设备模拟器），在停止时对注册结果 `ldata` 中的每个 ldata 调用其布局的 `delete_ldata`，交还这些名字。

## 5. 供编辑器使用的类型声明

类型声明让编辑器能补全数据块的 tag。生成它是开发时的事：布局改动后由开发脚本或命令行运行一次，把文本写到代码旁边的文件里，例如 `layout_types.d.ts`；应用运行时用不到它。所以它不在运行时入口 `layout-data` 里，而由开发期入口 `layout-data/dev` 提供，这个入口同时是命令行工具 `layout-types`（§5.1）。

`render_types(descriptions, options)`（从 `layout-data/dev` 导入）由描述生成一份 TypeScript 声明文件（`.d.ts`）的文本。生成类型只需要描述：`descriptions` 与 `register_layout` 接受的相同（§3），即 `yaml` 或 `desc_file` 的返回值；函数为其中的全部布局生成文本，不创建登记域，也不创建块的 ldata。各描述的布局按注册进同一个空登记域的规则合并（§3）：同名而结构不同、或结构相同而名字不同，都是违规，抛出与 `register_layout` 相同的带 `errors` 的 `Error`；同名且结构相同的布局只生成一次。声明只供编辑器读取类型，所以总是为全部布局生成，不能只为部分布局生成，多出来的类型无害。

- 每个布局生成 `<布局>_Tags` 和 `<布局>_Ldata`：前者是接口，布局的 `items` 中每个 tag 一个属性（Bool 是 `boolean`，其余类型都是 `number`；`comment` 成为该属性的文档注释），后者是 `Ldata & <布局>_Tags`；
- 布局名原样使用，大小写不变：布局 `Pump` 生成 `Pump_Tags` 和 `Pump_Ldata`，`my_block` 生成 `my_block_Tags`，`Pump_Station` 生成 `Pump_Station_Tags`。大小写风格由调用者决定，建议用 `Snake_Pascal_Case`，也就是本包类型名的风格，库不强制。它就是 `scope.get_layout("Pump")` 里写的名字，同一登记域里名字不同的两个布局不会生成同名的类型；
- 不同登记域的同名布局生成同名的类型，所以每个登记域生成到自己的文件，由 import 路径区分，例如库的 `lib_a/layout_types.d.ts` 和应用的 `layout_types.d.ts` 各有一个 `Pump_Ldata`；
- 布局名和 tag 名都是标识符（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5），所以原样作为类型名的一部分和属性名。注释里的 `*/` 会被转义，所以生成的文本总是合法的声明文件；
- 文本固定写 `import type { Ldata } from "layout-data";`：`"layout-data"` 是本包的名字，不是一个位置，本包不替调用方决定怎样组织模块。类型在开发时生成，开发者的项目依赖本包，生成的声明由这个项目的编辑器读取，所以它总能解析；
- `options.scope` 是登记域名，只用于头部注释给出的示例（`get_scope("<登记域>")`）和错误的标题，默认 `app`，应当写应用里实际使用的登记域名。它按 `create_scope` 的规则检查，不合法时抛出相同的异常（§2），但不创建登记域，也不要求这个名字未被使用；
- `options.source` 是头部注释写出的来源。省略时，描述全由 `desc_file` 读取则写这些文件名（以 `, ` 连接，[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.2），否则头部只说明这是生成的文本。`options` 参数本身可以省略。

在开发脚本里使用函数入口：

```js
import { writeFileSync } from "node:fs";
import { desc_file } from "layout-data";
import { render_types } from "layout-data/dev";

writeFileSync("layout_types.d.ts", render_types(desc_file`pump.yaml`, { scope: "app" }));
```

### 5.1 命令行工具 `layout-types`

```
layout-types <描述文件...> [--scope <登记域名>] [-o|--out <输出文件>]
```

命令行只解析参数，再调用 `render_types`：

- 位置参数是描述文件，至少一个。每个文件用 `desc_file` 读取，得到的 `Description` 即 `descriptions`；有文件不能读取、解析或编译时，一并报告全部这些文件的错误，什么都不生成；
- `--scope` 即 `options.scope`，默认 `app`；
- `-o`/`--out` 是输出文件，省略时写到标准输出；
- `-h`/`--help` 显示用法，包括版本要求；
- 参数不对、描述不合法时，在标准错误输出写出原因（描述不合法时列出每一条错误），退出码非 0，不写输出文件。

命令行只能处理描述文件。描述写在代码里时，用函数入口写开发脚本。

命令行要求 Node.js >= 24.2（判断入口用 `import.meta.main`）。这只约束生成类型的开发环境：运行时入口和函数入口仍是 Node.js >= 20.11。在更早的 Node.js 上运行命令行时，它不生成任何东西，在标准错误输出说明所需的版本、当前的版本，以及可以改用函数入口，退出码非 0。

怎样使用这些类型。`scope.get_layout("Pump").create_ldata("pump_1")` 的类型是 `Ldata`：`create_ldata` 的声明不能随布局返回不同的类型，所以值的类型要手工指定一次。在 JavaScript 里用 JSDoc 类型转换就够了，编辑器能据此补全 tag；文件开启检查（`checkJs` 或 `// @ts-check`）时，还能指出拼错的 tag 和类型不对的值：

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

括号是 JSDoc 类型转换的一部分。把 `/** @type {...} */` 写在 `const pump = scope.get_layout("Pump").create_ldata(...)` 上面也能补全，但开启检查的文件会报“`Ldata` 不能赋给 `Pump_Ldata`”。

在 TypeScript 里写 `const pump = scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`。

## 6. 错误

描述的读入、登记域的创建、布局的注册、查找、ldata 的创建与查找和类型声明生成出错时抛出异常：

| 情况 | 异常 |
| --- | --- |
| `create_scope` 的登记域名不是字符串 | `TypeError`（§2） |
| `create_scope` 的登记域名不是标识符，或已被别的登记域使用 | `Error`（§2） |
| `yaml` 或 `desc_file` 的文本不是合法的 YAML，文件不能读取，或描述不合法（[spec-description.zh-cn.md](spec-description.zh-cn.md) §5），包括 tag 名是保留名 | 带 `errors` 的 `Error`（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1） |
| `yaml` 或 `desc_file` 的参数不是文本、路径或 `file:` URL | `TypeError`（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1） |
| `scope.register_layout` 的参数不是 `Description` 或其列表，布局与登记域中已有的布局冲突，或块引用的布局不存在、块名重复 | 带 `errors` 的 `Error`，登记域保持调用前的状态（§3） |
| `scope.get_layout` 的名字在该登记域中未登记 | `Error`（`unknown layout X.Y`，§3） |
| `create_ldata` 的名字已被该布局使用 | `Error`（`ldata X.Y.Z already exists`，§4.1） |
| `create_ldata` 用于 `Description` 中尚未绑定登记域的布局 | `Error`（§4） |
| `get_ldata` 的名字在该布局中没有 ldata | `Error`（`unknown ldata X.Y.Z`，§4.1） |
| `layout-data/dev` 的 `render_types` 的描述冲突，或 `options.scope` 不是合法的登记域名 | 与 `scope.register_layout`、`create_scope` 相同（§5） |

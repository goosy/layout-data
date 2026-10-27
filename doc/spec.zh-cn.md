# layout-data 规范

## 1. 目标与范围

layout-data 是一个结构化数据块库：提供基于 `Buffer`、面向数据流动的、可响应的结构化数据块。

- 数据块按固定布局存放，布局可由 YAML 描述文件给出；
- 能通过名称读写 tag 的值，并订阅 tag 的变化；
- 提供布局的校验、字节序转换函数和类型声明生成；
- 以库的形式发布，可被控制器、设备模拟器等程序共用。

不在范围内：设备通信、调度、业务规则、日志。这些由使用方负责。

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 描述 | 即布局描述：根键 `layouts` 列出布局名，根键 `item_tables` 是名字到条目表的映射，其余根键不读取（[spec-description.zh-cn.md](spec-description.zh-cn.md) §2）。注册接受的是描述对象；同一结构写成的 YAML 1.2 文本，无论在描述文件里还是在代码里，由 `yaml_file` 或 `yaml` 变成描述对象 |
| 条目表 | 描述中位于 `item_tables` 下的具名条目列表。列在 `layouts` 里时注册为布局；被条目的 `includes` 或 `coupling` 引用时，它的条目被拼接进来；一个条目表可以两者都是 |
| 布局 | 一块数据的固定格式：每个 tag 的名称、类型、位偏移、初值。由列在 `layouts` 里的条目表注册而来，注册后不可变，即公开的 `Layout` 对象 |
| 登记域 | 布局名的分隔单位，即公开的 `Layout_Scope` 对象：每个登记域有自己的布局和条目表，各注册一次，布局名和条目表名只在登记域内唯一。布局只能注册到显式创建的登记域里（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §2） |
| Ldata / ldata | Ldata 是数据对象的类，ldata 是它的实例：按某个布局分配的一块数据，内部按大端存放 |
| Ltag | ldata 中一个具名 tag 的操作接口 |
| 组合字 | 由若干 Bool 组成的 Word，与各组成位共用同一块数据 |

## 3. 数据块要求

- **固定布局**：每个 tag 有确定的类型、字节偏移和位号。
- **布局合法**：布局必须满足下列规则，不合法的布局视为程序错误，校验报告全部违规项：
  - 布局名是 JavaScript 的标识符（见 [spec-description.zh-cn.md](spec-description.zh-cn.md) §5）；
  - tag 名是标识符（字母、数字和 `_`，不以数字开头），同一 ldata 内互不相同，且不是保留名（见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10 和 [spec-description.zh-cn.md](spec-description.zh-cn.md) §3）；
  - 每个 tag 的位长与其类型一致；多字节类型（Int、UInt、Word、DInt、UDInt、DWord、Real）从偶数字节开始，单字节类型（Byte、SInt、USInt）从整字节开始，Bool 可以位于任意位；
  - 非 Bool 的 tag 之间字节范围互不重叠；
  - 每一位最多属于一个 Bool tag；
  - Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；反过来，组合字的每个组成位都必须落在该字的范围内；
  - 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 false），整字的初值由它们合成；双方都不给出时，组合字与组成位都没有初值；
  - 数据块总长是整数个寄存器（16 位的整数倍）。
- **组合字位号**：16 位组合字中，字值的第 k 位就是寄存器的 bit k，由布局中各位的偏移编号保证；内部不为组合字额外交换字节。
- **字节序**：内部统一按大端存放；设备字节序（`BE`、`LE`、`BEBS`、`LEBS`）只在与设备交换数据的边界上转换，包提供按 tag 的转换（Ldata 的 `load_tag`、`store_tag`，Ltag 的 `load`、`store`）和整块交换用的字节下标表（布局的 `io_index_table`）。设备字节序对 Bool 和单字节 tag 以其所在的 16 位寄存器为单位生效。
- **按名访问**：程序按名称读写 tag 的值；任何时候都可以读写。编程接口见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)。
- **原始读写**：ldata 的字节只能通过接口读写，按 tag 或按字节偏移的原始读写（`read_bytes`、`write_bytes`、`read_bit`、`write_bit`）；内部缓冲区不公开，所以每一次写入都被看到，变化不会遗漏。带类型的访问走 tag，不带类型的访问走字节。
- **变化事件**：tag 的值发生变化时（无论来自程序赋值还是原始写入）发出变化事件，事件在新值生效后发出。
- **事务**：一组写入可以作为一个整体：事务期间不发出事件，结束时统一发出；`fn` 失败时撤销全部写入。事务只作用于单个 ldata 的数据，详见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §4.2。
- **组合字联动**：组合字与其中各位双向联动。
- **出错**：出错时抛出异常，不写日志、不退出进程。

## 4. 布局描述

布局由描述给出，即在代码中写出、或从 YAML 1.2 描述文件和文本读出的描述对象，结构见 [spec-description.zh-cn.md](spec-description.zh-cn.md)，注册见 [spec-layout.zh-cn.md](spec-layout.zh-cn.md)。

## 5. 发布形态

- 以 ES 模块库发布，运行时入口 `layout-data`，`yaml` 为运行时依赖；
- 开发期入口 `layout-data/dev` 提供类型声明的生成，同一文件也是命令行工具 `layout-types`（`package.json` 的 `bin`），见 [spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5；
- 发布的是打包产物：两个入口各自打包为一个独立的文件（`dist/index.js`、`dist/dev.js`），互不依赖。依赖不打包：`yaml` 和 Node.js 内置模块在产物中保留为 `import`，由使用方的包管理器安装 `yaml`；
- 类型声明由源码的 JSDoc 生成（`src/typedefs.js` 与各函数的注释是唯一来源），随构建输出到 `dist`，与两个入口的产物并排，不手写 `.d.ts`；
- Node.js >= 20.11；命令行工具 `layout-types` 要求 Node.js >= 24.2，这只约束生成类型的开发环境；
- 许可证：MPL-2.0（见 `LICENSE`）。本库可作为任意许可证产品的组成部分；对本库文件的修改须以 MPL-2.0 公开，并须保留版权声明。名称 "layout-data" 不在授权范围内（MPL-2.0 §2.3）。

## 6. 公开接口一览

入口 `layout-data` 导出：

| 导出 | 说明 |
| --- | --- |
| `Ldata`、`Ltag` | 数据对象和 tag 句柄（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2 和 §3）；ldata 由布局的 `create_ldata` 创建，`Ldata` 不能用 `new` 构造 |
| `create_scope` | 创建登记域（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §2）。登记域的 `register_layout` 注册各描述对象中的布局，每个登记域一次；`get_layout` 按名取得已登记的布局，由布局创建 ldata。`Layout_Scope` 只作为类型导出 |
| `get_scope` | 按登记域名取得已创建的登记域，没有时为 `undefined`（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §2） |
| `yaml`、`yaml_file` | 把 YAML 1.2 文本或描述文件变成描述对象（[spec-description.zh-cn.md](spec-description.zh-cn.md) §1.1）；两者也是模板字面量的标签 |

开发期入口 `layout-data/dev` 导出：

| 导出 | 说明 |
| --- | --- |
| `render_types` | `render_types(descriptions, options)` 由描述对象（与 `register_layout` 接受的相同）为其中的全部布局生成 TypeScript 类型声明的文本，供编辑器补全（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5）；命令行工具 `layout-types` 做同样的事（同文 §5.1） |

布局带有方法 `create_ldata` 和 `io_index_table`（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §4），`Layout` 只作为类型导出。

## 7. 文档

- 中文文档带 `.zh-cn` 后缀，英文文档无后缀；以中文为主：本文、[spec-description.zh-cn.md](spec-description.zh-cn.md)（描述：条目表、`layouts`、条目、遍历）、[spec-layout.zh-cn.md](spec-layout.zh-cn.md)（布局：登记域、注册、布局对象、类型声明）、[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)（数据对象：Ldata、Ltag、事件）、[design.zh-cn.md](design.zh-cn.md)；
- 英文版为同名无后缀文件（[spec.md](spec.md)），内容与中文版对应，修改规范时两种语言同步更新；
- 使用入门见项目根目录的 [README.md](../README.md)。

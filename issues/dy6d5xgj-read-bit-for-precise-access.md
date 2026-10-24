---
id: dy6d5xgj
opened: 2026-10-24T02:34:21.022Z
closed: 2026-10-24T03:50:14.000Z
title: 增加 read_bit，使按位读取的 access 只报告被读的 Bool
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [3354983]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

原始读写在位粒度上不对称：写有 `write_bit(offset, mask, value)`，读只有 `read_bytes`。spec-data-api §2.5 写明没有 `read_bit` 的理由：取一个位的值可以用 `read_bytes(offset, 1)[0] & mask`，而 `write_bit` 存在是因为读-改-写需要一步完成。

就取值而言这个理由成立，但它没有考虑 `access`（§2.8）。`access` 报告一次访问涉及哪些 tag，是诊断手段，例如核对一条规则声明的依赖与它实际的依赖。按 §2.8 的表：

- `write_bit` 报告"那个字节的 tag，但不含位不在 `mask` 中的 Bool"，是精确的；
- `read_bytes(offset, 1)` 报告"在范围内有字节的 tag"，同一字节里的所有 Bool 都被报为被读。

所以按位读取的调用方无法让 `access` 区分读的是哪个 Bool 的状态，诊断会出现假依赖。

实例：modbus_emulator 读线圈（FC1 / FC2）时每个线圈调用一次 `read_bytes(offset, 1)`。读线圈 17（不是 `alarm` 的位）时，`access` 也报告了 `alarm`。

非 Bool 的 tag 按字节对齐，按字节报告本身是精确的，问题只出在同一字节内的 Bool 上。

## 解决提案

增加 `read_bit(offset, mask)`，与 `write_bit` 对称。增加掩码的主要目的是让 `access` 区分读的是哪些位的状态，取值的便利是次要的。

- 返回 `(byte & mask) !== 0`。`offset`、`mask` 的检查与 `write_bit` 相同（`mask` 为 1..0xff 的整数，否则 `RangeError`）。多位 `mask` 时返回"任一位被置位"。
- `access`：`kind` 为 `read`，`tags` 与 `write_bit` 的规则相同，即那个字节的 tag，但不含位不在 `mask` 中的 Bool。一个组合字与它的位共享字节，所以读一个位也会报告那个字。
- 修改 §2.5 中"没有 `read_bit`"的说明，§2.8 的表增加一行。这是只增不改的新增方法。

与 issue#jt0zxgth（`access` 纳入 `transaction`）配合：一次逻辑读要读多个位时，调用方在事务中逐个调用 `read_bit`，既精确又只发出一次 `access`。

放弃的方案：多字节带掩码的读取（如 `read_bits(offset, masks)`）：接口更重；有 issue#jt0zxgth 之后，逐位调用 `read_bit` 已能满足需要。

## 裁定

接受，按提案实现。`read_bit` 返回布尔值：与 `write_bit` 的 `value` 对称，多位 `mask` 时含义为"任一位被置位"；需要各位的值时用 `read_bytes`。

`read_bit` 是字符串名的实例方法，违反 spec-data-api §2.10 "以后只增加 `Symbol` 为键的成员或静态方法"的承诺：它加入保留名，名为 `read_bit` 的 tag 不再合法。静态方法 `Ldata.read_bit(data, offset, mask)` 能守住承诺，但与 `write_bit` 不对称，所以不采用。这条承诺本应从 1.0 起才固定，所以改为从 1.0 起生效。

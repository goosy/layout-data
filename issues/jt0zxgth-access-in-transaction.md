---
id: jt0zxgth
opened: 2026-10-24T02:34:21.133Z
closed: 2026-10-24T05:06:41.000Z
title: 把 access 纳入 transaction
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [00a5925]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

spec-data-api §2.8 规定：事务内的读写"emit it at once, as usual"，即 `access` 在每次调用时立即发出；§4.2 的事务只推迟 `change` 和 `write`。由此产生两个问题：

- 次数：一个事务内调用几次读写方法，就发出几次 `access`，同一个 tag 会重复出现。事务表示一个逻辑步骤，`change` 和 `write` 已经按步骤合并，`access` 却仍暴露步骤内部的每一次调用，三者口径不一致。
- 回滚：被回滚的写入并没有生效，但它的 `access write` 已经发出。诊断会报告一个不存在的写依赖。

实测：事务内分两次 `write_bytes` 写一个 Real 的两半，再 `read_bytes` 一次，依次发出 `access write`、`access write`、`access read`，提交时才发出一次 `change` 和一次 `write`；事务内写入后抛出异常回滚，`access write` 仍已发出。

实例：modbus_emulator 处理主站的一次请求，对每个块用一个事务读写。主站的一次请求是一次逻辑访问，但现在一次 FC1 读 16 个线圈会发出 16 次 `access`。

## 解决提案

事务内的 `access` 先不发出：按 `read` / `write` 分别累积涉及的 tag（取并集），事务结束时每种至多发出一次。

意义：

- 与事务的含义一致：事务把一组读写变成一个整体，`change` 和 `write` 已按整体发出，`access` 也应如此。观察者看到的是一个逻辑步骤访问了哪些 tag，而不是它内部调用了几次方法。
- 诊断准确：被回滚的写入不再报告。
- 精确与次数可以兼得：调用方可以用细粒度的精确方法（逐字节 `write_bit`、逐位 `read_bit`，见 issue#dy6d5xgj）得到精确的 tag 集合，而 `access` 次数不随调用次数增加。现在调用方只能二选一：要么调用多次（精确但重复），要么一次 `read_bytes` / `write_bytes` 覆盖整段（一次但把同字节的 Bool 都算进来）。
- 开销：监听器每个事务每种只被调用一次。

语义：

- 提交：先发出累积的 `access`（先 `read` 后 `write`，`tags` 按布局顺序、不重复），再进行检测、发出 `change`，最后发出 `write`，与事务外"`access` 在检测之前"的顺序一致。
- 回滚：`access write` 丢弃，因为写入已撤销；`access read` 照常发出，因为读取确实发生过。原异常照常重新抛出；此时 `access` 监听器抛出的异常丢弃，以 `fn` 的异常为准（§4.4 "其他异常丢弃"）。
- 监听器的异常：在事务内，`access` 监听器的异常改为在提交时由 `transaction` 抛出，与提交时 `change` / `write` 监听器的异常规则（§4.2、§4.4）一致；事务已提交，不回滚。事务外的行为不变：读取抛出监听器的异常，不返回值。
- 不变的部分：`access` 监听器运行期间的访问不发出事件；类级监听器（`Ldata.on_access`）按同样规则推迟；事务只管本 ldata，事务内访问其他 ldata 照常发出。

监听器否决读取的能力：推迟之后，事务内的 `access read` 监听器不能再通过抛出异常让一次读取失败。认为这种能力没有必要：

- `access` 的定位是诊断（§2.8），不是控制读取的手段；读取抛出监听器的异常，是 §4.4 统一异常规则的结果，不是专门设计的否决功能。
- 需要在读取前介入时，本仓库的计划是单独设计一个同步的读钩子（如 `before_read`，`read` 事件名已为此保留），不应依赖 `access`。

这是对已发布版本的行为变化，需修改 §2.8、§4.2、§4.4 并写入 CHANGELOG。

## 裁定

接受，按提案实现。事务内立即发出 `access` 与事务按整体发出 `change`、`write` 不一致，回滚后仍报告写依赖是错误的诊断。推迟后 `access read` 监听器不能再否决事务内的读取：`access` 定位于诊断，读前介入另设读钩子，所以放弃这种能力。

提案未写明的两点，一并确定：

- 只有访问发生时有 `access` 监听器（实例的或类级的），这次访问才累积，所以没有监听器时每次访问仍只多一次检查；提交时发给当时已订阅的监听器，与提交时的 `change`、`write` 相同。
- `access` 监听器运行期间的访问不发出事件，也不累积；监听器内开启的事务，提交时不发出 `access`。

提交时 `access` 监听器写同一个 ldata 会提前触发检测，这在事务外已是如此，不属于本 issue。

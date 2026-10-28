---
id: jmj5szaj
opened: 2026-10-28T10:41:19.825Z
closed:
title: 布局解除 ldata 的名字绑定，交还它在布局中占用的名字
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title: 问题描述
proposal_title: 解决提案
decision_title: 裁定
---

## 问题描述

issue#yxhoe1w3 让布局按名字管理它的 ldata（`layout.get_ldata(name)`，ldata 名在布局内唯一），布局因此持有它建出的每个 ldata；布局归域，域存在到进程结束。于是建出的 ldata 永远不会被回收，它的名字也永远被占用。此前布局不持有 ldata，调用方丢掉引用即可回收，本包不需要释放；现在本包持有了 ldata，就要给出放手的途径。yxhoe1w3 明确把这件事留给本 issue，并要求持有方式为它留出余地。

实际受影响的用法：

- modbus-emulator 的测试在同一进程里反复创建 emulator，每次用同一个域、同样的 `blocks`（`test/emulator_test.js` 的 `make()`）。第二次创建时布局按指纹复用，块名已被第一次建出的 ldata 占用，注册报错。
- 改为每次换一个域名只是转移问题：域同样不能释放。
- emulator 已有 `stop()`，却无法把它建出的 ldata 交还。生产中的重启是 pm2 重启进程，不受影响；受影响的是测试，以及在同一进程里重建实例的用法。

## 解决提案

- 目标只是解除名字绑定：新增 `layout.delete_ldata(name)`（与 `create_ldata`、`get_ldata` 对称），从布局中删除这个名字到 ldata 的绑定。之后：
  - `layout.get_ldata(name)` 查不到它（抛出 `unknown ldata X.Y.Z`）；
  - 这个名字在该布局中可以再次使用，`create_ldata` 与注册 `blocks` 不再因它报重名；
  - 布局不再持有它，调用方丢掉引用后即可被回收。
- 返回值与 `Map.prototype.delete` 相同：删除了绑定返回 `true`；名字不存在时什么也不做，返回 `false`。
- ldata 本身不受影响：仍可读写，事件照常，`ldata.layout` 不变。消除 ldata 自身的能力（如停止响应）不是本 issue 的目标，目前没有必要，所以不提供 `ldata.release()`。
- 布局以普通的强引用持有 ldata，名字的占用只由 `layout.delete_ldata` 解除。
- 整个域的销毁（连同其布局与 ldata）不在本 issue 内，目前没有实际需要，spec 也不为此另加声明。
- 调用方按注册结果解除：`register_layout` 返回的 `ldata` 就是本次建出的一组，如 emulator 在 `stop()` 中对每个 ldata 调用其布局的 `delete_ldata`。

否决的方案：

- 布局以弱引用持有 ldata（`Map<string, WeakRef<Ldata>>`；`WeakMap` 的键不能是字符串，无法按名字查找），无论是否另有显式删除：按名字查找让调用方不必自己保存引用，注册时由 `blocks` 建出的 ldata 常常只由布局持有，弱持有会让它在被查到之前就被回收，状态与监听随之丢失。另外，调用方忘记删除时，名字是否还被占用取决于垃圾回收是否已发生，错误时有时无；强持有下忘记删除总会报重名，容易发现。
- 方法名用 `layout.delete(name)`：布局上还有 `create_ldata`、`get_ldata`、`io_index_table` 等成员，单写 `delete` 读起来像删除布局本身。
- 同时提供 `ldata.release()` 消除 ldata 自身的能力：超出解除名字绑定的目标，目前没有需要。
- 对不存在的名字抛出 `unknown ldata X.Y.Z`：删除的目的是让名字不再被占用，名字本就不存在时目的已经达到，按 `Map.prototype.delete` 的惯例返回 `false` 即可。
- 每次换新域名来避开重名：域也不能释放，只是把占用从 ldata 转移到域。

## 裁定

接受，按解决提案实施。issue#yxhoe1w3 让布局持有 ldata，本包就要给出交还名字的途径；目标只是解除名字绑定，`layout.delete_ldata(name)` 足够，以强引用持有保证按名字查找的 ldata 不会被回收，不扩大到消除 ldata 自身的能力或销毁域。

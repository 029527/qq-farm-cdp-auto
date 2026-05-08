# 内存占用与小程序卡顿优化计划

创建日期：2026-05-08

目标：降低项目常驻内存、减少 QQ/微信小程序注入后的主线程负担，并保留必要的自动农场能力。执行时优先保证功能可回滚、可验证。

## 背景结论

当前主要压力不在单一泄漏点，而是多类常驻能力叠加：

- `button.js` 约 560KB，QQ bundle 会将整段代码内嵌到小程序 `game.js`，启动时解析成本高。
- `button.js` 注入后默认安装 runtime spies，包装消息、网络、帧回调、节点点击、按钮点击等热路径。
- `button.js` 默认启动 `startReconnectWatcher()`，奖励弹窗拦截器启用后也会高频扫描节点树。
- `qq-host.js` 常驻 WebSocket、心跳和 ready 轮询，单独不重，但会放大注入层负担。
- 网关侧存在日志整文件读取、预览帧 base64 常驻、`lastResult` 保存完整大对象等内存峰值来源。
- 非 QQ WS 模式会加载 WMPF/Frida/CDP 桥接，若实际只跑 QQ 注入路线，会增加不必要的基线资源。

## 总体策略

1. 先止血：关闭默认高频 hook / watcher，确保小程序不卡。
2. 再减重：拆分 `button.js` 为轻量运行层和按需诊断层。
3. 再治理：优化网关内存峰值和状态缓存。
4. 最后验证：建立可重复的 CPU/内存/响应耗时对比。

## 阶段 0：基线采集

目的：后续每次优化都有对比基准。

### 任务

- [ ] 记录 QQ 路线启动后 5 分钟、15 分钟、30 分钟的进程内存。
- [ ] 分别记录以下进程的 Working Set / Private Memory / CPU：
  - `node`
  - `QQ` / `QQEX`
  - `WeChatAppEx`
- [ ] 记录小程序注入前后的点击响应感受和明显卡顿场景。
- [ ] 记录是否开启以下功能：
  - 控制台预览
  - 自动农场
  - 奖励弹窗拦截器
  - 仓库自动刷新/出售
  - WMPF/Frida/CDP 桥接

### 建议命令

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'node|QQ|QQEX|WeChatAppEx|frida' } |
  Select-Object ProcessName,Id,CPU,WorkingSet64,PrivateMemorySize64,StartTime |
  Sort-Object WorkingSet64 -Descending |
  Format-Table -AutoSize
```

### 验收

- [ ] 有一份优化前数据，可与优化后对比。

## 阶段 1：立即降低小程序卡顿

目的：用最小改动降低小程序主线程压力。

### 1.1 默认禁用运行时 spies

涉及文件：

- `button.js`

当前风险点：

- `installRuntimeSpies()` 会包装游戏消息、网络、帧、点击等热路径。
- 注入完成时会自动执行 `installRuntimeSpies()`。

计划：

- [x] 新增运行时开关，例如 `G.__qqFarmAutoStartRuntimeSpies === true` 才安装 spies。
- [x] 默认不执行 `installRuntimeSpies()`、`installInteractionManagerSpies()`、`ensureInteractionManagerSpyRetry()`。
- [x] 保留 `gameCtl.startRuntimeSpies()` 或等价调试入口。
- [x] 调试入口可重复调用，不重复包裹同一个原型方法。

验收：

- [ ] 默认注入后 `runtimeSpyState.installed === false`。
- [ ] 自动农场常用能力仍可用。
- [ ] 手动开启诊断后，`getRuntimeSpySnapshot()` 仍可返回数据。

### 1.2 默认禁用 reconnect watcher

涉及文件：

- `button.js`

当前风险点：

- 注入完成后默认 `startReconnectWatcher({ silent: true })`。
- 默认约 1200ms 检查一次，会持续占用小程序主线程。

计划：

- [x] 注入后不再默认启动 reconnect watcher。
- [x] 自动农场任务执行前按需调用 `autoReconnectIfNeeded()`。
- [x] 需要常驻守护时由控制台显式开启。

验收：

- [ ] 默认注入后 `getReconnectWatcherState({ silent: true }).running === false`。
- [ ] 手动开启后可以正常恢复。
- [ ] 自动农场遇到重连弹窗时仍能按需处理。

### 1.3 奖励弹窗拦截器改为短时启用

涉及文件：

- `button.js`
- `src/gateway.js`
- `src/auto-farm-manager.js`

当前风险点：

- `startRewardPopupInterceptor()` 启用后默认 400ms 扫描一次 UI。

计划：

- [x] 默认关闭奖励弹窗拦截器。
- [x] 自动任务开始前按需开启，任务结束后关闭。
- [x] 提供运行时手动开关控制是否启用，不隐式常驻。

验收：

- [ ] 空闲时 `getRewardPopupInterceptorState().scheduled === false`。
- [ ] 自动任务期间如需隐藏奖励弹窗，仍能正常执行。

## 阶段 2：拆分轻量注入包

目的：减少小程序启动解析成本和长期常驻代码量。

### 2.1 拆分 `button.js`

建议结构：

- `button.js`：保留当前 full 版本，作为调试全量包。
- `button-lite.js`：新增轻量运行包，只保留自动化必需能力。
- 可选：`button-debug.js`：后续承载诊断能力。

轻量层优先保留：

- `gameCtl.getFarmStatus`
- `gameCtl.triggerOneClickOperation`
- `gameCtl.enterOwnFarm`
- `gameCtl.enterFriendFarm`
- `gameCtl.getFriendList`
- `gameCtl.autoPlant`
- `gameCtl.fertilizeLand`
- `gameCtl.fertilizeLandsBatch`
- `gameCtl.refreshWarehouseSnapshot`
- `gameCtl.sellWarehouseItems`
- `gameCtl.autoReconnectIfNeeded`

诊断层按需保留：

- `installRuntimeSpies`
- `getRuntimeSpySnapshot`
- `resetRuntimeSpyEvents`
- `inspect*`
- `snapshotNode`
- `diffSnapshots`
- `dumpButtons`
- `dumpFarmNodes`
- `detectActiveOverlays`
- `inspectRecentClickTrace`

任务：

- [x] 先复制出 `button-lite.js`。
- [x] 删除或禁用所有默认 spies、debug dump、深度 inspect、snapshot 类能力。
- [x] 更新 QQ bundle 生成逻辑支持选择 lite/full。

验收：

- [x] `button-lite.js` 文件体积明显小于当前 `button.js`，目标先控制在 200KB 以下（当前约 188KB，`button.js` 约 560KB）。
- [ ] QQ 小程序注入 lite 包后自动农场核心流程可运行。
- [ ] 需要诊断时仍可用 full 包。

### 2.2 Bundle 支持 lite/full 模式

涉及文件：

- `src/qq-bundle.js`
- `scripts/patch-qq-miniapp.cjs`
- `src/gateway.js`
- `README.md`

计划：

- [x] 增加配置项，例如 `FARM_QQ_BUNDLE_MODE=lite|full`；`button-lite.js` 完成后默认切换为 `lite`。
- [x] `buildQqBundle()` 根据模式读取 `button-lite.js` 或 `button.js`。
- [x] 控制台保存/打补丁时的 meta 包含当前 bundle 模式。
- [x] 命令行支持 `--bundle-mode lite|full`。

验收：

- [x] `npm run qq:bundle` 默认生成 lite bundle。
- [x] `npm run qq:bundle -- --bundle-mode full` 可生成 full bundle。
- [x] 生成结果中 meta 包含 bundle mode。

### 2.3 注入前 hash 判断更严格

涉及文件：

- `src/qq-bundle.js`

当前逻辑：

- `attachScriptHash()` 如果发现 `gameCtl` 已存在就直接返回 true，仅补 hash。

计划：

- [x] 判断 `gameCtl.__scriptHash === meta.scriptHash` 才跳过安装。
- [x] 如果 `gameCtl` 存在但 hash 不一致，允许重装。
- [x] 避免因为旧 `gameCtl` 存在而误判新包已安装。

验收：

- [ ] 相同 hash 不重复安装。
- [ ] 不同 hash 不静默复用旧代码。

## 阶段 3：降低网关内存峰值

目的：减少 Node 进程长期运行后的内存占用和突发峰值。

### 3.1 任务日志改为尾部读取

涉及文件：

- `src/task-event-log-store.js`

当前风险点：

- `readRecent()` 会整文件 `readFile` 后再取最后 N 行。

计划：

- [x] 实现从文件尾部按块读取最近 N 行。
- [x] 保留当前 JSON 解析和 normalize 行为。
- [x] 文件不存在或损坏时维持现有容错。

验收：

- [ ] 大日志文件下读取最近 500 行不会整文件进入内存。
- [ ] `/api/task-logs` 和导出接口结果保持兼容。

### 3.2 `lastResult` 摘要化

涉及文件：

- `src/auto-farm-manager.js`

当前风险点：

- `lastResult` 保存完整自动农场结果，好友、仓库、地块列表较大时会常驻内存。

计划：

- [x] 新增 `_buildLastResultSnapshot()`。
- [x] `lastResult` 只保存 task、due、统计数字、错误和关键摘要。
- [x] 完整结果默认不再常驻内存；如确实需要，后续按 debug 日志单独扩展，不影响当前运行态。

验收：

- [ ] 控制台状态页仍能展示最近执行概要。
- [ ] 内存快照中不再常驻完整好友/地块/仓库结果。

### 3.3 预览帧缓存收敛

涉及文件：

- `src/preview-manager.js`
- `src/gateway.js`

当前风险点：

- `lastFramePayload` 保存完整 base64 截图。
- 控制台断开后可能保留最后一帧。

计划：

- [x] 页面断开且订阅数为 0 时，停止 screencast 并清空 `lastFramePayload`。
- [x] `getState()` 只返回 metadata，不返回 base64。
- [x] 增加最大帧大小保护，过大帧不缓存。

验收：

- [ ] 关闭预览页面后 `subscriberCount === 0`，且不保留 base64 大字符串。
- [ ] 再次打开预览仍能正常启动。

## 阶段 4：运行模式与启动体验收敛

目的：避免 QQ 路线误加载 WMPF/Frida/CDP。

涉及文件：

- `run.cjs`
- `src/index.js`
- `start.bat`
- `start.sh`
- `README.md`

计划：

- [x] QQ 路线明确设置 `FARM_RUNTIME_TARGET=qq_ws`。
- [x] `src/index.js` 仅在 `runtimeTarget !== "qq_ws"` 时加载 WMPF 桥接，保持现状并增加日志提示。
- [x] 启动脚本中明确展示当前 runtime target。
- [x] README 中补充性能建议：QQ 路线不要同时开启微信调试桥。

验收：

- [ ] `npm run start -- --qq` 不启动 WMPF/Frida。
- [ ] `npm run start -- --wx` 仍可启动 WMPF/Frida。

## 阶段 5：验证矩阵

每个阶段完成后执行一次。

### 功能验证

- [ ] QQ 小程序补丁生成。
- [ ] QQ 小程序连接网关。
- [ ] `host.describe` 正常。
- [ ] `gameCtl.getFarmStatus` 正常。
- [ ] 自己农场基础任务正常。
- [ ] 自动收获正常。
- [ ] 好友进入/返回正常。
- [ ] 仓库刷新正常。
- [ ] 预览开启/关闭正常。
- [ ] full 调试包仍可使用 `inspect*` / `dump*` 能力。

### 性能验证

- [ ] 注入后 5 分钟 QQ 小程序无明显卡顿。
- [ ] 空闲 15 分钟 CPU 低于优化前。
- [ ] 空闲 30 分钟内存不持续线性增长。
- [ ] 打开/关闭预览后内存能回落或至少不持续上涨。

### 回归风险

- [ ] lite 包可能缺少某些自动化函数，需要先以最小功能闭环验证。
- [ ] 关闭 spies 后部分账户/仓库诊断能力会变弱，必须保留 full 包兜底。
- [ ] 关闭 reconnect watcher 后，异常重连处理依赖任务前按需调用。

## 建议执行顺序

1. 阶段 0：采集基线。
2. 阶段 1.1：默认禁用 runtime spies。
3. 阶段 1.2：默认禁用 reconnect watcher。
4. 阶段 1.3：奖励弹窗拦截器改短时启用。
5. 阶段 3.1：日志尾部读取。
6. 阶段 3.2：`lastResult` 摘要化。
7. 阶段 3.3：预览帧缓存收敛。
8. 阶段 2：拆分 lite/full bundle。
9. 阶段 4：启动模式和 README 收敛。

说明：阶段 2 拆包收益最大，但改动最大；建议先做阶段 1 和阶段 3，能更快降低卡顿和内存峰值。

## 完成定义

- QQ 路线默认注入 lite 或无调试 hook 的运行层。
- 默认空闲状态无 runtime spies、无 reconnect watcher、无奖励弹窗扫描。
- Node 网关不整文件读取任务日志，不常驻完整大结果，不保留无订阅预览帧。
- QQ 小程序注入后交互卡顿明显下降。
- 所有调试能力仍可通过 full 包或显式开关按需开启。

## 当前执行记录

- [x] 代码侧优化已完成：默认 lite 注入、默认禁用高频 spies / reconnect watcher、自动任务短时启停奖励弹窗拦截器、网关内存峰值收敛。
- [x] 已新增 `scripts/build-button-lite.cjs`，可通过 `npm run qq:build-lite` 重新生成轻量包。
- [x] 已验证 `button-lite.js` 语法和体积：约 188KB。
- [x] 已验证 `npm run qq:verify`、`npm run qq:bundle` 默认输出 lite，`--bundle-mode full` 仍可输出 full。
- [x] 二次降卡顿：自动任务的 `autoReconnectIfNeeded()` 预检查改为 5 秒时间窗，避免每次 RPC 前都扫描小程序 UI。
- [x] 二次降卡顿：网关对短时间重复的只读 `gameCtl` 调用增加短 TTL 缓存，操作类调用成功后自动失效缓存。
- [x] 二次诊断：QQ WebSocket session 增加 `callStats`，可通过健康状态查看各 RPC 调用次数、耗时和慢调用。
- [x] 微信路线补充优化：`/api/lands`、`/api/player-profile`、种子可用性和分析接口增加短 TTL 缓存，减少控制台重复刷新导致的 CDP/WMPF 小程序扫描。
- [x] 微信路线补充诊断：网关统一记录 `rpcStats`，QQ 和微信/CDP 路线都能看到 `gameCtl.*` 调用次数、缓存命中和慢调用。
- [x] 微信路线功能补齐：奖励弹窗拦截开关复用 `button.js` 已有 `gameCtl.setRewardPopupInterceptorEnabled()`，不再限制为 QQ WS 专用；拦截器默认扫描间隔从 400ms 调到 1200ms，自动任务只在原本未开启时临时启用，结束后不覆盖用户手动开关。
- [x] 奖励弹窗拦截 bug 修复：首次扫描改为立即调度，强制隐藏节点前记录原始状态，关闭开关或停止期间会恢复被隐藏节点，避免 QQ/微信端“关了也恢复不了”。
- [x] 奖励弹窗拦截配置持久化：网关新增 `data/reward-popup-interceptor-state.json` 保存用户开关，状态接口会把保存配置同步到当前 QQ/微信 runtime，避免关闭控制页面后丢失显示或继续读旧 runtime 状态。
- [ ] 阶段 0 和阶段 5 中涉及真实 QQ 小程序交互、进程内存曲线、CPU 曲线的项目，需要在实机注入后按本计划采集。

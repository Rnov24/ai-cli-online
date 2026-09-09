<div align="center">

# AGY Online

### 专为 Google Antigravity CLI (`agy`) 打造的自主开发工作区与持久化终端控制台

[![npm version](https://img.shields.io/npm/v/agy-online.svg)](https://www.npmjs.com/package/agy-online)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8.svg)](https://golang.org/)
[![Memory Footprint](https://img.shields.io/badge/空闲内存-%3C15MB-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Termux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

[**English**](README.md) • [**简体中文**](README.zh-CN.md)

</div>

---

**AGY Online** 是一款专为 **Google Antigravity CLI (`agy`)** 深度优化的超轻量级、高性能网页端开发环境。它采用 **Go 语言单静态二进制可执行文件** 打包，内嵌完整编译好的 React Web UI 资源，无需在服务器或移动设备安装 Node.js 与庞大的 `node_modules`。

无论是在 20 元/月的低配 VPS、安卓手机 Termux 环境，还是本地高性能工作站上，AGY Online 均能提供断网不掉线的持久化 tmux 会话、实时的 Plan 文档批注系统、Git 提交图形化与 Diff 查看器、Google 多账户 OAuth 一键切换，以及原生 13-skill 全自动 AI 任务闭环。

---

## ⚡ 核心架构优势

| 特性 | 传统 Web 终端方案 | AGY Online |
|:---|:---|:---|
| **空闲常驻内存** | 70MB – 150MB+ (Node.js 运行时) | **~13.7MB RSS (<15MB)**（纯 Go 0 CGO） |
| **冷启动耗时** | 1,200ms – 2,500ms (V8 JIT 预热) | **< 20ms** 瞬间启动 |
| **部署体积** | 散碎多文件 + 数万依赖文件 | **单一可执行文件**，内嵌 Web 前端资源 (`embed.FS`) |
| **会话持久性** | 网页刷新或断网易丢失进程 | **tmux 原生常驻**，网络断开进程不掉线 |
| **任务自主闭环** | 依赖人工手动多次复制粘贴 Prompt | 内置 **13-skill 自动化状态机引擎** (`ai-cli-task`) |
| **Google 多账户** | 频繁手动编辑配置文件 | **图形化多账户切换面板**，内置 1 键 OAuth 助手 |
| **移动端/Termux** | 缺乏辅助按键，手机熄屏被杀后台 | **触控专属虚拟按键栏**，Termux:Boot 自启与防休眠锁 |

---

## 🖥️ 界面布局与核心面板

```
┌─ 标签页栏 ────────────────────────────────────────────────────────────┐
│ ┌─ Plan 批注面板 ───┬─ 终端面板 ──────────────────────────────────┐   │
│ │ AiTasks/ 任务目录  │                                             │   │
│ │ Markdown 文档渲染  │  $ /ai-cli-task auto my-feature             │   │
│ │                   │  ▶ [auto] 初始化任务模块与分支...           │   │
│ │ 4类结构化批注:     │  ▶ [auto] 生成执行方案中...                 │   │
│ │  [+] 插入内容      │  ▶ [auto] 关卡 1 (方案可行性检查): PASS     │   │
│ │  [-] 删除标记      │  ▶ [auto] 正在执行实施步骤 1/4              │   │
│ │  [↔] 替换修正      │  ▶ [auto] 正在执行实施步骤 2/4              │   │
│ │  [?] 提问批注      │  ...                                        │   │
│ │                   ├─────────────────────────────────────────────┤   │
│ │ Mermaid 流程图    │ Chat / 斜杠命令输入框                        │   │
│ │ LaTeX 数学公式    │ 多行 Markdown 编辑 + /goal, /plan, /model   │   │
│ └───────────────────┴─────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

- **WebGL 硬件加速终端**：基于 xterm.js 与纯 Go 自研的 1-字节二进制数据协议，极低输入延迟，全面支持多窗格任意切分与 tmux 会话无缝重连。
- **Plan 交互式批注面板**：实时查看 AI 生成的方案与需求，划选文本即可添加「插入/删除/替换/提问」四类结构化批注，以标准 JSON 反馈给 `agy` 修正方案。
- **Git 历史可视化与 Diff 对比**：无需在命令行敲击复杂 git 命令，可视化查看分支泳道图、提交文件列表与代码变更高亮对比。
- **Markdown 聊天与指令控制台**：支持语法高亮多行输入，内置 Antigravity 斜杠命令补全 (`/goal`, `/plan`, `/grill-me`, `/review`, `/model`)，草稿自动存入数据库。
- **Google 账户多配置切换器**：无需切换终端配置文件，一键在公司账号、个人账号与团队测试账号之间无感切换，内置 OAuth 本地回环助手。
- **Skills 技能中心**：官方 `skills.sh` 技能市场一键探索与安装，内置 Hermes 插件向 Antigravity 技能的自动转换器。

---

## 🔄 13-Skill 任务生命周期引擎 (`ai-cli-task`)

AGY Online 原生支持 13-skill Antigravity 任务生命周期插件，具备完整的状态机门禁与经验沉淀机制：

```
              ┌────────────────────────────────────────────────────────┐
              ▼                                                        │
init ──► plan ──► check ──► exec ──► verify ──► check ──► merge ──► report
  │        ▲        │ (失败)          (失败)      │ (失败)
  │        └────────┴─────────────────────────────┘
  └─► research (外部参考资料收集)
```

| 技能命令 | 功能说明 |
|:---|:---|
| `/auto <module>` | **全自主执行闭环**：单个会话内连续完成 plan → check → exec → verify → merge → report |
| `/init <module>` | 初始化任务目录 `AiTasks/<name>/`，自动创建 Git 任务专属分支与关联工作树 |
| `/plan <module>` | 生成结构化实施步骤，或自动合并处理 Plan 面板的人工交互批注 |
| `/research <module>`| 检索外部文档、技术参考与网络资料，归档至 `.references/` 知识库 |
| `/check <module>` | 三道质量与漂移检查关卡（方案后/实施中/完成后），严格把控执行质量 |
| `/verify <module>` | 运行特定领域的自动化测试与验证脚本，产出验证结果报告至 `.test/` |
| `/exec <module>` | 按照步骤严格执行代码改动，每步带有校验反馈门禁 |
| `/merge <module>` | 将已通过全面验证的任务分支合并回主干（`main`），自动处理冲突 |
| `/report <module>` | 自动生成任务完成报告，提取踩坑经验沉淀至经验数据库 `.experiences/` |
| `/cancel <module>` | 优雅中止执行中的任务，设置状态为取消并执行必要的资源清理 |
| `/list` | 只读查询当前所有任务模块状态、依赖树及执行阶段 |
| `/annotate <f> <a>`| 处理前端 Plan 面板提交的结构化 JSON 批注内容 |
| `/summarize <module>`| 自动压缩任务上下文摘要，避免长周期任务导致 LLM 上下文窗口溢出 |

---

## 🚀 快速上手

### 方式 1：使用 `npx` 零安装免配置运行

```bash
npx agy-online
```

### 方式 2：NPM 全局安装

```bash
npm install -g agy-online
agy-online start
```

### 方式 3：从源码编译单一二进制

```bash
# 1. 克隆代码仓库
git clone https://github.com/huacheng/agy-online.git
cd agy-online

# 2. 安装依赖并编译前端与 Go 二进制
npm install
npm run build

# 3. 启动服务
./bin/agy-online start
```

在浏览器中访问 **`http://localhost:3001`** 即可进入工作区。

---

## ⚙️ 守护进程与服务运维

编译后的 Go 单文件二进制自带进程生命周期管理、PID 追踪与优雅停机逻辑：

```bash
# 后台守护进程模式运行
./bin/agy-online start -d

# 指定端口后台运行
./bin/agy-online start -p 8080 -d

# 查看运行状态、PID、内存占用及运行时长
./bin/agy-online status

# 优雅重启服务
./bin/agy-online restart

# 停止服务
./bin/agy-online stop
```

---

## 📱 移动端与 Termux (Android) 极客配置

AGY Online 专为手机端移动开发提供深度优化，空闲仅需不到 15MB 内存：

### 1. 1 键安装 Termux:Boot 开机自启

```bash
bash scripts/install-termux-boot.sh
```

- 自动配置自启脚本 `~/.termux/boot/start-agy-online.sh`。
- 自动申请 `termux-wake-lock` 防休眠锁，手机锁屏熄屏不中断 AI 运行。
- 安卓手机开机后全自动静默后台启动服务。

### 2. 触控专属虚拟按键栏

点击底栏 **`⌨️`** 图标随时唤起专为手机优化的快捷工具条：
- 快捷键：`ESC`, `TAB`, `Ctrl+C`, `Ctrl+D`, `▲`, `▼`, `◀`, `▶`, `/`
- 一键发送 `agy ▶` 命令快速启动终端会话
- 支持一键粘贴手机剪贴板内容

---

## 🏗️ 整体架构图

```
浏览器端 (xterm.js + WebGL)
  ├── Plan 批注面板 (交互式 Markdown 编辑器)
  ├── Git 历史面板 (提交图谱 + Diff 比较器)
  ├── 聊天面板 (Markdown 编辑器 + 斜杠指令)
  └── 终端视图 (WebGL 渲染器 + 触控按键栏)
        │
        ↕ WebSocket (0x01-0x05 二进制高频流) + REST API
Go 原生服务端 (单一静态可执行文件, 0 CGO)
  ├── 内嵌 Web 前端资源 (embed.FS — 部署无需 node_modules)
  ├── WebSocket ↔ PTY 管道中继 (creack/pty + coder/websocket)
  ├── tmux 会话管理层 (~/.tmux-sockets/agy-online)
  ├── 纯 Go SQLite (WAL 模式, modernc.org/sqlite)
  ├── 空闲资源回收器 (无连接 60 秒后自动整理 WAL 并还回物理内存给 OS)
  └── REST 路由集群 (会话、文件、Git、技能、Google 账户配置)
        │
        ↕ tmux socket 管道 / direct PTY 自动回退
tmux 终端会话 ──► 交互 Shell ──► Google Antigravity CLI (agy)
  └── AiTasks/ 任务生命周期 (13-skill 自动化闭环)
```

---

## 🔧 环境变量与配置

AGY Online 会按优先级读取 `~/.agy-online/.env` 或项目根目录下的 `.env`：

| 配置项 | 默认值 | 说明 |
|:---|:---|:---|
| `PORT` | `3001` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 绑定监听地址 |
| `AUTH_TOKEN` | *(留空)* | 访问 Web 界面的身份验证口令（生产建议设置） |
| `DEFAULT_WORKING_DIR`| 当前用户目录 | 新建终端会话时的默认工作目录 |
| `DATA_DIR` | `~/.agy-online/data` | 数据库 (`agy-online.db`) 与持久化数据存储目录 |
| `START_COMMAND` | *(系统默认 Shell)* | 终端会话启动执行的自定义命令 |
| `MAX_CONNECTIONS` | `10` | 允许同时建立的最大 WebSocket 连接数 |

---

## 🛡️ 生产环境部署 (systemd + nginx)

通过自动化脚本快速配置系统服务与 nginx 反向代理（含 WebSocket 支持与 SSL 终止）：

```bash
sudo bash install-service.sh
```

```bash
# 管理系统服务
sudo systemctl start agy-online
sudo systemctl status agy-online
sudo journalctl -u agy-online -f
```

---

## ⌨️ 全局快捷键速查

| 快捷键 | 功能 |
|:---|:---|
| `Ctrl + \` | 快速开启/折叠 Markdown 聊天输入面板 |
| `Alt + A` | 唤起 Autonomous 自动化任务模态框 |
| `Alt + P` | 唤起 Skills 技能中心与管理面板 |
| `Alt + G` | 快速开启/折叠 Git 提交历史与 Diff 查看器 |
| `Alt + C` | 唤起 AI 澄清提问解答模态框 |
| `Alt + H` | 打开帮助与快捷键说明手册 |
| `Ctrl + S` | 在文件浏览器中保存正在编辑的文件 |
| `Escape` | 关闭当前弹窗或退出文件编辑模式 |

---

## 🤝 致谢与致敬

AGY Online 的设计深受以下优秀项目与开源精神的启发：
- [**Google Antigravity CLI (`agy`)**](https://github.com/google/antigravity) — Google 新一代前沿自主编码智能体引擎。
- [**ai-cli-online**](https://github.com/huacheng/ai-cli-online) — 奠定轻量化 Web 终端与 AI 交互原型的基石项目。
- [**hermes-webui**](https://github.com/nesquena/hermes-webui) — 在智能体人机协作交互设计方面给予了重要灵感。

---

## 📄 开源协议

本项目采用 [MIT](LICENSE) 开源协议。

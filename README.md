<div align="center">

# Saki AI Agent
### 本地优先的 AI 工作区：代码、文件、研究与长期协作

Local-first AI Workspace · Model Choice · Recoverable Workflows · Beyond Coding

[项目首页 / Main README](README.md) · [简体中文完整文档](README.zh-CN.md)

</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v22.12%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)

</div>

**Saki AI 是面向中文用户、本地优先的 AI 工作区。** 在一个图形界面中连接本地或云端模型，让 Agent 处理项目代码、工作区文件和终端任务，并把研究、文档、PPT、长期记忆与 QQ 工作流整合到日常协作中。

以 **Codex、Claude Code 等编程智能体**所代表的任务式协作为参照，Saki 的重点不是宣称编程能力超越它们，而是提供一个**不绑定单一模型、覆盖编程之外场景、可在本机管理和回退任务的个人 AI 工作区**。当前界面由本地 Web 服务提供；Windows 便携版通过 EXE 启动服务并打开浏览器，并非原生桌面 GUI。

**[下载 Windows 便携版](https://github.com/EthanChan050430/Saki-AI/releases/latest)** · [快速开始](#-quick-start-guide) · [低资源部署](docs/deployment.md) · [插件说明](docs/plugin-marketplace.md)

> **关键词**：Desktop AI Agent · Coding Agent · Local-first · Ollama / LM Studio · MCP · 工作区检查点 · 长期记忆 · 中文研究与办公



https://github.com/user-attachments/assets/91ac7121-2a01-4751-a0c3-bc257e097b0e

## 从桌面出发，继续探索

给 AI 工作流添一点新能力，也把视野延伸到服务器。沿着这两个入口，发现 Saki 的更多可能。

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/EthanChan050430/saki-plugins"><img src=".github/assets/explore-extensions-zh.svg" width="640" alt="拓展市场 — 探索 saki-plugins 插件仓库" /></a>
      <p>发现功能插件、MCP 工具与 Skills，为日常任务拓展能力。Saki AI 的插件市场可直接下载安装仓库中的功能插件，也可以从示例开始开发自己的插件。</p>
      <p><a href="https://github.com/EthanChan050430/saki-plugins"><strong>逛逛拓展市场 · 查看仓库 ↗</strong></a></p>
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/EthanChan050430/Saki-Panel"><img src=".github/assets/explore-saki-panel-zh.svg" width="640" alt="Saki Panel — 探索带有 AI 助手的开源服务器运维面板" /></a>
      <p>从个人桌面走向服务器工作区。在一个 Web 控制台管理 Minecraft、Steam、Docker 与常规进程，让 Saki 结合日志、文件和节点指标协助排障。</p>
      <p><a href="https://github.com/EthanChan050430/Saki-Panel"><strong>认识 Saki Panel · 查看仓库 ↗</strong></a></p>
    </td>
  </tr>
</table>


---

## 📖 产品定位：从编程智能体，走向个人 AI 工作区

一个实用的 Agent 不应只会回答问题，还应该能理解工作区、执行工具、接受中途反馈，并让用户看清它做了什么、在出错时有办法恢复。

Saki 把这些协作能力延伸到**代码开发、文件处理、中文资料研究和轻办公**，同时保留模型、部署方式和扩展工具的选择权。它既可作为开发者的项目助手，也适合希望通过图形界面使用 Agent 的个人用户。

---

## 🆚 与 Codex / Claude Code 类工作流的关系

这里对标的是**围绕任务、工具和工作区持续协作的产品体验**，而不是逐项宣称其他产品缺少某种能力。Codex、Claude Code 的具体功能以各自官方文档为准；本项目没有提供同条件的编程成功率、Token 消耗或速度对比测试。

| 你关心的体验 | Saki 的实现重点 |
| :--- | :--- |
| **围绕项目完成任务** | 授权工作区后读取、编辑文件及执行终端命令，展示工具调用与代码变更 |
| **模型与预算选择** | 连接 Ollama、LM Studio、多家云端 API 与自定义 OpenAI 兼容端点 |
| **试错后能够恢复** | 对话检查点与工作区文件快照协同恢复，不依赖 Git |
| **任务中途补充要求** | 支持运行中引导，以及可编辑、可撤回的后续消息队列 |
| **不止写代码** | 集成文档解析、深度研究、PPT 预览与导出、证据核查 |
| **长期个人协作** | 可管理的长期记忆、可选离线反思、中文界面与 QQ 接入 |
| **部署与扩展自主权** | 开源本地部署、单服务生产模式、MCP、技能与插件管理 |

**选择建议**：如果你的主要目标是某一官方编程工具的专属模型、IDE 或托管工作流，请直接评估对应产品；如果你更看重**本地与云端自由切换、中文图形管理，以及开发和知识工作的一体化**，Saki 值得尝试。

---

## 🎯 适合谁

* **独立开发者**：希望在同一界面使用不同模型处理项目文件、终端任务和资料调研。
* **中文知识工作者**：需要文档问答、研究报告、PPT 和证据核查，而不只是代码补全。
* **本地模型用户**：希望自主选择模型、量化与硬件配置，控制云 API 使用范围。
* **长期个人助手用户**：希望管理跨会话记忆，并通过 QQ 等渠道延续工作流。
* **重视可控性的人**：希望看到工具执行过程，在敏感操作前确认，并能恢复工作区。

---

## 🏆 Saki 的核心优势

### 1. 模型自主：按任务选择，而不是绑定单一服务

支持 Ollama、LM Studio、多家云端模型和自定义 OpenAI 兼容 API；不同渠道独立保存密钥，并可在模型列表中切换。你可以用本地模型处理适合留在本机的材料，也可按需选择云模型处理更复杂任务。

**边界**：接入支持不代表各模型的工具调用、视觉和推理能力相同；不承诺小模型达到强云模型效果。实际成本取决于模型、上下文长度、工具轮次与服务商计费。

### 2. 工作区可操作，也可回退

Agent 可读取项目结构、分块阅读文件、精准替换内容并执行终端命令。对话检查点会在新任务执行前保存工作区快照，恢复时协同回退文件和对话，覆盖终端产生的修改、删除和新增文件，而不仅是文件编辑工具的记录。

这让“试一个方案，不合适就退回来”成为工作流的一部分。检查点的范围与限制见下文。

### 3. 持续协作：运行中引导与消息队列

任务执行时可以补充要求，在工具轮次之间调整方向；后续需求可以排队，并支持编辑或撤回。不必每次补充信息都停止任务、重新描述上下文。

**边界**：引导不打断正在执行的工具，也不撤销已有副作用；目前适用于 Agent 模式，不适用于普通聊天及研究/PPT 等特殊流程。消息队列保存在当前浏览器，不是跨设备后台任务队列。详见 [运行中引导](backend/AGENT-STEERING.md) 与 [消息队列](frontend/QUEUE.md)。

### 4. 长期记忆，而不只是单次会话上下文

支持管理长期记忆、短期记忆、知识关系与检索上下文；可选启用离线反思，在服务运行且满足空闲条件时，使用本地模型整理当天材料。用户偏好、项目约束和持续进展可以在后续会话中复用。

离线反思默认关闭，记忆提取并非模型训练，也不保证永远准确；重要约束仍应明确确认。

### 5. 不止编程：研究、文档、PPT 与证据核查

将 PDF / Office 文档问答、多来源网页研究、报告生成、PPT 预览与导出、声明核查放在同一工作区。适合从“读取项目或材料”一路衔接到“整理报告与演示文稿”，减少在多个独立工具间搬运上下文。

研究引用与核查评分是辅助信息，不等于事实保证；重要结论应回到原始来源复核。

### 6. 中文图形管理与开放扩展

通过图形界面配置模型、工作区、记忆、技能和插件，支持 MCP stdio 工具接入及 `SKILL.md` 技能扩展。QQ 接入、语音和绘图服务让工作流可以延伸到聊天与创作场景；这些集成需分别准备凭据或外部服务。

### 7. 本地优先与轻量部署

生产模式由一个后端服务在 `5480` 端口提供 UI 与 API，不需要常驻 Vite。轻量配置可使用关键词记忆检索和 HTTP 网页提取，将向量模型、浏览器渲染与完整动画作为可选项。Windows 便携版内置 Node.js。

应用本身的资源占用与模型推理、浏览器和媒体服务的开销需分开评估，详见 [低资源部署指南](docs/deployment.md)。**本地存储不等于所有数据不出本机**：启用云模型、联网检索、QQ 或第三方工具时，相关内容会按调用发送到外部服务。

### Conversation checkpoints

Hover over a conversation turn to reveal **Restore checkpoint**. New turns save a file snapshot before the agent starts. Restoring rewinds that user message and every later message, puts the original prompt and attachments back into the composer, and restores the affected workspaces. Snapshots include terminal edits, deletions, renames, new files, binary files, hidden files, and dependency files; they do not rely on Git or on the agent's file-edit tools.

Checkpoint scope excludes `.git` metadata, application session/history storage, and the checkpoint store itself. Files outside the selected workspaces, external services, and running processes are not rewound. Symlink targets outside a workspace are not followed. Messages created before this feature have no recoverable terminal snapshot.

Backups use deduplicated local content under `~/.saki-ai/checkpoints`. Set `CHECKPOINT_STORE_DIR` to change that location. The default per-snapshot limits are 100,000 entries and 2 GiB; `CHECKPOINT_MAX_FILES` and `CHECKPOINT_MAX_BYTES` override them. If a complete snapshot cannot be saved, the task stops before agent actions. Restoration requires the local agent authentication token, refuses busy workspaces, and keeps recovery snapshots while restoring files and conversation state.

### 权限与安全边界

Saki 提供工作区路径检查、权限模式、敏感操作审批、文件版本记录与检查点恢复，帮助用户控制 Agent 的操作范围。

**这些是应用层防护，不是操作系统级强隔离沙箱，也不是绝对安全保证。** 终端命令和第三方 MCP/插件可能以当前用户权限运行；请只授权必要工作区、审查敏感操作，并避免将服务直接暴露到不可信网络。检查点不能回滚外部 API、网络发送或运行进程的副作用。

---

## ✨ Core Features Deep Dive

### 1. 💬 A More "Soulful" Conversational Experience
*   **Multi-Model Support**: Seamless integration with **Ollama** (local models like Qwen3, GLM), Lmstudio, GitHub Copilot, and OpenAI / DeepSeek / Zhipu / Gemini / MiniMax / Anthropic / Moonshot / Tongyi Qianwen / Doubao / Custom OpenAI-compatible APIs.
*   **Separate API Keys per Channel**: API keys for different cloud services are stored separately, no longer sharing a single key. You can also enable "Show all enabled API models" to see models from all configured channels directly in the top model list.
*   **Emotive Personality (Saki)**: She is not a cold Q&A machine. She can be happy, shy, or thoughtful. The system includes rich emotive expressions and a tone system, making conversations feel more like interacting with a real friend.
*   **Deep Thought Visualization**: For models that support "chain-of-thought" (like Qwen, Gemma3), Saki elegantly displays the `<UserThinking>` process, allowing you to see the AI's logical reasoning.

### 2. 📂 Powerful Local Document Analysis
Drag and drop files directly into the chat to start a conversation. The underlying parsing engine supports:
*   **PDF**: Intelligent text extraction preserving paragraph structure.
*   **Word / Excel / PPT**: Compatibility with Office suite via `mammoth` and `officeparser` for deep document content restoration.
*   **Long Document Chunking**: Automatically splits tens of thousands of words into AI-digestible chunks for precise Q&A.

### 3. 🌐 Smart Web Search & Autonomous Agent
*   **Autonomous Task Planning**: When you ask, "Help me find the latest AI news and summarize it," Saki will: 1. Decompose the task -> 2. Invoke search tools -> 3. Read webpage content -> 4. Organize and summarize.
*   **Hybrid Search Engine**: Integrates **Bing** and **SearxNG**, supporting real-time access to the latest internet information.
*   **Terminal Interaction**: With your authorization, it can execute PowerShell/Shell commands to get system status, run scripts, or process files. Terminal tool default timeouts are extended for larger tasks, and support per-command timeout specification; `0` disables auto-timeout, suitable for large downloads or local model tasks.
*   **MCP Tool Integration**: Connects MCP servers through stdio to discover and call additional tools. Server dependencies and credentials require separate configuration; third-party tools must be trusted.
*   **Long Context Auto-Compression**: When conversations get long, the backend retains recent key context and compresses earlier tool calls and dialogue into a background summary, reducing unnecessary token consumption.

### 4. 🎨 🎙️ Multi-Sensory Interaction & Multi-Channel Access
*   **Local Image Generation (Stable Diffusion)**: Directly calls a local SD WebUI to generate high-quality images.
*   **Emotional Voice (GPT-SoVITS)**: Integrates the open-source voice cloning model GPT-SoVITS. Saki can read replies in a more realistic tone, even including sighs, laughter, and other details.
*   **Multi-Channel AI Bridging (QQBot)**: Built-in `qqBridge` logic supports one-click integration of Saki's capabilities into QQ Channels or group chats, with support for custom commands like `/deep` for deep search and `/ppt` for report generation.

### 5. 🥃 Story Glass
*   **Voice Storytelling**: After opening the Story Glass page, you can directly tell stories to Saki. Saki will listen and respond first, not immediately generate a result for every sentence.
*   **Intelligent "Should I Mix a Drink?" Judgement**: The backend judges whether it's time to generate a "Story Glass" based on story length, emotional arc, vividness, and user preferences.
*   **Story Cocktail Card**: Generated results include a cocktail name, flavor profile, glass type, story summary, selected quotes, image/illustration, and a shareable card.
*   **Story Glass Collection**: View, favorite, filter, share, or download cards for previously generated Story Glasses on the page.
*   **Immersive Visual Effects**: New video states for drink mixing, listening, thinking, and serving, along with visual feedback like flavor signals and warmth cues.

### 6. 🧩 Skills System
*   **Local Skills Management**: View, enable/disable, edit, and delete non-protected local Skills.
*   **OpenHub Skill Search & Installation**: Supports searching remote Skills, previewing `SKILL.md`, and then deciding whether to install.
*   **More Token-Efficient Skill Reading**: The AI can now read Skills using their Chinese display names, stable keys/slugs, or title fragments. For example, `张雪峰.skill - 教育与思维操作系统` will automatically match to `zhangxuefeng-perspective`, eliminating the need for repeated slug searches.

### 7. 🧾 Deep Research, PPT Generation & Fact-Checking
*   **Deep Research**: Searches the web for multiple sources, displays the research process, and generates a comprehensive, readable report.
*   **PPT Generation**: Quickly transforms a topic into a presentation structure, supporting focused viewing and export.
*   **Evidence-Based Claim Checking**: Displays evidence sources, supporting/refuting relationships, and an indicative credibility judgment. Results require human verification against the original sources.

### 8. 📊 🩺 Message Diagnostics & Token Calculator
*   **Token Calculator**: Displays a beautiful visual circular chart representing token usage and color-coded status based on length (Teal/Amber/Rose) directly in the AI's reply toolbar.
*   **Detailed Diagnostics Panel**: Click the token badge to open an in-depth execution console showing the generation timestamp, exact character counts (Chinese characters, English words, symbols), total generation duration, and a chronological log of all agent tool invocations including parameters and command outputs (like terminal stdout).
*   **In-place AI Content Editor**: Enables editing Saki's final reply in place. Keeps action blocks (terminal inputs/outputs) intact while updating the text. Future user prompts in the conversation will automatically utilize the edited content as context for seamless steering.

---

## 🛠️ Technical Highlights

### ⚡ Agent Performance Core
*   **Prompt Cache Friendly Context**: Keeps prompt prefixes stable where possible to help compatible providers reuse cached context. Actual cache hits, latency and savings depend on the provider and request content.
*   **Speculative Parallel Tool Execution**: Pre-fetches slow network operations (`search`, `browse`) in parallel before entering the serial tool matching loop, maximizing execution efficiency.
*   **On-demand Embeddings**: Light deployments use keyword memory search without a local model. Standard deployments load the optional embedding pipeline only when needed; prewarming requires explicit configuration.

### 🚀 Hybrid-Powered Crawler Engine
Built-in dual-mode crawler based on **Puppeteer** and **Cheerio**. Light deployments use HTTP extraction. Optional browser rendering reuses a shared browser, closes pages after each crawl, and shuts the browser down after 60 seconds of inactivity.

### 📄 Deep Parsing for All Document Formats
Integrated professional-grade parsing chain covering PDF, modern Office (`.docx`, `.xlsx`, `.pptx`), and legacy Word (`.doc`). Employs multi-layer text extraction technology to restore complex document structures.

### 🔌 Robust MCP Runtime Environment
Deeply optimized for Windows `npx.cmd` invocation flow, featuring **15-second intelligent connection timeout monitoring** and automatic diagnosis for non-standard JSON output, ensuring stable MCP plugin operation.

### 🌊 Dual-Stream Output & Intelligent Routing
Supports parallel streaming of **Reasoning** and **Final Answer (Text)**. The backend also includes multi-level fallback mechanisms for GitHub Copilot API, ensuring responsiveness even in complex network environments.

### 🛡️ Application-Level Security Guardrails
Workspace path checks, permission modes and sensitive-action approvals help control file and terminal operations. File versions and conversation checkpoints provide recovery options. These checks are not an OS-level isolation sandbox; commands and third-party tools may run with the current user's privileges.

### 🧠 A Smarter Memory for You
Uses layered local memory, retrieval and consolidation to reuse relevant information across conversations instead of resending all history. Optional offline reflection can organize daily material with a local model. Recall quality and resource savings vary by workload and configuration.

---

## 🚀 Quick Start Guide

### Prerequisites
*   **Windows portable release**: Windows x64; Node.js is bundled. Model runtimes and optional integrations are not bundled.
*   **Source deployment**: Windows 10/11 (Recommended), macOS or Linux, with [Node.js](https://nodejs.org/) v22.12 or higher and npm.

> **Low-resource deployment**: [Detailed guide / 低资源部署指南](docs/deployment.md). Production starts one Web/API service in the light profile. Build requirements and model inference usage are separate from idle service usage.

### 1. Windows Portable Release

Download **Saki-AI-3.0-win-x64.zip** from [GitHub Releases](https://github.com/EthanChan050430/Saki-AI/releases/latest), extract the entire folder, and double-click **Saki-AI.exe**. Do not move the EXE away from its bundled folders. Keep the console open while using the application; Ctrl+C stops it.

The browser opens **http://127.0.0.1:5480**. Portable-release data is stored in **%LOCALAPPDATA%\Saki-AI\data** by default. Configure a local model service or cloud API on first use. Optional flags: **--no-browser**, **--port NUMBER**; **SAKI_DATA_DIR** overrides the data directory.

### 2. Source Deployment: Windows / macOS / Linux

Run **node scripts/launch.cjs** from the repository root. On first launch it installs dependencies and builds the frontend; subsequent launches reuse prepared files. Production serves the UI and API on **http://127.0.0.1:5480**, without a persistent Vite server or automatic model-service startup. HTTPS is used if local certificates are configured.

For small machines, run **node scripts/release.cjs** on a build machine, copy the generated directory under **release/** to the target, then run **node scripts/launch.cjs** there. The target needs Node.js/npm and installs backend production dependencies; no frontend build is required.

On macOS/Linux, **bash deploy.sh start** runs the service in the background; **status**, **logs**, **stop** and **restart** manage it. For source deployments, LAN access requires explicit **AGENT_HOST=0.0.0.0** configuration and suitable access controls.

**Development mode**: root **npm start**, **npm run dev** and Windows **start.bat** use the backend plus Vite frontend on port **5482**. They are not the single-service production launcher. The Windows batch launcher may also attempt to start configured local media services.

### 3. Windows Configuration Wizard
If you want to step-by-step configure models, search, image generation, TTS, QQBot, and Windows auto-start policies, you can run:

1.  Double-click **`configure.bat`** in the root directory.
2.  Or, in a terminal, run:
    bash
    npm run configure

3.  The wizard will prompt for key configuration items step-by-step.
    *   You can choose **Skip** at any step.
    *   In text inputs, pressing Enter keeps the current value.
    *   Entering `-` clears the current value.
4.  Auto-start supports the following strategies:
    *   Disable auto-start
    *   Startup folder
    *   Windows Task Scheduler

> Of course, you can also skip the wizard entirely and modify these configurations in the settings interface.

---

## ⚙️ Advanced Feature Configuration Manual

Want to unlock Saki's "full potential"? Please use it in conjunction with the following tools.

### 🔍 Configure Ollama Models
Saki supports models served through Ollama and LM Studio. Choose a model and quantization that fit your hardware and task, then configure the endpoint in settings (Ollama typically uses `http://127.0.0.1:11434`). Local inference can reduce reliance on paid APIs, but hardware usage and tool-call reliability depend on the selected model; support for a model is not a quality or performance guarantee.

### 🔑 Configure Cloud APIs & Model Lists
If you prefer using cloud models, Saki supports storing API keys for different channels separately:

*   OpenAI
*   DeepSeek
*   Zhipu AI
*   Gemini
*   MiniMax
*   Anthropic
*   Moonshot / Kimi
*   Tongyi Qianwen
*   Doubao
*   Custom OpenAI-compatible endpoints

After entering the respective channel's Key in the settings, Saki will fetch the model list for the currently selected channel.
If you enable **Show all enabled API models**, the top model selector will list models from all channels with configured keys, allowing quick switching between services.

> Real keys are saved in the active data directory's `global_config.json`. Source deployments normally use `data/`; the Windows portable release defaults to `%LOCALAPPDATA%\Saki-AI\data`. Source configuration is ignored by Git by default. Do not share live configuration files; the blank example is `data/global_config.example.json`.

### 🎨 Configure Stable Diffusion (AI Image Generation)
To enable native drawing capabilities in Saki, you need to connect to your local SD WebUI.

1.  **Prepare Environment**: Ensure Stable Diffusion WebUI (Automatic1111 or Forge version) is installed (you can directly use integration packages like "绘世").
2.  **Enable API Mode**:
    *   Find `webui-user.bat` in your SD directory.
    *   Edit the file, add `--api` to the `COMMANDLINE_ARGS` line.
    *   Example: `set COMMANDLINE_ARGS=--api --xformers --theme dark`

(If using the "绘世" integration package, you need to enable the switch for "Advanced Options - Listen Settings - Open Remote Connection")

3.  **Start SD**: Run `webui-user.bat`.
4.  **Saki Settings**: In the project's web settings (bottom left), the default SD URL is `http://127.0.0.1:7860`.

> Of course, you can also purchase an image generation API and replace the URL in the settings with the corresponding API address and key, which is super convenient.

### 🗣️ Configure GPT-SoVITS (AI Voice)
If your host/server has good performance, you can let Saki communicate with you using voice. GPT-SoVITS is currently a powerful open-source voice cloning model capable of mimicking various voices.

1.  **Prepare Environment**: Download and extract the [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) integration package.
2.  **Start Command**:
    *   Navigate to the GPT-SoVITS root directory.
    *   Type `cmd` in the address bar and press Enter to open a terminal.
    *   Enter and run the following command:
        cmd
        runtime\python.exe api_v2.py -a 127.0.0.1 -p 9880

    *   *(Note: Port 9880 is the default API port for version V2)*
3.  **Saki Settings**:
    *   Go to Settings -> TTS Settings.
    *   Enable the feature, and upload a few seconds of **reference audio** (the voice you want Saki to imitate) and its corresponding **reference text**.

### ⏱️ Agent Terminal Long-Running Tasks
The Agent's terminal tool is now better suited for handling large downloads, model runs, and long-duration scripts:

*   Default terminal timeout is longer, preventing interruption of large tasks at 90 seconds.
*   Individual tool calls can pass a `timeoutSeconds` parameter.
*   `timeoutSeconds = 0` disables auto-timeout.
*   For services or models that need to run for a long time, it's recommended to have the AI use `Start-Process` or `Start-Job` to start them in the background, so the current conversation isn't blocked by a long-running process.

---

## 🛠️ Tech Stack & Architecture (Under the Hood)

This project uses a modern frontend-backend separated architecture with a clear code structure, facilitating secondary development.

### 🖥️ Frontend
*   **Framework**: [React 18](https://react.dev/) - Component-based building, responsive.
*   **Build Tool**: [Vite 5](https://vitejs.dev/) - Sub-second hot updates, great development experience.
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) - Atomic CSS, aesthetically pleasing and easy to customize.
*   **State Management**: React Context + Hooks.
*   **Visuals**: `framer-motion` (animations), `lucide-react` (icons).

### 🔙 Backend
*   **Runtime**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/).
*   **Core Services**:
    *   `services/mcp.js`: Model Context Protocol management.
    *   `services/taskScheduler.js`: Autonomous Agent task planning and dispatch center.
    *   `services/parser.js`: Unified document parsing layer (PDF, Docx, Xlsx, etc.).
    *   `services/crawler.js`: Web crawler based on Puppeteer and Cheerio.
*   **Data Storage**: Local JSON files in the active data directory, without requiring MySQL/MongoDB. Local storage simplifies deployment and backup; privacy also depends on the models, tools and external services you enable.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Why can't the browser connect after startup?**  
A: Check the terminal window for errors. Production uses port 5480 for both UI and API; development uses 5482 for Vite. Check for port conflicts and firewall rules, and use HTTPS if local certificates are configured.

**Q: How do I switch models?**  
A: After configuring the corresponding model service, available models will automatically appear in the top selector. Select and save, Saki will switch automatically. If you have multiple cloud API keys configured, you can enable "Show all enabled API models" in the settings, and the top list will display models from all enabled channels.

**Q: Will my cloud API keys be uploaded to GitHub?**  
A: Normal source configuration under `data/` is ignored by Git; portable-release configuration is stored outside the repository by default. Do not force-add or share live configuration files. API calls still send credentials and request content to the configured provider as needed; a Git ignore rule is not encryption or a network privacy guarantee.

**Q: Why doesn't the AI need to repeatedly search for slugs when reading Skills anymore?**  
A: Skill reading now supports loose matching using display names, slugs, and title fragments. For example, a Chinese result title or a name in the format `.skill - ...` can directly resolve to the corresponding installed Skill.

**Q: Do large downloads or local model tasks still time out at 90 seconds?**  
A: The terminal tool has been updated with a longer default timeout and supports specifying `timeoutSeconds` per call; passing `0` disables auto-timeout. For long-running services, it's recommended to start them as background processes.

**Q: How do I change Saki's personality?**  
A: Click the bottom-left settings -> Personalization -> `System Prompt`. You can freely modify the prompt to make her a strict professor, a lively tour guide, etc.

---

## 🤝 Contributing

Saki AI Agent is an open-source project, and we warmly welcome contributions:

1.  **Fork** the repository.
2.  Create your feature branch: `git checkout -b feature/NewFeature`
3.  Commit your changes: `git commit -m 'Add some feature'`
4.  Push to the branch: `git push origin feature/NewFeature`
5.  Submit a Pull Request.

Whether it's fixing a bug or adding a new Agent capability, contributions are welcome.

---

<p align="center">Best wishes for your journey with Saki AI Agent!</p>

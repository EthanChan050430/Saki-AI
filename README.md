# Saki AI Agent - 你的本地 AI Agent，随时为你服务！

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v18.0%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## 📖 项目背景：为什么开发这个？
2026年是Agent爆发的年代，各大模型已经争相开始卷Agentic能力了。但对于我们这些普通用户来说，想要真正享受到Agent的便利，仍然存在不少门槛：像OpenClaw这样的工具虽然可以让我们自己搭建Agent，但需要复杂的环境配置和命令行操作，而且存在诸多安全性问题，目前还不适合大众用户使用。在线的Agent平台（Cursor、Trae等）虽然方便，但数据隐私无法保障，且功能受限。

**Saki AI Agent** 的诞生，就是为了打破这些壁垒。

它不仅仅是一个聊天窗口，而是一个运行在你本地电脑上的**副驾驶**。它可以控制浏览器搜索信息，可以读取你硬盘里的文档，可以指挥本地的绘图引擎，甚至可以用动听的声音和你交流。我们希望把最前沿的 AI 技术，封装进一个**温暖、懂你、易用**的桌面应用中。

---

## ✨ 核心功能深度解析

### 1. 💬 更有“灵魂”的对话体验
*   **多模型支持**：无缝对接 **Ollama** (本地运行 DeepSeek, Llama 等) 或云端 API。
*   **情感化人格 (Saki)**：她不是冷冰冰的问答机器。她会开心、会害羞、会思考。系统内置了丰富的情感表情包和语气系统，聊天就像和真人朋友发消息一样自然。
*   **深度思维可视化**：对于支持“思维链”的模型（如 DeepSeek R1），Saki 会优雅地展示 `<UserThinking>` 过程，让你看到 AI 思考的每一个逻辑转折。

### 2. 📂 强大的本地文档分析
直接把文件拖进聊天框，即可开始对话。我们重写了底层解析引擎，支持：
*   **PDF**: 智能提取文本，保留段落结构。
*   **Word / Excel / PPT**: 完美兼容 Office 三件套，通过 `mammoth` 和 `officeparser` 深度还原文档内容。
*   **长文档切片**: 自动将几万字的长文智能切分为 AI 可理解的小块，实现精准问答。

### 3. 🌐 智能联网与自主 Agent
*   **自主任务规划**：当你问“帮我查一下最近的 AI 新闻并总结”，Saki 会：
    1.  拆解任务 -> 2. 调用搜索工具 -> 3. 阅读网页内容 -> 4. 整理总结。
*   **混合搜索引擎**：集成 **Bing** 和 **SearxNG**，支持实时获取互联网最新信息。
*   **终端交互**: 在你的授权下，它可以执行简单的 CMD/Shell 命令来获取系统状态。

### 4. 🎨 🎙️ 视听全感官交互
*   **本地绘图 (Stable Diffusion)**：想看什么画面？直接说！Saki 会调用你本地的 SD WebUI 生成高质量图像。
*   **情感语音 (GPT-SoVITS)**：文字不再无声。接入当前最强的开源语音克隆模型 GPT-SoVITS，Saki 能用极其逼真的语气念出回复，甚至包含叹气、笑声等细节。

---

## 🚀 极速上手指南

### 环境要求
*   **操作系统**: Windows 10/11 (推荐), macOS, Linux
*   **Runtime**: [Node.js](https://nodejs.org/) (v18 或更高版本)

### 1. Windows启动
无论是初次安装还是日常使用，你只需要做这一步：

1.  找到根目录下的 **`start.bat`** 文件。
2.  **双击运行**。
    *   脚本会自动检查环境。
    *   自动安装前端 (`frontend/`) 和后端 (`backend/`) 的所有依赖。
    *   自动同时启动 Web 服务和 API 服务。
3.  浏览器打开 `http://localhost:3003`。

### 2. macOS/Linux 启动
1.  打开终端，进入项目根目录。
2.  运行以下命令：
    ```bash
    chmod +x start.sh
    ./start.sh
    ```

> **小贴士**: 第一次运行安装依赖可能需要几分钟，请看到"服务已停止"之前不要关闭窗口。

### 3. 重置项目
如果你想清除数据重新开始，或者遇到问题需要重置环境，可以运行reset文件夹下的reset.bat，如果您是Linux系统，请运行：

```bash
chmod +x reset/reset.sh
./reset/reset.sh
```

---

## ⚙️ 高级功能配置手册

想要解锁“完全体”Saki？请配合以下工具使用。

### 🔍 配置 Ollama 模型
Saki 原生支持通过 Ollama 连接本地运行的各种语言模型（如Gamma3, Qwen3等），目前测试最小体量效果最好的模型是GLM4.7。只需在 Ollama 中创建模型实例，并在 Saki 设置中输入正确的 URL 即可（本地部署的ollama端口为http://127.0.0.1:11434）。

### 🎨 配置 Stable Diffusion (AI 绘图)
如果你想让 Saki 原生支持画图，需要连接到你的本地 SD WebUI。

1.  **准备环境**: 确保你已安装 Stable Diffusion WebUI (Automatic1111 或 Forge 版本，可直接使用绘世整合包启动)。
2.  **开启 API 模式**:
    *   找到 SD 目录下的 `webui-user.bat`。
    *   编辑该文件，在 `COMMANDLINE_ARGS` 一行添加 `--api`。
    *   示例: `set COMMANDLINE_ARGS=--api --xformers --theme dark`

（若使用绘世整合包，需要打开`高级选项-监听设置-开放远程连接`的开关）

3.  **启动 SD**: 运行 `webui-user.bat`。
4.  **Saki 设置**: 在本项目网页左下角设置中，默认 SD URL 为 `http://127.0.0.1:7860`。

### 🗣️ 配置 GPT-SoVITS (AI 语音)
如果主机/服务器性能较好，可以让 Saki 用声音和你交流！GPT-SoVITS 是目前最强的开源语音克隆模型，能模仿各种声音说话。

1.  **准备环境**: 下载并解压 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) 整合包。
2.  **启动命令**:
    *   进入 GPT-SoVITS 根目录。
    *   在地址栏输入 `cmd` 回车打开终端。
    *   输入并运行以下命令：
        ```cmd
        runtime\python.exe api_v2.py -a 127.0.0.1 -p 9880
        ```
    *   *(注：端口 9880 是 V2 版本的默认 API 端口)*
3.  **Saki 设置**:
    *   进入设置 -> TTS 设置。
    *   开启功能，并上传一段几秒钟的**参考音频**（你希望 Saki 模仿的声音）及其对应的**参考文本**。

---

## 🛠️ 技术栈与架构 (Under the Hood)

本项目采用现代化的前后端分离架构，代码结构清晰，易于二次开发。

### 🖥️ 前端 (Frontend)
*   **Framework**: [React 18](https://react.dev/) - 组件化构建，响应迅速。
*   **Build Tool**: [Vite 5](https://vitejs.dev/) - 秒级热更新，极致开发体验。
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS，设计美观且易于定制。
*   **State Management**: React Context + Hooks.
*   **Visuals**: `framer-motion` (动画), `lucide-react` (图标).

### 🔙 后端 (Backend)
*   **Runtime**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/).
*   **Core Services**:
    *   `services/mcp.js`: 模型上下文协议管理。
    *   `services/taskScheduler.js`: 自主 Agent 任务规划与分发中心。
    *   `services/parser.js`: 统一文档解析层 (PDF, Docx, Xlsx 等)。
    *   `services/crawler.js`: 基于 Puppeteer 和 Cheerio 的网页爬虫。
*   **Data Storage**: 本地 JSON 文件存储 (位于 `data/` 目录)，无需安装 MySQL/MongoDB，真正的数据隐私与便携。

---

## ❓ 常见问题 (FAQ)

**Q: 为什么启动后浏览器无法连接？**
A: 请检查终端窗口是否有报错。通常是因为 3000 (后端) 或 3003 (前端) 端口被占用或者防火墙未放行。尝试关闭其他进程或者开放防火墙端口再试。

**Q: 文档解析失败怎么办？**
A: 目前支持常见文本类 PDF 和 Office 文档。如果是纯图片扫描版的 PDF，可能需要配合 OCR 模型（目前正在开发中）。

**Q: 如何更换 Saki 的人设？**
A: 点击左下角设置 -> 个性化 -> "System Prompt"。你可以随意修改提示词，让她变成严谨的教授、或是活泼的导游。

---

## 🤝 参与贡献

Saki AI Agent 是一个开源项目，我们需要你的力量让它变得更好！

1.  **Fork** 本仓库。
2.  创建你的特性分支 (`git checkout -b feature/NewFeature`).
3.  提交更改 (`git commit -m 'Add some feature'`).
4.  推送到分支 (`git push origin feature/NewFeature`).
5.  提交 Pull Request。

无论是修复一个小 Bug，还是增加一个新的 Agent 能力，我们都非常欢迎！

---

<p align="center">Best wishes for your journey with Saki AI Agent!</p>

<div align="center">

# Saki AI Agent
### 本地优先的 AI 工作区：代码、文件、研究与长期协作

Local-first AI Workspace · Model Choice · Recoverable Workflows · Beyond Coding

[English](README.md) · **简体中文**

</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v22.12%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#参与贡献)

</div>

**Saki AI 是面向中文用户、本地优先的 AI 工作区。** 在一个图形界面中连接本地或云端模型，让 Agent 处理项目代码、工作区文件和终端任务，并把研究、文档、PPT、长期记忆与 QQ 工作流整合到日常协作中。

以 **Codex、Claude Code 等编程智能体**所代表的任务式协作为参照，Saki 的重点不是宣称编程能力超越它们，而是提供一个**不绑定单一模型、覆盖编程之外场景、可在本机管理和回退任务的个人 AI 工作区**。当前界面由本地 Web 服务提供；Windows 便携版通过 EXE 启动服务并打开浏览器，并非原生桌面 GUI。

**[下载 Windows 便携版](https://github.com/EthanChan050430/Saki-AI/releases/latest)** · [快速开始](#快速开始) · [低资源部署](docs/deployment.md) · [插件说明](docs/plugin-marketplace.md)

> **关键词**：Desktop AI Agent · Coding Agent · Local-first · Ollama / LM Studio · MCP · 工作区检查点 · 长期记忆 · 中文研究与办公



https://github.com/user-attachments/assets/283a9c57-3d0d-473e-bba6-f1969d2420b1



## 看见 Saki

把灵感、模型与工具，放进属于你的工作区。

![Saki AI 工作区 — 本地优先、多模型协作与长期记忆](.github/assets/saki-workspace-poster.png)

用功能插件、MCP 工具与专属 Skills，拓展日常工作流。

![Saki AI 插件市场 — 发现功能插件、MCP 工具与专属 Skills](.github/assets/saki-extensions-poster.png)

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

## 能做什么

- **模型随便换**：Ollama、LM Studio，OpenAI、Anthropic、Gemini、DeepSeek、智谱、Kimi、通义、豆包、MiniMax，或任何 OpenAI 兼容接口。密钥按渠道分开存，顶部一键切换。
- **直接上手干活**：读写项目文件、执行终端命令，每次工具调用和代码改动都摆在界面上。
- **改坏了能退**：每轮任务开始前自动给工作区拍快照，终端里的增删改也算在内。点一下回到任意一轮，不用 Git。
- **跑着也能插话**：任务执行中随时补充要求，后续需求排队，可改可撤。
- **记得住你**：跨会话长期记忆，偏好和项目约定不用每次重讲。
- **写代码之外**：PDF / Office 文档问答、多来源深度研究、PPT 生成与导出、声明核查。
- **故事酒杯**：给 Saki 讲个故事，她会调一杯属于这个故事的鸡尾酒，生成可分享的卡片。
- **能扩展**：MCP、Skills、插件市场；可接 QQ 机器人、Stable Diffusion 绘图、GPT-SoVITS 语音。
- **够轻**：生产模式一个进程一个端口，数据存本地 JSON，不用装数据库。

## 快速开始

**Windows 便携版**：下载 `Saki-AI-3.0-win-x64.zip`，解压后双击 `Saki-AI.exe`，浏览器会打开 http://127.0.0.1:5480 ，在设置里填好模型即可。已内置 Node.js。

**源码运行**（Windows / macOS / Linux，需要 Node.js 22.12+）：

```bash
git clone https://github.com/EthanChan050430/Saki-AI.git
cd Saki-AI
node scripts/launch.cjs
```

首次启动会自动安装依赖并构建前端。macOS / Linux 后台运行用 `bash deploy.sh start`，低配机器部署看 [低资源部署指南](docs/deployment.md)。

## 注意

权限审批和路径检查是应用层防护，不是系统级沙箱。终端命令和第三方插件以当前用户权限运行，只授权需要的目录。检查点只回滚工作区文件，已经发出去的请求和消息撤不回来。

## 参与贡献

欢迎提 Issue 和 PR。许可证：[Apache 2.0](LICENSE)。

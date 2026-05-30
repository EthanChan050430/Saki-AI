<div align="center">

# Saki AI Agent
### A Local AI Agent Framework / Desktop-level AI Assistant / An Alternative to OpenClaw

</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v18.0%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

Saki AI Agent is a **Local AI Agent, Desktop Application, and Windows AI Assistant** designed for Chinese users, emphasizing ease of use. It focuses on **Low-barrier Deployment, Low Token Cost, Low Resource Usage, and Enhanced Security by Default**: The application core can be deployed with just `2 hCPU / 200 MB`, delivers good results with small `8B-12B` local models, recommends the local model `glm-4.7-flash`, and provides **Sandboxed Execution, Sensitive Action Approval, and File Versioning**.

> **Keywords**: Local AI Agent, OpenClaw Alternative, Ollama, Windows AI Assistant, Desktop AI Workspace, Low-resource Deployment, Sandbox, Security, File Versioning



https://github.com/user-attachments/assets/91ac7121-2a01-4751-a0c3-bc257e097b0e


---

## 📖 Project Vision: A Local AI Agent Addressing Friction in Personal Desktop Scenarios
The year 2026 is the era of Agent proliferation, yet practical adoption remains challenging for average users: Online platforms, while convenient, raise privacy concerns, have capability limitations, and incur ongoing subscription/Token costs; Excellent projects like OpenClaw are powerful but lean more towards being a **self-hosted gateway / Agent runtime**, better suited for developers and power users rather than the average person who just wants a usable AI assistant on their local computer.

<div style="color: #ff6f61; font-weight: bold; text-align: left; margin: 20px 0;">Saki AI Agent's mission is to lower these barriers.</div>

It's not just a chat window; it's an **AI Copilot running on your local machine**: capable of web searching, reading local documents, invoking local image generation, connecting voice, and external channels. We aim to package cutting-edge AI capabilities into a **warm, user-friendly, cost-controllable, and more secure-by-default** desktop application.

---

## 🆚 Saki AI Agent vs. OpenClaw: Platform Layer vs. Product Layer

OpenClaw is a strong **self-hosted gateway / Agent platform**, with core strengths in multi-channel integration, plugin support, multi-Agent routing, and remote message ingestion.  
**Saki AI Agent** is more like a **Desktop AI Workspace** focused on the Chinese user experience and local usability.

The two are not opposites. OpenClaw leans towards a "platform foundation," while Saki leans towards the "end-user product layer." If your goal is:

*   To deploy an AI assistant on your own computer with a low barrier to entry.
*   To prioritize using local models, reducing reliance on cloud tokens.
*   To have a graphical configuration interface, file workflows, and an integrated experience for PPT/research/memory/third-party chat.
*   To have security policies that are more conservative and easier to understand by default.

Then Saki is often a more suitable choice than OpenClaw.

| Aspect | Saki AI Agent | OpenClaw |
| :--- | :--- | :--- |
| **Product Positioning** | Local Desktop AI Workspace | Multi-channel Self-hosted Gateway / Agent Platform |
| **Primary Focus** | Local Experience, Chinese Interaction, File Workflows, Desktop Usability | Channel Routing, Remote Access, Plugin Ecosystem, Multi-Agent |
| **Deployment** | Windows users can simply double-click `start.bat` / `configure.bat` | More CLI / Gateway / Channel / Workspace oriented; Windows usage often requires WSL2 |
| **Model Strategy** | Emphasizes local viability; good results achievable with small `8B-12B` models | Officially leans towards recommending the strongest latest-generation models, which in practice can lead to greater reliance on powerful cloud models |
| **Cost Control** | Suitable for long-term local residency; aims to minimize token consumption | Platform is powerful, but high-quality usage scenarios can more easily lead to ongoing token costs |
| **Security Experience** | Default permission modes, sandboxed execution, sensitive action approval, file versioning | Comprehensive security capabilities, but relies more on the operator to correctly configure trust boundaries, allowlists, tool policies, and sandboxes |
| **Target Users** | General Users, Independent Developers, Creators, Light Office/Research Scenarios | Developers, Power Users, Scenarios requiring heavy multi-channel/remote access |

---

## 😖 OpenClaw Pain Points: Learning Curve, Tokens, Desktop Experience, Security Configuration

The "pain points" mentioned here are not about OpenClaw's lack of capability, but rather the <span style="color: #ff6f61; font-weight: bold; text-align: left; margin: 20px 0;">greater friction it introduces in the personal desktop scenario for average users</span>:

*   **High Learning Curve**: Requires understanding concepts like gateway, agent, channel, workspace, skill, allowlist, tool policy, etc.
*   **Higher Cost on Windows**: Official documentation still recommends using OpenClaw on Windows via WSL2, which is not user-friendly for many non-developers.
*   **Prone to High Token Consumption**: The official tendency to recommend the "strongest latest-generation models" for quality and safety makes sense for a platform, but leads to higher long-term costs for a locally-resident personal assistant.
*   **More Platform, Less Out-of-the-Box App**: If you need features like file drag-and-drop, graphical settings, memory management, PPT generation, deep research, and in-conversation file history, OpenClaw often requires you to build that product layer yourself.
*   **Security Configuration Requires Expertise**: OpenClaw has strong security capabilities, but to use it securely, the operator needs a clearer understanding of trust boundaries, permissions, sandboxes, and rule configuration.

Saki's goal is not to negate OpenClaw, but to <span style="color: #ff6f61; font-weight: bold; text-align: left; margin: 20px 0;">address these practical frictions in the "local personal desktop assistant" scenario</span>.

---

## 🎯 Target Audience: Windows Users, Local Models, Chinese Context, Privacy & Security-Conscious Users

*   **People who want a long-term resident AI assistant on their computer**, not just those who want to try an Agent occasionally.
*   **Windows users** who wish to minimize dealing with WSL2, complex CLI, and multi-layer configuration.
*   **Users with limited hardware or budget**, who hope to get a good experience with small local `8B-12B` models.
*   **Privacy-conscious individuals** who want documents, conversations, and memories to stay local as much as possible.
*   **Those needing a Chinese-centric experience**, especially for high-frequency Chinese scenarios like office work, research, PPT, document analysis, and QQ integration.
*   **Users more sensitive to security**, who prefer a system that is conservative by default, rather than granting the Agent broad freedoms initially.

---

## 🏆 Core Advantages: 2 hCPU / 200 MB, 8B-12B Local Models, Security Sandbox

### 1. Lightweight Deployment

Saki's **application core** is lightweight. For basic Web/API services, it can be deployed with as little as `2 hCPU` and `200 MB` of RAM.  
This means you don't need to prepare a "heavy-duty AI server" first to get the desktop Agent system up and running.

> **Note**: The `2 hCPU / 200 MB` mentioned here refers to the resource consumption of this project's own application services; if you also need to run Ollama, Stable Diffusion, GPT-SoVITS, or other model services on the same machine, those models will require additional CPU/RAM/VRAM.

### 2. Small Models Can Deliver

Saki is not designed around "requiring the most powerful cloud models," but is optimized for the experience that "**small local models should also be viable**."  
In practical use, small `8B-12B` models can cover a wide range of local assistant scenarios, including:

*   Daily conversation
*   Document reading and Q&A
*   Simple web search and summarization
*   Code assistance
*   Basic task planning

The currently recommended local model path for this project is **`glm-4.7-flash`**.  
It offers a good balance between Chinese comprehension, speed, cost-effectiveness, and daily usability, making it suitable for long-term local deployment. It also helps address the common OpenClaw issue of "heavy reliance on cloud models leading to ever-increasing token costs."

### 3. Higher Security Defaults

Beyond cost, another core concern is security. Saki emphasizes **default conservatism** in its design:

*   **Sandboxed Execution**: In default permission mode, terminal and file tools are restricted to a sandbox scope.
*   **Sensitive Action Approval**: Operations like overwriting, editing, deleting files, and high-risk terminal commands are paused, awaiting user confirmation.
*   **File Versioning**: Changes made by the AI to files can be rolled back, making recovery easier from accidental modifications or deletions.
*   **Local-First Priority**: Strives to keep data, files, and workflows on your local machine, rather than sending them to third-party SaaS.

This means <span style="color: #ff6f61; font-weight: bold; text-align: left; margin: 20px 0;">it's not only more cost-effective but also safer to run as a local Agent residing on your personal computer long-term.</span>

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
*   **Enterprise-grade MCP Host**: Supports Model Context Protocol, allowing dynamic loading of local or remote MCP servers (e.g., Google Maps, GitHub, SQLite) to extend AI capabilities.
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
*   **Chain of Thought Fact-Checking**: Suitable for verifying explicit claims. Displays evidence sources, supporting/refuting relationships, and a final credibility judgment.

---

## 🛠️ Technical Highlights

### 🚀 Hybrid-Powered Crawler Engine
Built-in dual-mode crawler based on **Puppeteer** and **Cheerio**. Supports JS dynamic rendering, simulates real-user scrolling for loading, intelligent main text extraction (automatically filters ads and navigation), and aims to retrieve clean webpage information.

### 📄 Deep Parsing for All Document Formats
Integrated professional-grade parsing chain covering PDF, modern Office (`.docx`, `.xlsx`, `.pptx`), and legacy Word (`.doc`). Employs multi-layer text extraction technology to restore complex document structures.

### 🔌 Robust MCP Runtime Environment
Deeply optimized for Windows `npx.cmd` invocation flow, featuring **15-second intelligent connection timeout monitoring** and automatic diagnosis for non-standard JSON output, ensuring stable MCP plugin operation.

### 🌊 Dual-Stream Output & Intelligent Routing
Supports parallel streaming of **Reasoning** and **Final Answer (Text)**. The backend also includes multi-level fallback mechanisms for GitHub Copilot API, ensuring responsiveness even in complex network environments.

### 🛡️ Default Security Guardrails
In default permission mode, terminal and file tools are restricted to sandboxes. Sensitive operations like overwriting, editing, and deleting are paused for user confirmation. Built-in file versioning logic for AI-generated or modified files significantly reduces the risk of accidental operations.

### 🧠 A Smarter Memory for You
Uses the LightMem solution, striking a balance between "effectiveness" and "efficiency." It minimizes tokens, API calls, and runtime without sacrificing accuracy, making it ideal for long-term, locally-deployed personal assistants.

---

## 🚀 Quick Start Guide

### Prerequisites
*   **OS**: Windows 10/11 (Recommended), macOS, Linux
*   **Runtime**: [Node.js](https://nodejs.org/) (v18 or higher)

> **Lightweight Deployment Note**: Saki's Web/API service core can be deployed with as little as `2 hCPU` and `200 MB` RAM. Additional resources are required if running Ollama, Stable Diffusion, GPT-SoVITS, or other model services on the same machine, per those services' requirements.

### 1. Windows Startup
For both initial installation and daily use, you only need to do this:

1.  Find the **`start.bat`** file in the project root directory.
2.  **Double-click to run**.
    *   The script will automatically check the environment.
    *   Automatically installs frontend (`frontend/`) and backend (`backend/`) dependencies.
    *   Automatically starts both the Web and API services simultaneously.
3.  Open your browser to `http://localhost:5432`.

> To access from other devices on the LAN or public internet, use `http://<Your-IP-Address>:5432` and ensure port 5432 is allowed through the firewall.

### 2. macOS/Linux Startup
1.  Open a terminal, navigate to the project root directory.
2.  Run the following commands:
    bash
    chmod +x deploy.sh
    ./deploy.sh


> The first run for dependency installation may take a few minutes. Please do not close the window before seeing "Services stopped."

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
Saki natively supports connecting to various language models (like Gemma3, Qwen3, GLM series, etc.) running locally via Ollama. This project recommends prioritizing the **local small model route**: `8B-12B` models can achieve good Chinese assistant results here, currently recommending **`glm-4.7-flash`**. This ensures a good daily experience while significantly reducing reliance on powerful cloud models, cutting long-term token consumption. Simply create a model instance in Ollama and enter the correct URL in Saki's settings (typically `http://127.0.0.1:11434` for a local Ollama).

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

> Real keys are saved locally in `data/global_config.json`, which is ignored by Git by default. The repository only contains `data/global_config.example.json` as a blank template.

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
*   **Data Storage**: Local JSON file storage (in the `data/` directory). No need for MySQL/MongoDB, ensuring true data privacy and portability.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Why can't the browser connect after startup?**  
A: Check the terminal window for errors. It's often because ports 5431 (backend) or 5432 (frontend) are occupied, or the firewall is blocking them. Try closing other processes or opening the firewall ports and try again.

**Q: How do I switch models?**  
A: After configuring the corresponding model service, available models will automatically appear in the top selector. Select and save, Saki will switch automatically. If you have multiple cloud API keys configured, you can enable "Show all enabled API models" in the settings, and the top list will display models from all enabled channels.

**Q: Will my cloud API keys be uploaded to GitHub?**  
A: No. Real configuration is saved in `data/global_config.json`, which is ignored by `.gitignore` by default. The repository only provides a blank `data/global_config.example.json` template.

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

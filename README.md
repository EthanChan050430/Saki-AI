<div align="center">

# Saki AI Agent
### Local-first AI workspace for code, files, research and long-term collaboration

Local-first AI Workspace · Model Choice · Recoverable Workflows · Beyond Coding

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v22.12%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

**Saki AI is a local-first AI workspace built for Chinese-speaking users.** Connect local or cloud models in one GUI, let the agent work on your code, workspace files and terminal tasks, and bring research, documents, slides, long-term memory and QQ workflows into your daily work.

Saki takes the task-driven collaboration of coding agents like **Codex and Claude Code** as its reference point. It does not claim to out-code them. The goal is a **personal AI workspace that isn't locked to one model, covers more than coding, and lets you manage and roll back tasks on your own machine**. The UI is served by a local web service; the Windows portable build launches it from an EXE and opens your browser. It is not a native desktop GUI.

**[Download Windows Portable](https://github.com/EthanChan050430/Saki-AI/releases/latest)** · [Quick Start](#quick-start) · [Low-resource Deployment](docs/deployment.md) · [Plugins](docs/plugin-marketplace.md)

> **Keywords**: Desktop AI Agent · Coding Agent · Local-first · Ollama / LM Studio · MCP · Workspace Checkpoints · Long-term Memory · Research & Office



https://github.com/user-attachments/assets/91ac7121-2a01-4751-a0c3-bc257e097b0e

## A closer look at Saki

Your ideas, models and tools, together in a personal workspace.

![Saki AI workspace — a local-first home for ideas, multi-model collaboration and long-term memory](.github/assets/saki-workspace-poster-en.png)

Extend your workflow with plugins, MCP tools and dedicated Skills.

![Saki AI plugin marketplace — discover plugins, MCP tools and dedicated Skills](.github/assets/saki-extensions-poster-en.png)

## Start on the desktop, keep exploring

Add new abilities to your AI workflow and take it all the way to your servers. These two projects show what else Saki can do.

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/EthanChan050430/saki-plugins"><img src=".github/assets/explore-extensions-zh.svg" width="640" alt="Extensions — explore the saki-plugins repository" /></a>
      <p>Find plugins, MCP tools and Skills for everyday tasks. Saki's plugin marketplace installs plugins straight from the repository, or you can start from an example and build your own.</p>
      <p><a href="https://github.com/EthanChan050430/saki-plugins"><strong>Browse extensions · View repo ↗</strong></a></p>
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/EthanChan050430/Saki-Panel"><img src=".github/assets/explore-saki-panel-zh.svg" width="640" alt="Saki Panel — open-source server panel with an AI assistant" /></a>
      <p>From your desktop to your servers. Manage Minecraft, Steam, Docker and regular processes in one web console, and let Saki troubleshoot with logs, files and node metrics.</p>
      <p><a href="https://github.com/EthanChan050430/Saki-Panel"><strong>Meet Saki Panel · View repo ↗</strong></a></p>
    </td>
  </tr>
</table>

## What it does

- **Any model**: Ollama, LM Studio, OpenAI, Anthropic, Gemini, DeepSeek, Zhipu, Kimi, Qwen, Doubao, MiniMax, or any OpenAI-compatible endpoint. Keys are stored per provider; switch models from the top bar.
- **Real work in your repo**: reads and edits files, runs terminal commands, and shows every tool call and diff.
- **Undo anything in the workspace**: each turn snapshots the workspace before the agent starts, including changes made from the terminal. Jump back to any turn. No Git required.
- **Steer while it runs**: add instructions mid-task, queue follow-ups, edit or cancel them.
- **Long-term memory**: preferences and project rules carry across sessions.
- **Beyond code**: PDF / Office Q&A, multi-source deep research, PPT generation and export, claim checking.
- **Story Glass**: tell Saki a story and she mixes a cocktail for it, served as a shareable card.
- **Extensible**: MCP, Skills, and a plugin marketplace. Optional QQ bot, Stable Diffusion and GPT-SoVITS voice.
- **Lightweight**: one process, one port in production. Data lives in local JSON files, no database needed.

### Memory correctness

Explicit replacement (including edits through the memory API) replaces both the
current content and summary. Previous content, summary and provenance remain in
the record's `history` with validity timestamps; ordinary recall uses the current
version. Replacement also resets derived tags, aliases and confidence instead of
carrying stale metadata forward. This is not automatic semantic conflict resolution:
records still match by name/slug, and the default merge behavior is unchanged.

Automatic LLM extraction requires an exact supporting quote from the user message.
Accepted captures retain the quote, chat ID, source role and observation time.
Quote matching establishes traceability, not proof that the model's interpretation
is correct. A successful empty extraction does not fall back to heuristic capture;
failed extraction is logged and can still use user-only heuristics. When extraction
succeeds, heuristic short-term promotion for that turn is skipped. Assistant text
remains conversation context but does not generate short-term fact candidates.

Malformed primary memory JSON stops reads/writes and legacy import with an error,
rather than silently treating the store as empty. Restore a known-good backup
before retrying. Existing records need no migration for these additive fields.
Explicit `MemoryService` scopes use separate storage directories, including mirrors,
working memory, queues and graphs. The default instance keeps the existing layout;
request-level owner/project routing is not yet enabled by the server.
Deletion persists a tombstone before cleaning matching queued/short-term copies and
linked graph entries. Automatic writes and legacy imports cannot recreate matching
deleted records; intentional restoration requires `restoreDeleted: true`.
This matches names/identifiers/content signatures, not semantic paraphrases, and is
not erasure of source conversations, working context, logs or unlinked graph facts.
Offline long-term candidates now require an exact user-message quote and retain
its provenance; this rule does not yet validate graph entities and relations.

Search reads existing vectors without embedding every document. Writes update their
own vectors; `rebuildVectorIndex()` explicitly fills missing/stale entries and removes
orphans. Until rebuilt, legacy records without vectors use lexical retrieval.
Core JSON stores use temporary-file replacement to avoid truncated destination
files. This is not a multi-file transaction or protection against concurrent
read-modify-write updates. SQLite migration, concurrency serialization, server-level
scope routing and complete cross-layer forgetting remain follow-up work.

## Quick Start

**Windows portable**: download `Saki-AI-3.0-win-x64.zip`, unzip, run `Saki-AI.exe`. Your browser opens http://127.0.0.1:5480. Add a model in Settings and you're set. Node.js is bundled.

**From source** (Windows / macOS / Linux, Node.js 22.12+):

```bash
git clone https://github.com/EthanChan050430/Saki-AI.git
cd Saki-AI
node scripts/launch.cjs
```

The first launch installs dependencies and builds the frontend. On macOS / Linux, `bash deploy.sh start` runs it in the background. For low-spec machines, see the [deployment guide](docs/deployment.md).

## Heads up

Approvals and path checks are app-level guards, not an OS sandbox. Terminal commands and third-party plugins run with your user's permissions, so only grant the folders you need. Checkpoints restore workspace files only; requests and messages already sent can't be undone.

## Contributing

Issues and PRs welcome. Licensed under [Apache 2.0](LICENSE).

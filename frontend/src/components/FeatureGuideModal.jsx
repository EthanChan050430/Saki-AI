import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Keyboard,
  MessageSquare,
  MonitorPlay,
  Settings2,
  Shield,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';

function GuideEntry({ entry }) {
  return (
    <article className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">{entry.title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">{entry.summary}</p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
          {entry.badge}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{entry.entryLabel}</div>
          <div className="mt-1 text-sm font-medium leading-6 text-slate-700">{entry.entry}</div>
        </div>
        <div className="rounded-2xl bg-amber-50/80 px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">{entry.howLabel}</div>
          <div className="mt-1 text-sm font-medium leading-6 text-slate-700">{entry.how}</div>
        </div>
      </div>
      {entry.tip ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3.5 py-3 text-sm leading-6 text-emerald-900">
          <span className="font-semibold">{entry.tipLabel}</span> {entry.tip}
        </div>
      ) : null}
    </article>
  );
}

export default function FeatureGuideModal({ isOpen, onClose, onStartOnboarding, windowed = false }) {
  const { i18n } = useTranslation();
  const isZh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const getLocalText = (zhText, enText) => (isZh ? zhText : enText);
  const scrollAreaRef = useRef(null);
  const sectionRefs = useRef({});

  const guideSections = useMemo(() => ([
    {
      id: 'shortcuts',
      title: getLocalText('快捷键与命令', 'Shortcuts and Commands'),
      summary: getLocalText('熟悉这些入口后，很多操作都能一步到位，减少频繁切换与点按。', 'Once you know these entry points, many actions become one-step flows.'),
      directoryItems: ['Cmd/Ctrl + K', getLocalText('/ 命令', '/ Commands')],
      icon: Keyboard,
      entries: [
        {
          title: getLocalText('全局搜索 / 功能跳转', 'Global search / jump'),
          summary: getLocalText('快速检索历史会话或跳到常用功能入口。', 'Jump quickly to chat history or commonly used feature entry points.'),
          badge: 'Cmd/Ctrl + K',
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('在任意页面按下 `Cmd/Ctrl + K`。', 'Press `Cmd/Ctrl + K` anywhere in the app.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('输入会话标题、功能名或关键词，回车即可打开。', 'Type a conversation title, feature name, or keyword, then press Enter.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('当对话很多时，它是最快的找回旧讨论方式。', 'It is the fastest way to revisit older discussions once history grows.'),
        },
        {
          title: getLocalText('斜杠命令', 'Slash commands'),
          summary: getLocalText('在输入阶段直接切换工作模式，不用先点按钮。', 'Switch working modes directly from the composer without extra clicks.'),
          badge: '/commands',
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('在输入框中直接输入 `/`。', 'Type `/` in the chat composer.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('可用命令包括 `/image`、`/file`、`/ppt`、`/deep`。', 'Available commands include `/image`, `/file`, `/ppt`, and `/deep`.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('先选模式再描述需求，系统更容易直接进入正确工具流。', 'Choose the mode first, then describe the task so the assistant enters the right workflow sooner.'),
        },
      ],
    },
    {
      id: 'sidebar-tools',
      title: getLocalText('侧边栏工具区', 'Sidebar Tooling'),
      summary: getLocalText('这里负责资料、能力、自动化和外部通道，是工作台的工具中枢。', 'This is the tool hub for knowledge, capabilities, automation, and external channels.'),
      directoryItems: [getLocalText('记忆', 'Memory'), 'Skill', getLocalText('任务', 'Tasks'), getLocalText('文件', 'Files'), getLocalText('第三方', '3rd-party')],
      icon: Wrench,
      entries: [
        {
          title: getLocalText('记忆系统', 'Memory manager'),
          summary: getLocalText('保存长期记忆、偏好和项目背景，减少重复说明。', 'Store long-term memory, preferences, and project context so you repeat yourself less.'),
          badge: getLocalText('记忆', 'Memory'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('左侧 dock 的记忆图标。', 'The memory icon in the left dock.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('可以新增、搜索和编辑记忆，也能从历史对话里抽取信息。', 'Create, search, and edit memories, or pull information from past chats.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('把常用编码规范、项目背景和个人偏好放进去最有价值。', 'It works best for coding rules, project context, and personal preferences you reuse often.'),
        },
        {
          title: getLocalText('Skill 系统', 'Skill system'),
          summary: getLocalText('安装、启停和管理扩展技能。', 'Install, enable, and manage extension skills.'),
          badge: getLocalText('技能', 'Skills'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('左侧 dock 的扳手图标。', 'The wrench icon in the left dock.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('可以查看已安装 skill，也能从 OpenHub 搜索并安装新能力。', 'Review installed skills locally or search OpenHub for new ones.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('安装后先看详情页，确认 skill 的用途与适用范围。', 'After installing, open the detail view to understand the intended use and scope of the skill.'),
        },
        {
          title: getLocalText('托管任务 / 文件管理 / 第三方聊天', 'Hosted tasks / Files / Third-party chats'),
          summary: getLocalText('分别负责自动化、文件工作流和外部消息接入。', 'These tools cover automation, file workflows, and connected chat channels.'),
          badge: getLocalText('工具', 'Tools'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('左侧 dock 的时钟、文件夹和聊天气泡图标。', 'The clock, folder, and message bubble icons in the left dock.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('托管任务适合周期执行；文件管理器用于浏览工作区；第三方聊天可接入 QQ 等外部消息。', 'Use hosted tasks for scheduled work, the file manager for workspace browsing, and third-party chat for external channels like QQ.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('桌面端可以把这些窗口和平铺设置一起打开，边看边配。', 'On desktop, you can tile these windows alongside Settings while you configure things.'),
        },
      ],
    },
    {
      id: 'creation',
      title: getLocalText('研究、演示与创作', 'Research, Slides, and Creation'),
      summary: getLocalText('适合长内容生成、资料整理和演示输出。', 'Best for long-form output, research synthesis, and presentation workflows.'),
      directoryItems: [getLocalText('深度研究', 'Research'), 'PPT'],
      icon: MonitorPlay,
      entries: [
        {
          title: getLocalText('深度研究', 'Deep research'),
          summary: getLocalText('自动整理资料、展示研究过程，并输出完整报告。', 'Collects material, shows the research process, and generates a report.'),
          badge: getLocalText('研究', 'Research'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('输入 `/deep`，或直接提出深度研究需求。', 'Type `/deep`, or ask explicitly for a deep research workflow.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('完成后可直接阅读报告，并导出 Markdown 或 PDF。', 'Once complete, read the report in the panel and export it as Markdown or PDF.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('问题越具体，研究结构和最终报告通常越清晰。', 'The more specific your question, the clearer the report structure and conclusions will be.'),
        },
        {
          title: getLocalText('PPT 生成', 'PPT generation'),
          summary: getLocalText('把主题快速整理成演示结构，并支持全屏专注编辑。', 'Turns a topic into a slide structure and supports focused fullscreen editing.'),
          badge: 'PPT',
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('输入 `/ppt`，或直接描述你要做的演示主题。', 'Type `/ppt`, or directly describe the presentation topic you want.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('生成后可继续在面板内编辑、预览，并切到全屏专注模式。', 'After generation, keep editing and previewing in the panel, or switch to fullscreen focus mode.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('给出受众、页数和风格要求，成稿会更接近可直接展示的状态。', 'Provide audience, slide count, and style constraints for output that is closer to presentation-ready.'),
        },
      ],
    },
    {
      id: 'chat-quality',
      title: getLocalText('聊天体验增强', 'Chat Experience Enhancements'),
      summary: getLocalText('这些能力不是单独入口，但会明显提升日常使用手感。', 'These are not primary entry points, but they noticeably improve everyday interaction quality.'),
      directoryItems: [getLocalText('拖拽上传', 'Drag Upload'), getLocalText('消息工具栏', 'Toolbar'), getLocalText('代码复制', 'Code Copy')],
      icon: MessageSquare,
      entries: [
        {
          title: getLocalText('拖拽上传与即时占位', 'Drag-and-drop and instant placeholders'),
          summary: getLocalText('拖入文件时会出现全屏上传提示，发送后 AI 占位会立刻出现。', 'Dragging files into the window shows a fullscreen hint, and an optimistic assistant placeholder appears right after sending.'),
          badge: getLocalText('效率', 'Speed'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('把文件拖到聊天窗口，或直接发送消息。', 'Drag a file into the chat window, or just send a message normally.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('按提示释放文件即可上传；消息发出后会立即看到“处理中”的 AI 占位项。', 'Drop the file when prompted to upload it; after sending, the assistant placeholder appears immediately.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('做文件相关任务时，先上传素材再描述需求通常更高效。', 'For file-heavy tasks, upload the material first and then describe the goal.'),
        },
        {
          title: getLocalText('消息工具栏与代码块增强', 'Message toolbar and code blocks'),
          summary: getLocalText('悬浮消息可复制、重发、编辑、删除和朗读；代码块支持语言标签与一键复制。', 'Hovering a message reveals copy, redo, edit, delete, and read-aloud actions; code blocks show language labels and copy buttons.'),
          badge: getLocalText('交互', 'Interaction'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('把鼠标移到消息上，或查看 AI 返回的代码块。', 'Hover over messages, or inspect AI code blocks in a response.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('消息工具栏适合快速修正历史；代码块可以直接复制到工作区。', 'Use the message toolbar to revise history quickly, and copy code snippets straight into your workspace.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('“重发”和“删除”会配合文件回滚逻辑，适合处理生成式修改。', 'Redo and delete integrate with file rollback, which is especially useful for generated changes.'),
        },
      ],
    },
    {
      id: 'smart-modes',
      title: getLocalText('智能能力与安全', 'Smart Modes and Safety'),
      summary: getLocalText('这里集中说明音乐生成、智链核验和权限模式，帮助你在执行前先判断该开哪种能力。', 'This section covers music generation, Zhilian verification, and permission modes so you can choose the right capability before the agent acts.'),
      directoryItems: [getLocalText('音乐生成', 'Music'), getLocalText('智链', 'Zhilian'), getLocalText('权限模式', 'Permissions')],
      icon: Shield,
      entries: [
        {
          title: getLocalText('音乐生成', 'Music generation'),
          summary: getLocalText('开启后，Agent 不只会描述旋律想法，而是能直接生成可下载的 MIDI 纯音乐草稿，适合 BGM、循环段和灵感 demo。', 'When enabled, the agent can generate downloadable instrumental MIDI sketches instead of only describing a melody idea, which is great for BGM, loops, and demos.'),
          badge: 'MIDI',
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('先到“设置 > 音乐创作”确认已开启，再在聊天里直接描述风格、情绪、速度或使用场景。', 'Enable it in Settings > Music Creation, then describe the style, mood, tempo, or use case directly in chat.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('生成完成后，消息里会附带音乐卡片，支持试听、查看曲目概要，并下载 `.mid` 文件继续改编。', 'The result appears as a music card in chat with preview, a short track summary, and a `.mid` download for further editing.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('它目前更适合纯音乐和伴奏草稿；如果关闭此项，Agent 会隐藏 `composeMusic` 工具，不再执行 MIDI 生成。', 'This currently works best for instrumental sketches and backing tracks; if disabled, the agent hides `composeMusic` and stops generating MIDI files.'),
        },
        {
          title: getLocalText('智链可信度核验', 'Zhilian credibility check'),
          summary: getLocalText('适合核验一句话、一个观点或一条热点消息是否靠谱，系统会提取关键词并联动多搜索源做交叉查证。', 'Use this to verify whether a claim, viewpoint, or trending statement is trustworthy by extracting keywords and checking multiple search sources.'),
          badge: getLocalText('智链', 'Zhilian'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('点击聊天工具栏里的“智链”，或输入 `/truth`、`/verify` 切换到核验模式。', 'Click Zhilian in the chat toolbar, or use `/truth` or `/verify` to switch into verification mode.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('系统会展示查证进度、证据来源、支持或反驳关系，以及最终可信度评分，适合快速辨别真假。', 'The app shows verification progress, evidence sources, support or contradiction signals, and a final credibility score for quick fact checking.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('智链更适合核验“明确主张”；如果你需要更长的资料整理、综述和报告，优先使用“深度研究”。', 'Zhilian works best on clear claims. If you need longer synthesis, research structure, or report output, use Deep Research instead.'),
        },
        {
          title: getLocalText('权限模式', 'Permission modes'),
          summary: getLocalText('这个开关决定 Agent 对终端和文件工具的访问边界：默认权限更稳妥，完全访问适合更深入的本地操作。', 'This switch controls how far the agent can go with terminal and file tools: Default Permission is safer, while Full Access is meant for deeper local work.'),
          badge: getLocalText('安全', 'Safety'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('聊天工具栏里可以直接切换“默认权限 / 完全访问”，执行任务前先确认当前模式。', 'Use the Default Permission / Full Access toggle in the chat toolbar and confirm the current mode before asking for actions.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('默认权限下，终端与文件工具会被限制在沙盒范围内，敏感操作可能暂停等待确认；完全访问则允许进入更广的工作区。', 'In Default Permission, terminal and file tools stay inside the sandbox and sensitive actions may pause for confirmation; Full Access opens the broader workspace.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('日常对话、资料整理和低风险任务建议保持默认权限；只有在明确需要跨目录读写或更深系统操作时再切到完全访问。', 'Keep Default Permission for everyday and low-risk work, and only switch to Full Access when you clearly need broader file access or deeper system actions.'),
        },
      ],
    },
    {
      id: 'personalization',
      title: getLocalText('个性化与设置', 'Personalization and Settings'),
      summary: getLocalText('把模型、背景、语音和角色体验调到最顺手。', 'Tune models, backgrounds, voice, and the overall assistant experience.'),
      directoryItems: [getLocalText('设置', 'Settings'), getLocalText('立绘', 'Character'), getLocalText('音乐/朗读', 'Audio')],
      icon: Settings2,
      entries: [
        {
          title: getLocalText('设置面板', 'Settings panel'),
          summary: getLocalText('管理模型、API、搜索、头像、背景、音乐和其他界面偏好。', 'Manage providers, APIs, search, avatars, backgrounds, music, and other interface preferences.'),
          badge: getLocalText('设置', 'Settings'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('左下角“设置”按钮。', 'The bottom-left Settings button.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('按模块逐项配置，保存后会立即影响聊天和外部功能。', 'Configure each area section by section; changes take effect immediately across chat and tools.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('先确认模型与搜索，再细调背景、语音和头像，会更稳。', 'Set your model and search options first, then fine-tune cosmetics like background, voice, and avatar.'),
        },
        {
          title: getLocalText('立绘与沉浸功能', 'Character view and immersion'),
          summary: getLocalText('桌面端支持拖拽立绘、收缩为气泡，也能配合音乐和朗读一起使用。', 'On desktop, the character view can be dragged or collapsed into a bubble, and it works nicely with music and read-aloud features.'),
          badge: getLocalText('沉浸', 'Immersion'),
          entryLabel: getLocalText('入口', 'Entry'),
          entry: getLocalText('聊天界面右下区域与顶部的音频相关控件。', 'The lower-right character area and the audio-related controls in the header.'),
          howLabel: getLocalText('如何使用', 'How to use'),
          how: getLocalText('按需展开或收起立绘；如果开启音乐或朗读，整体体验会更偏陪伴式助手。', 'Expand or collapse the character view as needed; music and read-aloud make the experience feel more like a companion assistant.'),
          tipLabel: getLocalText('建议：', 'Tip:'),
          tip: getLocalText('如果你更看重工作区面积，可以把立绘折叠成小气泡。', 'If you need more workspace, collapse the character into a small bubble.'),
        },
      ],
    },
    {
      id: 'credits',
      title: getLocalText('作者与开源信息', 'Author and Open-source Info'),
      summary: getLocalText('这里集中展示作者信息与项目协议，不再放在页脚。', 'This section keeps authorship and license details alongside the rest of the modules.'),
      directoryItems: [getLocalText('作者', 'Author'), getLocalText('协议', 'License')],
      icon: Sparkles,
      entries: [
        {
          title: getLocalText('作者信息', 'Author'),
          summary: getLocalText('本工作台与功能指南的设计、开发与维护者。', 'The designer, builder, and maintainer of this workspace and guide.'),
          badge: getLocalText('作者', 'Author'),
          entryLabel: getLocalText('名称', 'Name'),
          entry: 'EthanChan050430',
          howLabel: getLocalText('说明', 'Details'),
          how: getLocalText('当前工作台的交互组织、工具入口和模块联动由 EthanChan050430 统一维护。', 'The workspace interactions, tool entry points, and module coordination are maintained by EthanChan050430.'),
        },
        {
          title: getLocalText('开源协议', 'Open-source license'),
          summary: getLocalText('项目当前采用的开源许可方式。', 'The open-source license used by this project.'),
          badge: getLocalText('协议', 'License'),
          entryLabel: getLocalText('协议', 'License'),
          entry: 'Apache License 2.0',
          howLabel: getLocalText('查看方式', 'Where to review'),
          how: getLocalText('完整协议内容可在项目根目录的 `LICENSE` 文件中查看。', 'You can review the full license text in the root `LICENSE` file.'),
        },
      ],
    },
  ]), [i18n.language, i18n.resolvedLanguage]);

  const directoryFeatureMap = useMemo(() => {
    const seen = new Set();
    return guideSections
      .flatMap((section) => section.directoryItems || [])
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }, [guideSections]);

  const directoryFeatureTargets = useMemo(() => {
    const targets = {};
    guideSections.forEach((section) => {
      (section.directoryItems || []).forEach((item) => {
        if (!item || targets[item]) return;
        targets[item] = section.id;
      });
    });
    return targets;
  }, [guideSections]);

  const [activeSection, setActiveSection] = useState(guideSections[0]?.id || '');

  useEffect(() => {
    setActiveSection(guideSections[0]?.id || '');
  }, [guideSections]);

  useEffect(() => {
    const container = scrollAreaRef.current;
    if (!container) return undefined;

    const handleScroll = () => {
      const threshold = container.scrollTop + 120;
      let current = guideSections[0]?.id || '';

      guideSections.forEach((section) => {
        const element = sectionRefs.current[section.id];
        if (!element) return;
        if (element.offsetTop <= threshold) {
          current = section.id;
        }
      });

      setActiveSection((prev) => (prev === current ? prev : current));
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [guideSections]);

  const scrollToSection = (sectionId) => {
    const container = scrollAreaRef.current;
    const element = sectionRefs.current[sectionId];
    if (!container || !element) return;
    container.scrollTo({
      top: Math.max(0, element.offsetTop - 24),
      behavior: 'smooth',
    });
    setActiveSection(sectionId);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[118] flex items-center justify-center bg-black/60 p-0 backdrop-blur-md sm:p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div
        className={
          windowed
            ? 'flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-white shadow-none'
            : 'flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-[2rem]'
        }
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(251,191,36,0.1),rgba(255,255,255,0.96))] px-5 py-5 sm:px-6">
          <div className="absolute inset-y-0 right-0 w-48 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_72%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 shadow-sm">
                <BookOpen size={14} />
                <span>{getLocalText('功能 Wiki', 'Feature Wiki')}</span>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                {getLocalText('功能导航与使用手册', 'Feature guide and usage manual')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                {getLocalText(
                  '这里直接展示各个模块的入口、用法和高频提示，适合快速扫一眼后直接上手。',
                  'This view presents each module directly so you can scan entry points, usage patterns, and high-frequency tips at a glance.'
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onStartOnboarding?.()}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onStartOnboarding}
                >
                  <Sparkles size={15} />
                  <span>{getLocalText('开启新手引导', 'Start onboarding')}</span>
                </button>
                <p className="text-xs leading-6 text-slate-500">
                  {getLocalText('想重新认识各个入口时，可以随时从这里重新播放引导。', 'Replay the guided tour anytime to revisit the main entry points.')}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="relative z-10 rounded-full p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="max-h-[38vh] overflow-y-auto border-b border-slate-200 bg-slate-50/80 md:max-h-none md:w-[270px] md:min-h-0 md:border-b-0 md:border-r">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {getLocalText('功能一览', 'Quick Map')}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {directoryFeatureMap.map((item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => scrollToSection(directoryFeatureTargets[item])}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        activeSection === directoryFeatureTargets[item]
                          ? 'border-sky-300 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {getLocalText('目录索引', 'Directory')}
                </div>
                <div className="space-y-2">
                  {guideSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full rounded-[1.2rem] border px-3 py-3 text-left transition-all ${
                          isActive
                            ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-[0_10px_30px_rgba(14,165,233,0.12)]'
                            : 'border-slate-200/70 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`rounded-xl p-2 ${isActive ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold leading-5">{section.title}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(section.directoryItems || []).map((item) => (
                            <span
                              key={`${section.id}-${item}`}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isActive ? 'bg-white text-sky-700' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] px-4 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto max-w-4xl space-y-6">
              {guideSections.map((section) => {
                const Icon = section.icon;
                return (
                  <section
                    key={section.id}
                    ref={(node) => {
                      sectionRefs.current[section.id] = node;
                    }}
                    className="scroll-mt-6 rounded-[1.75rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.06)] sm:p-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-lg shadow-slate-200">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight text-slate-900">{section.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{section.summary}</p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-4">
                      {section.entries.map((entry) => (
                        <GuideEntry key={entry.title} entry={entry} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

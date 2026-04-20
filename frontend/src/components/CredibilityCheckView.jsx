import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  ExternalLink,
  Gauge,
  Globe2,
  Link2,
  Loader2,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreTone(score = 0) {
  if (score >= 75) {
    return {
      accent: '#16a34a',
      chip: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      glow: 'from-emerald-500 to-teal-500',
    };
  }

  if (score >= 55) {
    return {
      accent: '#0891b2',
      chip: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      glow: 'from-cyan-500 to-sky-500',
    };
  }

  if (score >= 40) {
    return {
      accent: '#d97706',
      chip: 'bg-amber-100 text-amber-700 border-amber-200',
      glow: 'from-amber-500 to-orange-500',
    };
  }

  return {
    accent: '#dc2626',
    chip: 'bg-rose-100 text-rose-700 border-rose-200',
    glow: 'from-rose-500 to-red-500',
  };
}

function getVerdictStyle(verdict = 'mixed') {
  if (verdict === 'likely_true' || verdict === 'lean_true') {
    return {
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }

  if (verdict === 'likely_false' || verdict === 'lean_false') {
    return {
      badge: 'bg-rose-100 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
    };
  }

  if (verdict === 'unverified') {
    return {
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-500',
    };
  }

  return {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  };
}

function getStageLabel(stage = '', getLocalText) {
  switch (stage) {
    case 'extracting':
      return getLocalText('提取关键信息', 'Extracting keywords');
    case 'searching':
      return getLocalText('多引擎检索', 'Searching engines');
    case 'reading':
      return getLocalText('读取证据', 'Reading evidence');
    case 'scoring':
      return getLocalText('综合评分', 'Scoring');
    case 'completed':
      return getLocalText('查证完成', 'Check complete');
    case 'error':
      return getLocalText('查证失败', 'Check failed');
    default:
      return getLocalText('准备中', 'Preparing');
  }
}

function getMetricMeta(getLocalText) {
  return {
    evidenceScore: {
      label: getLocalText('证据支持度', 'Evidence support'),
      icon: Radar,
      bar: 'from-rose-500 to-orange-400',
    },
    authorityScore: {
      label: getLocalText('来源权威度', 'Source authority'),
      icon: ShieldCheck,
      bar: 'from-sky-500 to-cyan-400',
    },
    diversityScore: {
      label: getLocalText('多源覆盖度', 'Coverage diversity'),
      icon: Globe2,
      bar: 'from-violet-500 to-fuchsia-400',
    },
    consistencyScore: {
      label: getLocalText('证据一致性', 'Evidence consistency'),
      icon: BadgeCheck,
      bar: 'from-emerald-500 to-teal-400',
    },
    emotionScore: {
      label: getLocalText('情绪风险控制', 'Emotion risk'),
      icon: Gauge,
      bar: 'from-amber-500 to-yellow-400',
    },
  };
}

function getSourceStanceMeta(stance = '', getLocalText) {
  if (stance === 'support') {
    return {
      label: getLocalText('支持', 'Supports'),
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
  }

  if (stance === 'contradict') {
    return {
      label: getLocalText('反驳', 'Contradicts'),
      badge: 'bg-rose-100 text-rose-700 border-rose-200',
    };
  }

  if (stance === 'mixed') {
    return {
      label: getLocalText('部分支持', 'Mixed'),
      badge: 'bg-amber-100 text-amber-700 border-amber-200',
    };
  }

  return {
    label: getLocalText('待确认', 'Unclear'),
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function getStepStatus(status = 'not-started') {
  if (status === 'success') return 'completed';
  return status;
}

function getStepStatusIcon(status) {
  const normalized = getStepStatus(status);
  if (normalized === 'completed') {
    return <CheckCircle2 size={15} className="text-emerald-500" />;
  }

  if (normalized === 'running') {
    return <Loader2 size={15} className="animate-spin text-sky-500" />;
  }

  if (normalized === 'error') {
    return <AlertTriangle size={15} className="text-rose-500" />;
  }

  return <Circle size={15} className="text-slate-300" />;
}

function toBulletList(items, emptyValue) {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyValue;
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function getHostname(url = '') {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getFallbackStepIndex(steps = []) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const status = getStepStatus(steps[index]?.status);
    if (status === 'running' || status === 'completed' || status === 'error') {
      return index;
    }
  }

  return 0;
}

function buildDerivedSteps(data, getLocalText, metricMeta) {
  const claim = String(data.claim || '').trim();
  const normalizedClaim = String(data.normalizedClaim || '').trim();
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const searchQueries = Array.isArray(data.searchQueries) ? data.searchQueries : [];
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const risks = Array.isArray(data.risks) ? data.risks : [];
  const metrics = data.metrics || {};
  const sourceStats = data.sourceStats || {};
  const sentiment = data.sentiment || {};
  const progress = clamp(Number(data.progress) || 0, 0, 100);
  const languageLabel = String(data.language || '').toLowerCase().startsWith('zh')
    ? getLocalText('中文', 'Chinese')
    : getLocalText('英文', 'English');
  const currentStage = String(data.currentStage || '');
  const currentIndexMap = {
    extracting: 0,
    searching: 1,
    reading: 2,
    scoring: 3,
    completed: 4,
    error: 4,
  };
  const currentIndex = Number.isInteger(currentIndexMap[currentStage]) ? currentIndexMap[currentStage] : 0;

  const resolveStatus = (stepIndex) => {
    if (data.status === 'completed') return 'completed';
    if (data.status === 'error') {
      if (stepIndex < currentIndex) return 'completed';
      if (stepIndex === currentIndex) return 'error';
      return 'not-started';
    }
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'running';
    return 'not-started';
  };

  const engineNames = Array.isArray(sourceStats.engines) ? sourceStats.engines : [];
  const sourceReasonLines = sources.slice(0, 4).map((source) => {
    const stanceLabel = getSourceStanceMeta(source.stance, getLocalText).label;
    const name = source.title || source.domain || source.url || getLocalText('未命名来源', 'Untitled source');
    const reason = source.reason || getLocalText('已进入证据池等待综合比对。', 'Included in the evidence pool for synthesis.');
    return `${name}: ${stanceLabel}。${reason}`;
  });
  const metricLines = Object.entries(metricMeta)
    .map(([key, meta]) => {
      const value = Math.round(clamp(Number(metrics[key]) || 0, 0, 100));
      return value > 0 || data.status === 'completed' ? `${meta.label}: ${value}/100` : '';
    })
    .filter(Boolean);

  const extractionContent = [
    `### ${getLocalText('待核验表述', 'Claim under review')}`,
    claim || getLocalText('等待用户发送需要核验的信息。', 'Waiting for a claim to verify.'),
    `### ${getLocalText('结构化拆解', 'Structured extraction')}`,
    [
      `${getLocalText('规范化表述', 'Normalized claim')}: ${normalizedClaim || claim || getLocalText('正在整理', 'Preparing')}`,
      `${getLocalText('语言', 'Language')}: ${languageLabel}`,
      `${getLocalText('当前进度', 'Progress')}: ${progress}%`,
      `${getLocalText('当前阶段', 'Current stage')}: ${getStageLabel(currentStage, getLocalText)}`,
      `${getLocalText('关键词', 'Keywords')}: ${keywords.join(' / ') || getLocalText('正在提取', 'Extracting')}`,
      `${getLocalText('检索语句', 'Search queries')}: ${searchQueries.join(' / ') || getLocalText('生成中', 'Generating')}`,
    ].map((line) => `- ${line}`).join('\n'),
  ].join('\n\n');

  const searchContent = [
    `### ${getLocalText('检索覆盖', 'Search coverage')}`,
    [
      `${getLocalText('搜索引擎', 'Search engines')}: ${engineNames.join(', ') || getLocalText('待启动', 'Pending')}`,
      `${getLocalText('原始结果量', 'Raw results')}: ${sourceStats.resultCount || 0}`,
      `${getLocalText('独立站点数', 'Unique domains')}: ${sourceStats.uniqueDomains || 0}`,
      `${getLocalText('入选证据源', 'Selected sources')}: ${sourceStats.selectedSourceCount || sources.length || 0}`,
    ].map((line) => `- ${line}`).join('\n'),
    `### ${getLocalText('检索策略', 'Search strategy')}`,
    toBulletList(
      searchQueries,
      `- ${getLocalText('正在根据关键词构建更稳健的查询语句。', 'Building verification-friendly queries from the claim.')}`
    ),
  ].join('\n\n');

  const evidenceContent = [
    `### ${getLocalText('证据倾向分布', 'Evidence stance distribution')}`,
    [
      `${getLocalText('支持权重', 'Support weight')}: ${sourceStats.supportCount || 0}`,
      `${getLocalText('反驳权重', 'Contradict weight')}: ${sourceStats.contradictCount || 0}`,
      `${getLocalText('混合权重', 'Mixed weight')}: ${sourceStats.mixedCount || 0}`,
      `${getLocalText('待确认权重', 'Unclear weight')}: ${sourceStats.unclearCount || 0}`,
      `${getLocalText('高权威来源', 'Authoritative sources')}: ${sourceStats.authoritativeSourceCount || 0}`,
      `${getLocalText('多引擎交叉命中', 'Multi-engine hits')}: ${sourceStats.multiEngineHits || 0}`,
    ].map((line) => `- ${line}`).join('\n'),
    `### ${getLocalText('情绪与叙事风险', 'Emotion and framing risk')}`,
    [
      `${getLocalText('情绪强度', 'Emotionality')}: ${Math.round(Number(sentiment.emotionality) || 0)}/100`,
      `${getLocalText('说明', 'Interpretation')}: ${getLocalText('数值越高，越可能存在煽动性、夸张性或带节奏表述。', 'Higher values suggest more sensational or emotionally loaded wording.')}`,
    ].map((line) => `- ${line}`).join('\n'),
    `### ${getLocalText('重点来源观察', 'Key source observations')}`,
    toBulletList(
      sourceReasonLines,
      `- ${getLocalText('正在读取网页正文并提炼证据方向。', 'Reading source pages and extracting evidence direction.')}`
    ),
  ].join('\n\n');

  const scoringContent = [
    `### ${getLocalText('可信度评分框架', 'Credibility scoring framework')}`,
    [
      `${getLocalText('当前可信度分数', 'Current score')}: ${Number(data.score) || 0}/100`,
      `${getLocalText('结论标签', 'Verdict label')}: ${data.verdictLabel || getLocalText('待生成', 'Pending')}`,
      `${getLocalText('评分状态', 'Status')}: ${getStageLabel(currentStage, getLocalText)}`,
    ].map((line) => `- ${line}`).join('\n'),
    `### ${getLocalText('维度拆分', 'Dimension breakdown')}`,
    toBulletList(
      metricLines,
      `- ${getLocalText('正在把证据支持度、来源权威度、多源覆盖度、一致性和情绪风险合并评分。', 'Combining evidence, authority, diversity, consistency, and emotion-risk signals.')}`
    ),
  ].join('\n\n');

  const finalContent = [
    `### ${getLocalText('最终判断', 'Final verdict')}`,
    data.summary || getLocalText('系统正在汇总结论，请稍候。', 'The system is preparing the final verdict.'),
    `### ${getLocalText('关键发现', 'Key findings')}`,
    toBulletList(
      findings,
      `- ${getLocalText('结果生成后将在这里展示关键发现。', 'Key findings will appear here once synthesis finishes.')}`
    ),
    `### ${getLocalText('风险提醒', 'Cautions')}`,
    toBulletList(
      risks,
      `- ${getLocalText('结果生成后将在这里展示风险提醒。', 'Cautions will appear here once synthesis finishes.')}`
    ),
  ].join('\n\n');

  return [
    {
      id: 'extract',
      type: 'extract',
      title: getLocalText('1. 事实拆解', '1. Claim parsing'),
      status: resolveStatus(0),
      content: extractionContent,
      sources: [],
    },
    {
      id: 'search',
      type: 'search',
      title: getLocalText('2. 多引擎检索', '2. Multi-engine search'),
      status: resolveStatus(1),
      content: searchContent,
      sources: sources.slice(0, 4),
    },
    {
      id: 'evidence',
      type: 'evidence',
      title: getLocalText('3. 证据比对', '3. Evidence comparison'),
      status: resolveStatus(2),
      content: evidenceContent,
      sources: sources.slice(0, 4),
    },
    {
      id: 'scoring',
      type: 'scoring',
      title: getLocalText('4. 可信度评分', '4. Credibility scoring'),
      status: resolveStatus(3),
      content: scoringContent,
      sources: sources.slice(0, 4),
    },
    {
      id: 'verdict',
      type: 'verdict',
      title: getLocalText('5. 结果汇总', '5. Final verdict'),
      status: resolveStatus(4),
      content: finalContent,
      sources: sources.slice(0, 4),
    },
  ];
}

function SourceList({ sources, getLocalText }) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
        {getLocalText('该步骤暂无来源卡片。', 'No sources attached to this step yet.')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sources.map((source) => {
        const stanceMeta = getSourceStanceMeta(source.stance, getLocalText);
        const hostname = source.domain || getHostname(source.url) || getLocalText('来源', 'Source');
        return (
          <a
            key={source.sourceId || source.url}
            href={source.url || '#'}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4 transition-colors hover:border-sky-200 hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-sky-700">
                  {source.title || source.url || getLocalText('未命名来源', 'Untitled source')}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <span>{hostname}</span>
                  <span>{(Array.isArray(source.engines) ? source.engines : []).join(', ') || getLocalText('直连', 'Direct')}</span>
                </div>
              </div>
              <ExternalLink size={15} className="mt-0.5 shrink-0 text-slate-400 transition-colors group-hover:text-sky-600" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stanceMeta.badge}`}>
                {stanceMeta.label}
              </span>
              {Number(source.authorityScore) > 0 && (
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {getLocalText('权威度', 'Authority')}: {Math.round(Number(source.authorityScore) || 0)}
                </span>
              )}
            </div>

            {source.reason && (
              <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-slate-700">
                {source.reason}
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}

function QuickStatCard({ label, value, helper, tone = 'slate' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  };

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
      {helper && (
        <div className="mt-2 text-xs leading-5 text-slate-500">
          {helper}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  description,
  icon: Icon = Sparkles,
  badge = null,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/90 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/80"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {description && (
              <div className="mt-1 text-sm text-slate-500">
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function CredibilityCheckView({ data, isEmbedded = true }) {
  const safeData = data || {};
  const language = String(safeData.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const getLocalText = (zhText, enText) => (language === 'zh' ? zhText : enText);
  const metrics = safeData.metrics || {};
  const metricMeta = getMetricMeta(getLocalText);
  const tone = scoreTone(Number(safeData.score) || 0);
  const verdictStyle = getVerdictStyle(safeData.verdict);
  const sources = Array.isArray(safeData.sources) ? safeData.sources : [];
  const findings = Array.isArray(safeData.findings) ? safeData.findings : [];
  const risks = Array.isArray(safeData.risks) ? safeData.risks : [];
  const keywords = Array.isArray(safeData.keywords) ? safeData.keywords : [];
  const searchQueries = Array.isArray(safeData.searchQueries) ? safeData.searchQueries : [];
  const sourceStats = safeData.sourceStats || {};
  const sentiment = safeData.sentiment || {};
  const progress = clamp(Number(safeData.progress) || 0, 0, 100);
  const gaugeDegrees = clamp((Number(safeData.score) || 0) * 3.6, 0, 360);
  const isRunning = safeData.status === 'running';
  const isError = safeData.status === 'error';
  const resultReady = Boolean(safeData.summary || Number.isFinite(Number(safeData.score)) || safeData.status === 'completed');

  const steps = useMemo(() => {
    if (Array.isArray(safeData.steps) && safeData.steps.length > 0) {
      return safeData.steps;
    }

    return buildDerivedSteps(safeData, getLocalText, metricMeta);
  }, [getLocalText, metricMeta, safeData]);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState({
    stepDetail: true,
    stepSources: false,
    dimensions: false,
    searchIntel: false,
    findings: true,
    evidenceSources: false,
  });

  useEffect(() => {
    if (steps.length === 0) {
      if (activeStepIndex !== 0) {
        setActiveStepIndex(0);
      }
      return;
    }

    const runningIndex = steps.findIndex((step) => getStepStatus(step?.status) === 'running');
    if (runningIndex !== -1) {
      if (runningIndex !== activeStepIndex) {
        setActiveStepIndex(runningIndex);
      }
      return;
    }

    const fallbackIndex = Math.min(getFallbackStepIndex(steps), steps.length - 1);
    if (fallbackIndex !== activeStepIndex) {
      setActiveStepIndex(fallbackIndex);
    }
  }, [activeStepIndex, steps]);

  const activeStep = steps[activeStepIndex] || null;
  const activeStepStatus = getStepStatus(activeStep?.status);
  const toggleSection = (key) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    if (activeStepStatus === 'running') {
      setExpandedSections((prev) => (
        prev.stepDetail ? prev : { ...prev, stepDetail: true }
      ));
    }
  }, [activeStepStatus]);

  const heroInsights = [
    ...findings.slice(0, 2).map((text) => ({
      text,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    })),
    ...risks.slice(0, 1).map((text) => ({
      text,
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    })),
  ];
  const quickStats = [
    {
      label: getLocalText('搜索引擎', 'Engines'),
      value: sourceStats.engineCount || 0,
      helper: getLocalText('用于交叉检索', 'Used for cross-checking'),
      tone: 'sky',
    },
    {
      label: getLocalText('独立域名', 'Domains'),
      value: sourceStats.uniqueDomains || 0,
      helper: getLocalText('避免单一来源', 'Avoiding single-source bias'),
      tone: 'slate',
    },
    {
      label: getLocalText('权威来源', 'Authority'),
      value: sourceStats.authoritativeSourceCount || 0,
      helper: getLocalText('高可信来源数量', 'High-trust sources found'),
      tone: 'emerald',
    },
    {
      label: getLocalText('情绪强度', 'Emotion'),
      value: `${Math.round(Number(sentiment.emotionality) || 0)}/100`,
      helper: getLocalText('越高越要谨慎', 'Higher means more caution'),
      tone: Number(sentiment.emotionality) >= 60 ? 'amber' : 'rose',
    },
  ];

  return (
    <div
      className={`mt-4 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(145deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] shadow-[0_25px_60px_rgba(15,23,42,0.14)] ${isEmbedded ? '' : 'max-w-5xl'}`}
    >
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
              {isError ? <AlertTriangle size={18} /> : <Search size={18} />}
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                {getLocalText('智链可信度核验', 'Zhilian Verification')}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {safeData.claim || getLocalText('等待核验内容', 'Waiting for the claim')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${verdictStyle.badge}`}>
              <span className={`h-2 w-2 rounded-full ${verdictStyle.dot}`} />
              {safeData.verdictLabel || getStageLabel(safeData.currentStage, getLocalText)}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white shadow-md ${tone.glow}`}>
              <Sparkles size={12} />
              {getStageLabel(safeData.currentStage, getLocalText)}
            </span>
          </div>
        </div>

        {(isRunning || isError) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{getLocalText('当前进度', 'Current progress')}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            {safeData.error && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {safeData.error}
              </div>
            )}
          </div>
        )}
      </div>

      {!isError && (
        <div className="space-y-5 px-5 py-5">
          <div>
            <div className="px-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {getLocalText('结论速览', 'Quick take')}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {getLocalText('先看结论，再按需展开过程与证据。', 'See the conclusion first, then expand the process and evidence as needed.')}
              </div>
            </div>

            <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1.2fr),280px]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${verdictStyle.badge}`}>
                        <span className={`h-2 w-2 rounded-full ${verdictStyle.dot}`} />
                        {safeData.verdictLabel || getLocalText('等待结论', 'Pending verdict')}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {getStageLabel(safeData.currentStage, getLocalText)}
                      </span>
                    </div>

                    <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                      {safeData.summary || getLocalText('系统正在根据检索与证据比对生成最终判断。', 'The system is synthesizing the final judgement from search and evidence comparison.')}
                    </div>
                  </div>

                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${resultReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {resultReady ? getLocalText('结果已生成', 'Result ready') : getLocalText('分析中', 'Analyzing')}
                  </div>
                </div>

                {heroInsights.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {heroInsights.map((item, index) => (
                      <span
                        key={`${item.text}-${index}`}
                        className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-medium ${item.className}`}
                      >
                        <span className="truncate">{item.text}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {quickStats.map((item) => (
                    <QuickStatCard
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      helper={item.helper}
                      tone={item.tone}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {getLocalText('可信度评分', 'Credibility score')}
                </div>
                <div className="mt-4 flex items-center justify-center">
                  <div
                    className="relative flex h-36 w-36 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(${tone.accent} ${gaugeDegrees}deg, #e2e8f0 ${gaugeDegrees}deg 360deg)`,
                    }}
                  >
                    <div className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                      <div className="text-4xl font-bold text-slate-900">{Number(safeData.score) || 0}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">/ 100</div>
                    </div>
                  </div>
                </div>

                <div className={`mt-4 rounded-2xl border px-3 py-2 text-center text-sm font-semibold ${tone.chip}`}>
                  {safeData.verdictLabel || getLocalText('等待结论', 'Pending verdict')}
                </div>

                {(isRunning || isError) && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{getLocalText('当前进度', 'Current progress')}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/90 shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {getLocalText('步骤分析', 'Step-by-step analysis')}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {getLocalText('像深度研究一样，逐步展示拆解、检索、证据比对、评分与结论。', 'See the verification flow across extraction, search, evidence comparison, scoring, and final synthesis.')}
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-4 py-3 no-scrollbar">
              {steps.map((step, index) => (
                <button
                  key={step.id || step.title || index}
                  onClick={() => setActiveStepIndex(index)}
                  className={`flex min-w-[150px] flex-shrink-0 items-start gap-2 rounded-2xl border px-3 py-3 text-left transition-all ${
                    activeStepIndex === index
                      ? 'border-sky-200 bg-sky-50 shadow-sm'
                      : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="mt-0.5">{getStepStatusIcon(step.status)}</div>
                  <div className="overflow-hidden">
                    <div className={`truncate text-xs font-bold ${activeStepIndex === index ? 'text-sky-700' : 'text-slate-700'}`}>
                      {step.title}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {getStepStatus(step.status) === 'completed' && getLocalText('已完成', 'Completed')}
                      {getStepStatus(step.status) === 'running' && getLocalText('进行中', 'Running')}
                      {getStepStatus(step.status) === 'error' && getLocalText('失败', 'Failed')}
                      {getStepStatus(step.status) === 'not-started' && getLocalText('待开始', 'Pending')}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr),320px]">
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                {activeStep ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{activeStep.title}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {activeStepStatus === 'running' && getLocalText('系统正在处理这一阶段，内容会持续刷新。', 'The system is currently working on this step and will keep updating it.')}
                          {activeStepStatus === 'completed' && getLocalText('这一阶段已经完成，下面是提炼出的分析内容。', 'This step is complete. The distilled analysis is shown below.')}
                          {activeStepStatus === 'error' && getLocalText('这一阶段执行失败，请查看错误信息或重新发起核验。', 'This step failed. Check the error message or retry the verification.')}
                          {activeStepStatus === 'not-started' && getLocalText('这一阶段会在前序分析完成后自动展开。', 'This step will unlock after the previous analysis completes.')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                          {getStepStatusIcon(activeStep.status)}
                          <span>{getStageLabel(safeData.currentStage, getLocalText)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSection('stepDetail')}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          <span>{expandedSections.stepDetail ? getLocalText('收起详情', 'Hide details') : getLocalText('展开详情', 'Show details')}</span>
                          {expandedSections.stepDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {expandedSections.stepDetail ? (
                      <div className="prose prose-slate max-w-none text-sm leading-7 text-slate-700">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h3: ({ children }) => <h3 className="mt-6 border-l-4 border-sky-500 pl-3 text-base font-semibold text-slate-900">{children}</h3>,
                            p: ({ children }) => <p className="mb-4 leading-7 text-slate-700">{children}</p>,
                            ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-5 text-slate-700">{children}</ul>,
                            li: ({ children }) => <li className="leading-7">{children}</li>,
                            code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.95em] text-sky-700">{children}</code>,
                          }}
                        >
                          {activeStep.content || ''}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        {getLocalText('当前步骤的详细分析已折叠，点击右上角可展开查看完整过程。', 'Detailed analysis for this step is collapsed. Use the button above to expand the full reasoning.')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-400">
                    {getLocalText('正在初始化步骤分析...', 'Initializing analysis steps...')}
                  </div>
                )}
              </div>

              <CollapsibleSection
                title={getLocalText('关联来源', 'Related sources')}
                description={getLocalText('只在需要时展开当前步骤的证据入口。', 'Expand only when you need the supporting evidence for this step.')}
                icon={Globe2}
                isOpen={expandedSections.stepSources}
                onToggle={() => toggleSection('stepSources')}
                badge={
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {(activeStep?.sources || []).length}
                  </span>
                }
              >
                <SourceList sources={activeStep?.sources || []} getLocalText={getLocalText} />
              </CollapsibleSection>
            </div>
          </div>

          <div>
            <div className="px-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {getLocalText('结果面板', 'Result panel')}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {getLocalText('输出可信度评分、维度分解、风险提醒和证据来源。', 'Summarizes the credibility score, dimension breakdown, cautions, and evidence sources.')}
              </div>
            </div>
            <div className="mt-3 space-y-4">
              <CollapsibleSection
                title={getLocalText('评分维度', 'Scoring dimensions')}
                description={getLocalText('查看五个评分维度是如何共同影响最终可信度的。', 'See how the five scoring dimensions shape the final credibility score.')}
                icon={Gauge}
                isOpen={expandedSections.dimensions}
                onToggle={() => toggleSection('dimensions')}
                badge={
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    5
                  </span>
                }
              >
                <div className="space-y-3">
                  {Object.entries(metricMeta).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const value = clamp(Number(metrics[key]) || 0, 0, 100);

                    return (
                      <div key={key}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 font-medium text-slate-700">
                            <Icon size={15} />
                            <span>{meta.label}</span>
                          </div>
                          <span className="font-semibold text-slate-900">{Math.round(value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`}
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title={getLocalText('检索画像', 'Search profile')}
                description={getLocalText('关键词、检索语句与基础覆盖情况。', 'Keywords, search queries, and the basic coverage snapshot.')}
                icon={Search}
                isOpen={expandedSections.searchIntel}
                onToggle={() => toggleSection('searchIntel')}
                badge={
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {keywords.length + searchQueries.length}
                  </span>
                }
              >
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <QuickStatCard
                      label={getLocalText('支持权重', 'Support')}
                      value={sourceStats.supportCount || 0}
                      helper={getLocalText('正向证据强度', 'Positive evidence strength')}
                      tone="emerald"
                    />
                    <QuickStatCard
                      label={getLocalText('反驳权重', 'Contradict')}
                      value={sourceStats.contradictCount || 0}
                      helper={getLocalText('反向证据强度', 'Negative evidence strength')}
                      tone="rose"
                    />
                    <QuickStatCard
                      label={getLocalText('交叉命中', 'Cross-hit')}
                      value={sourceStats.multiEngineHits || 0}
                      helper={getLocalText('多引擎共同命中', 'Matched by multiple engines')}
                      tone="sky"
                    />
                    <QuickStatCard
                      label={getLocalText('结果量', 'Results')}
                      value={sourceStats.resultCount || 0}
                      helper={getLocalText('原始检索结果数', 'Raw search results')}
                      tone="slate"
                    />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {getLocalText('关键词', 'Keywords')}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {keywords.length > 0 ? keywords.map((keyword) => (
                          <span key={keyword} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                            {keyword}
                          </span>
                        )) : (
                          <span className="text-sm text-slate-400">{getLocalText('暂无', 'None')}</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {getLocalText('检索语句', 'Search queries')}
                      </div>
                      <div className="mt-3 space-y-2">
                        {searchQueries.length > 0 ? searchQueries.map((query) => (
                          <div key={query} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            {query}
                          </div>
                        )) : (
                          <span className="text-sm text-slate-400">{getLocalText('暂无', 'None')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              {(findings.length > 0 || risks.length > 0) && (
                <CollapsibleSection
                  title={getLocalText('发现与提醒', 'Findings and cautions')}
                  description={getLocalText('先看提炼结论，再决定是否继续读原始来源。', 'Review the distilled takeaways before diving into raw sources.')}
                  icon={Sparkles}
                  isOpen={expandedSections.findings}
                  onToggle={() => toggleSection('findings')}
                  badge={
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {findings.length + risks.length}
                    </span>
                  }
                >
                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50/70 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {getLocalText('关键发现', 'Key findings')}
                      </div>
                      <div className="mt-3 space-y-2">
                        {findings.length > 0 ? findings.map((item, index) => (
                          <div key={`${item}-${index}`} className="rounded-2xl bg-white px-3 py-2 text-sm text-emerald-800 shadow-sm">
                            {item}
                          </div>
                        )) : (
                          <div className="text-sm text-emerald-700/70">{getLocalText('暂无', 'None')}</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                        {getLocalText('风险提醒', 'Cautions')}
                      </div>
                      <div className="mt-3 space-y-2">
                        {risks.length > 0 ? risks.map((item, index) => (
                          <div key={`${item}-${index}`} className="rounded-2xl bg-white px-3 py-2 text-sm text-amber-800 shadow-sm">
                            {item}
                          </div>
                        )) : (
                          <div className="text-sm text-amber-700/70">{getLocalText('暂无', 'None')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection
                title={getLocalText('证据来源', 'Evidence sources')}
                description={getLocalText('默认折叠，避免来源卡片一上来铺满整屏。', 'Collapsed by default so the source cards do not overwhelm the first screen.')}
                icon={Globe2}
                isOpen={expandedSections.evidenceSources}
                onToggle={() => toggleSection('evidenceSources')}
                badge={
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {sources.length}
                  </span>
                }
              >
                <div className="mb-4 text-xs text-slate-400">
                  {getLocalText('点击标题可打开原文', 'Open the original source from the title')}
                </div>
                <div className="space-y-3">
                  {sources.length > 0 ? sources.map((source) => {
                    const stanceMeta = getSourceStanceMeta(source.stance, getLocalText);
                    return (
                      <div key={source.sourceId || source.url} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition-colors hover:text-sky-700"
                            >
                              <span className="truncate">{source.title || source.url}</span>
                              <Link2 size={14} className="shrink-0" />
                            </a>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{source.domain || getHostname(source.url) || '-'}</span>
                              <span>•</span>
                              <span>{(Array.isArray(source.engines) ? source.engines : []).join(', ') || '-'}</span>
                              <span>•</span>
                              <span>{getLocalText('权威度', 'Authority')}: {Math.round(Number(source.authorityScore) || 0)}</span>
                              <span>•</span>
                              <span>{getLocalText('相关性', 'Relevance')}: {Math.round((Number(source.relevance) || 0) * 100)}%</span>
                            </div>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${stanceMeta.badge}`}>
                            {stanceMeta.label}
                          </span>
                        </div>

                        {source.reason && (
                          <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-700">
                            {source.reason}
                          </div>
                        )}

                        {source.excerpt && (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600">
                            {source.excerpt}
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                      {getLocalText('正在整理来源...', 'Collecting sources...')}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

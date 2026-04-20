import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Circle, Loader2, ExternalLink, FileText, Activity, BookOpen, Download, Maximize2, Minimize2, ZoomIn } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  suppressErrorNotifications: true,
  errorHandler: () => {},
  parseError: () => {},
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
});

const Mermaid = ({ chart }) => {
  const [svg, setSvg] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (chart && chart.trim()) {
      const keywords = ['graph', 'flowchart', 'sequenceDiagram', 'gantt', 'pie', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'mindmap'];
      const hasKeyword = keywords.some(keyword => chart.toLowerCase().includes(keyword));
      if (!hasKeyword) return;

      const renderChart = async () => {
        try {
          const cleanChart = chart.trim();
          await mermaid.parse(cleanChart);
          const id = `mermaid-svg-${Math.random().toString(36).slice(2, 11)}`;
          const { svg: nextSvg } = await mermaid.render(id, cleanChart);
          if (isMounted) {
            setSvg(nextSvg);
            setIsFinishing(true);
          }
        } catch {
          // Ignore stream-time render errors.
        }
      };

      const timer = setTimeout(renderChart, 200);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [chart]);

  if (!svg) return null;

  return (
    <>
      <div className={`group relative my-8 flex w-full justify-center overflow-x-auto transition-all duration-700 ${isFinishing ? 'animate-in fade-in zoom-in-95' : 'opacity-50'}`}>
        <div
          onClick={() => setIsZoomed(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
          className="mermaid-container cursor-zoom-in overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-blue-200 hover:shadow-xl"
        />
        <div className="pointer-events-none absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="rounded-full bg-blue-600 p-2 text-white shadow-lg">
            <ZoomIn size={16} />
          </div>
        </div>
      </div>

      {isZoomed && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm md:p-12 animate-in fade-in duration-300"
          onClick={() => setIsZoomed(false)}
        >
          <button
            className="absolute right-6 top-6 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
            onClick={() => setIsZoomed(false)}
          >
            <X size={32} />
          </button>

          <div
            className="flex h-full w-full items-center justify-center overflow-auto rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-500"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              dangerouslySetInnerHTML={{ __html: svg }}
              className="flex h-auto w-full max-w-none items-center justify-center font-sans [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-full"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default function DeepReadingView({ data, isEmbedded = true }) {
  const { t } = useTranslation();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const reportContentRef = React.useRef(null);
  let { steps = [], reportHtml = '', reportMarkdown = '', status = 'running' } = data;
  const reportStepPattern = /report/i;

  steps = Array.isArray(steps) ? steps.map((step) => ({ ...step })) : [];

  const latestStep = steps[steps.length - 1];
  const reportStepIndex = steps.findIndex((step) => step?.type === 'report' || reportStepPattern.test(step?.title || ''));
  const reportStep = reportStepIndex >= 0 ? steps[reportStepIndex] : (latestStep?.type === 'report' ? latestStep : null);
  const reportHtmlContent = reportHtml?.trim?.() || '';
  const reportMarkdownContent = reportMarkdown?.trim?.() || '';
  const reportStepContent = reportStep?.content?.trim?.() || '';
  const allStepsSettled = steps.length > 0 && steps.every((step) =>
    step.status === 'completed' || step.status === 'success' || step.status === 'error'
  );
  const inferredCompleted = Boolean(
    reportHtmlContent
    || reportMarkdownContent
    || (reportStep && (reportStepContent || reportStep.status === 'completed'))
    || allStepsSettled
  );

  if (inferredCompleted) {
    status = 'completed';
  }

  if (status === 'completed' && steps.length > 0) {
    steps = steps.map((step, index) => {
      if (step.status === 'running' || step.status === 'not-started') {
        return { ...step, status: 'completed' };
      }

      if (index === reportStepIndex && step.status !== 'completed') {
        return { ...step, status: 'completed', title: t('report_writing_done') };
      }

      return step;
    });
  }

  useEffect(() => {
    const runningIdx = steps.findIndex((step) => step.status === 'running');
    if (runningIdx !== -1) {
      if (runningIdx !== activeStepIndex) {
        setActiveStepIndex(runningIdx);
      }
      return;
    }

    if (steps.length === 0) {
      if (activeStepIndex !== 0) {
        setActiveStepIndex(0);
      }
      return;
    }

    const nextIndex = Math.min(activeStepIndex, steps.length - 1);
    const fallbackIndex = nextIndex === 0 ? steps.length - 1 : nextIndex;
    if (fallbackIndex !== activeStepIndex) {
      setActiveStepIndex(fallbackIndex);
    }
  }, [activeStepIndex, status, steps]);
  const reportAvailable = Boolean(reportHtmlContent || reportMarkdownContent || reportStepContent);
  const displayMarkdown = reportMarkdownContent || reportStepContent;

  const downloadMarkdown = () => {
    if (!displayMarkdown) return;
    const blob = new Blob([displayMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `research_report_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!reportContentRef.current) return;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!printWindow) return;

    const reportTitle =
      displayMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
      || t('research_report_title')
      || t('final_report')
      || 'Research Report';

    const reportMarkup = reportContentRef.current.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${reportTitle}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #1f2937;
              background: #ffffff;
              font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
              line-height: 1.7;
            }
            main {
              max-width: 820px;
              margin: 0 auto;
            }
            h1 {
              margin: 0 0 24px;
              padding-bottom: 16px;
              border-bottom: 4px solid #2563eb;
              font-size: 2rem;
              line-height: 1.2;
              color: #111827;
            }
            h2 {
              margin: 40px 0 18px;
              font-size: 1.5rem;
              color: #1f2937;
            }
            h3, h4, h5, h6 {
              margin: 28px 0 14px;
              color: #1f2937;
            }
            p, ul, ol, blockquote, table, pre {
              margin: 0 0 18px;
            }
            ul, ol {
              padding-left: 24px;
            }
            li + li {
              margin-top: 8px;
            }
            code {
              border-radius: 6px;
              background: #eff6ff;
              padding: 2px 6px;
              color: #1d4ed8;
              font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
              font-size: 0.92em;
            }
            pre {
              overflow: auto;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              background: #f8fafc;
              padding: 16px;
            }
            pre code {
              background: transparent;
              padding: 0;
              color: inherit;
            }
            blockquote {
              border-left: 4px solid #bfdbfe;
              margin-left: 0;
              padding-left: 16px;
              color: #475569;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #dbeafe;
              padding: 10px 12px;
              text-align: left;
            }
            th {
              background: #eff6ff;
            }
            img, svg {
              max-width: 100%;
              height: auto;
            }
            a {
              color: #2563eb;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <main>${reportMarkup}</main>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  const renderFocusButton = (focusMode) => (
    <button
      onClick={() => setIsFocusMode(!focusMode)}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-white"
    >
      {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      {focusMode ? 'Exit Focus' : 'Focus'}
    </button>
  );

  const renderReportView = (focusMode = false) => (
    <div className={`flex flex-col overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in duration-300 ${focusMode ? 'h-full rounded-[2rem]' : 'h-[700px] rounded-2xl border'}`}>
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-gray-50 to-white p-4">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-blue-600" />
          <span className="font-bold text-gray-800">{t('final_report')}</span>
          {status === 'completed' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-600">Markdown Ready</span>}
          {status !== 'completed' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600 animate-pulse">Generating...</span>}
        </div>
        <div className="flex items-center gap-2">
          {renderFocusButton(focusMode)}
          <button
            onClick={downloadMarkdown}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-green-700 active:scale-95"
          >
            <Download size={14} />
            {t('export_md') || 'Export Markdown'}
          </button>
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
          >
            <FileText size={14} />
            {t('export_pdf') || 'Export PDF'}
          </button>
          <button
            onClick={() => setShowReport(false)}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <div ref={reportContentRef} className="mx-auto max-w-4xl">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => <>{children}</>,
              code({ inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                if (!inline && match && match[1] === 'mermaid') {
                  return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                }
                return <code className={`${className} rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono text-blue-600`} {...props}>{children}</code>;
              },
              h1: ({ children }) => <h1 className="mb-8 border-b-4 border-blue-600 pb-4 text-4xl font-black text-gray-900">{children}</h1>,
              h2: ({ children }) => <h2 className="mt-12 mb-6 flex items-center gap-3 text-2xl font-bold text-gray-800 before:h-8 before:w-2 before:rounded-full before:bg-blue-500 before:content-['']">{children}</h2>,
              p: ({ children }) => <p className="mb-6 text-lg leading-relaxed text-gray-700">{children}</p>,
              ul: ({ children }) => <ul className="mb-8 list-disc space-y-4 pl-8 text-gray-700">{children}</ul>
            }}
          >
            {displayMarkdown || t('parsing_content')}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );

  const renderMainView = (focusMode = false) => (
    <div className={`relative flex flex-col overflow-hidden border border-gray-100 bg-white shadow-sm ${focusMode ? 'h-full rounded-[2rem]' : `${isEmbedded ? 'my-4 w-full' : 'h-full'} rounded-3xl`}`}>
      <div className="absolute right-4 top-4 z-10">
        {renderFocusButton(focusMode)}
      </div>

      <div className="flex min-h-[400px] flex-1 flex-col overflow-hidden">
        <div className="flex flex-col overflow-hidden border-b bg-gray-50/50">
          <div className="flex items-center gap-2 overflow-x-auto border-b bg-white p-3 pr-24 no-scrollbar">
            {steps.map((step, idx) => (
              <button
                key={idx}
                onClick={() => setActiveStepIndex(idx)}
                className={`flex min-w-[140px] flex-shrink-0 items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  activeStepIndex === idx ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-transparent bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="mt-0.5">
                  {step.status === 'completed' ? (
                    <CheckCircle2 size={14} className="text-green-500" />
                  ) : step.status === 'running' ? (
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                  ) : (
                    <Circle size={14} className="text-gray-300" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <div className={`truncate text-[11px] font-bold ${activeStepIndex === idx ? 'text-blue-600' : 'text-gray-700'}`}>
                    {step.title}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto bg-white p-4 md:p-6">
          {steps[activeStepIndex] ? (
            <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-2 flex items-center justify-between gap-4">
                <h2 className="border-l-4 border-blue-600 pl-3 text-xl font-bold text-gray-900">
                  {steps[activeStepIndex].title}
                </h2>
                {steps[activeStepIndex].status === 'running' ? (
                  <span className="flex items-center gap-2 rounded-full bg-blue-100/50 px-3 py-1.5 text-xs font-bold text-blue-500 animate-pulse">
                    <Loader2 size={14} className="animate-spin" />
                    {steps[activeStepIndex].type === 'report' ? t('report_writing') : t('depth_analyzing')}
                  </span>
                ) : steps[activeStepIndex].status === 'completed' && (
                  <span className="flex items-center gap-2 rounded-full bg-green-100/50 px-3 py-1.5 text-xs font-bold text-green-600">
                    <CheckCircle2 size={14} />
                    {t('task_completed')}
                  </span>
                )}
              </div>

              <div className="prose prose-blue max-w-none p-1 text-gray-700 leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => <>{children}</>,
                    code({ inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && match && match[1] === 'mermaid') {
                        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                      }
                      return <code className={`${className} rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono text-blue-600`} {...props}>{children}</code>;
                    },
                    p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
                    h1: ({ children }) => <h1 className="mt-8 mb-4 text-2xl font-bold">{children}</h1>,
                    h2: ({ children }) => <h2 className="mt-6 mb-3 text-xl font-bold text-gray-800">{children}</h2>,
                    ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-5">{children}</ul>,
                  }}
                >
                  {steps[activeStepIndex].content || ''}
                </ReactMarkdown>
              </div>

              {steps[activeStepIndex]?.sources && steps[activeStepIndex].sources.length > 0 && (
                <div className="mt-8 border-t border-gray-100 pt-6">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    <Activity size={12} />
                    {t('research_sources')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {steps[activeStepIndex].sources.slice(0, 4).map((source, sourceIndex) => (
                      <a
                        key={sourceIndex}
                        href={source?.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 rounded-xl border border-gray-100 p-2.5 transition-all hover:border-blue-200 hover:bg-blue-50/50"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 shrink-0 group-hover:bg-blue-100">
                          <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500" />
                        </div>
                        <div className="overflow-hidden">
                          <div className="truncate text-xs font-medium text-gray-700">{source?.title || 'Untitled Source'}</div>
                          <div className="mt-0.5 truncate text-[10px] uppercase text-gray-400">
                            {source?.url && source.url.startsWith('http') ? new URL(source.url).hostname : 'Source'}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center space-y-4 text-gray-400">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
                <Activity size={32} className="opacity-20" />
              </div>
              <p className="text-sm">{t('initializing_research')}</p>
            </div>
          )}
        </div>
      </div>

      {reportAvailable && (reportStep || reportHtmlContent || reportMarkdownContent) && (
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 p-4">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">
                {status === 'completed' ? t('report_ready') : t('report_generating')}
              </div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-white/70">
                {status === 'completed' ? 'Comprehensive Analysis Ready' : 'Generating Final Report'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-xs font-black text-blue-700 shadow-xl transition-all hover:scale-105"
          >
            <BookOpen size={14} />
            {status === 'completed' ? t('read_report_now') : t('preview_generating')}
          </button>
        </div>
      )}
    </div>
  );

  const baseView = showReport && reportAvailable ? renderReportView(false) : renderMainView(false);
  const focusView = showReport && reportAvailable ? renderReportView(true) : renderMainView(true);

  return (
    <>
      {baseView}
      {isFocusMode && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[170] bg-slate-950/55 p-3 backdrop-blur-md md:p-6">
          {focusView}
        </div>,
        document.body
      )}
    </>
  );
}

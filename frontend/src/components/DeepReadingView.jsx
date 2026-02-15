import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Circle, Loader2, ExternalLink, FileText, Activity, BookOpen, Download, Maximize2, ZoomIn } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

// Initialize mermaid once outside
mermaid.initialize({ 
  startOnLoad: false, 
  theme: 'default',
  securityLevel: 'loose',
  suppressErrorNotifications: true,
  // 禁用所有默认渲染错误输出
  errorHandler: () => {},
  parseError: () => {},
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
});

// Mermaid renderer component
const Mermaid = ({ chart }) => {
  const [svg, setSvg] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (chart && chart.trim()) {
      const keywords = ['graph', 'flowchart', 'sequenceDiagram', 'gantt', 'pie', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'mindmap'];
      const hasKeyword = keywords.some(k => chart.toLowerCase().includes(k));
      if (!hasKeyword) return;

      const renderChart = async () => {
        try {
          const cleanChart = chart.trim();
          await mermaid.parse(cleanChart);
          
          const id = 'mermaid-svg-' + Math.random().toString(36).substring(2, 11);
          const { svg: generatedSvg } = await mermaid.render(id, cleanChart);
          
          if (isMounted) {
            setSvg(generatedSvg);
            setIsFinishing(true);
          }
        } catch (e) {
          // Silent catch for stream processing
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
      <div className={`group relative flex justify-center my-8 overflow-x-auto w-full transition-all duration-700 ${isFinishing ? 'animate-in fade-in zoom-in-95' : 'opacity-50'}`}>
        <div 
          onClick={() => setIsZoomed(true)}
          dangerouslySetInnerHTML={{ __html: svg }} 
          className="mermaid-container bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all cursor-zoom-in overflow-hidden" 
        />
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg">
            <ZoomIn size={16} />
          </div>
        </div>
      </div>

      {/* Zoom Modal */}
      {isZoomed && ReactDOM.createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-12 animate-in fade-in duration-300"
          onClick={() => setIsZoomed(false)}
        >
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            onClick={() => setIsZoomed(false)}
          >
            <X size={32} />
          </button>
          
          <div 
            className="w-full h-full flex items-center justify-center bg-white rounded-3xl p-8 overflow-auto shadow-2xl animate-in zoom-in-95 duration-500"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              dangerouslySetInnerHTML={{ __html: svg }} 
              className="max-w-none w-full h-auto flex items-center justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-full font-sans"
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
  let { steps = [], reportHtml = '', reportMarkdown = '', status = 'running' } = data;

  // 核心逻辑修复：如果全局状态已完成，强制最后一个步骤显示为完成
  if (status === 'completed' && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    if (lastStep.status !== 'completed') {
      lastStep.status = 'completed';
      lastStep.title = t('report_writing_done');
    }
  }

  useEffect(() => {
    const runningIdx = steps.findIndex(s => s.status === 'running');
    if (runningIdx !== -1) {
      setActiveStepIndex(runningIdx);
    } else if (steps.length > 0 && activeStepIndex === 0) {
      setActiveStepIndex(steps.length - 1);
    }
  }, [steps.length, status]);

  // 下载 PDF 的简单实现：利用浏览器打印
  const downloadMarkdown = () => {
    const latestStep = steps[steps.length - 1];
    const displayMarkdown = reportMarkdown || (latestStep?.title.includes('报告') ? latestStep.content : '');
    
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

  if (showReport && (reportHtml || reportMarkdown || (steps.length > 0 && steps[steps.length - 1].title.includes('报告')))) {
    const latestStep = steps[steps.length - 1];
    const displayMarkdown = reportMarkdown || (latestStep?.title.includes('报告') ? latestStep.content : '');
    
    return (
      <div className="flex flex-col h-[700px] border rounded-2xl overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            <span className="font-bold text-gray-800">{t('final_report')}</span>
            {status === 'completed' && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase font-bold">Markdown Ready</span>}
            {status !== 'completed' && <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase font-bold animate-pulse">Generating...</span>}
          </div>
          <div className="flex items-center gap-2">
            <button 
               onClick={downloadMarkdown}
               className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-all shadow-md active:scale-95"
            >
              <Download size={14} />
              {t('export_md') || '导出 Markdown'}
            </button>
            <button 
              onClick={() => setShowReport(false)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div id="report-markdown-content" className="flex-1 overflow-y-auto p-8 md:p-12 scroll-smooth">
           <div className="max-w-4xl mx-auto">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    if (!inline && match && match[1] === 'mermaid') {
                      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                    }
                    return <code className={`${className} bg-gray-100 rounded px-1.5 py-0.5 text-blue-600 font-mono text-sm`} {...props}>{children}</code>;
                  },
                  h1: ({ children }) => <h1 className="text-4xl font-black mb-8 text-gray-900 border-b-4 border-blue-600 pb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-bold mt-12 mb-6 text-gray-800 flex items-center gap-3 before:content-[''] before:w-2 before:h-8 before:bg-blue-500 before:rounded-full">{children}</h2>,
                  p: ({ children }) => <p className="text-lg text-gray-700 mb-6 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-8 space-y-4 mb-8 text-gray-700">{children}</ul>
                }}
              >
                {displayMarkdown || t('parsing_content')}
              </ReactMarkdown>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col border rounded-3xl overflow-hidden bg-white shadow-sm border-gray-100 ${isEmbedded ? 'w-full my-4' : 'h-full'}`}>
      {/* Container for Steps & Content */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-[400px]">
        {/* Top Bar: Steps Navigation */}
        <div className="border-b bg-gray-50/50 flex flex-col overflow-hidden">
           <div className="flex items-center overflow-x-auto p-3 gap-2 no-scrollbar border-b bg-white">
              {steps.map((step, idx) => (
                <button 
                  key={idx}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`flex-shrink-0 min-w-[140px] text-left p-2.5 rounded-xl transition-all border flex items-start gap-2 ${
                    activeStepIndex === idx 
                      ? 'bg-blue-50 border-blue-200 shadow-sm' 
                      : 'bg-gray-50 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className="mt-0.5">
                    {step.status === 'completed' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : step.status === 'running' ? (
                      <Loader2 size={14} className="text-blue-500 animate-spin" />
                    ) : (
                      <Circle size={14} className="text-gray-300" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <div className={`text-[11px] font-bold truncate ${activeStepIndex === idx ? 'text-blue-600' : 'text-gray-700'}`}>
                      {step.title}
                    </div>
                  </div>
                </button>
              ))}
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white relative">
           {steps[activeStepIndex] ? (
             <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-gray-900 border-l-4 border-blue-600 pl-3">
                    {steps[activeStepIndex].title}
                  </h2>
                  {steps[activeStepIndex].status === 'running' ? (
                    <span className="flex items-center gap-2 text-xs text-blue-500 bg-blue-100/50 px-3 py-1.5 rounded-full animate-pulse font-bold">
                      <Loader2 size={14} className="animate-spin" />
                      {steps[activeStepIndex].type === 'report' ? t('report_writing') : t('depth_analyzing')}
                    </span>
                  ) : steps[activeStepIndex].status === 'completed' && (
                    <span className="flex items-center gap-2 text-xs text-green-600 bg-green-100/50 px-3 py-1.5 rounded-full font-bold">
                      <CheckCircle2 size={14} />
                      {t('task_completed')}
                    </span>
                  )}
                </div>

                <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed shadow-inner-sm p-1">
                   <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre: ({ children }) => <>{children}</>,
                        code({node, inline, className, children, ...props}) {
                          const match = /language-(\w+)/.exec(className || '');
                          if (!inline && match && match[1] === 'mermaid') {
                            return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                          }
                          return (
                            <code className={`${className} bg-gray-100 rounded px-1.5 py-0.5 text-blue-600 font-mono text-sm`} {...props}>
                              {children}
                            </code>
                          );
                        },
                        p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
                        h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-3 text-gray-800">{children}</h2>,
                        ul: ({ children }) => <ul className="list-disc pl-5 space-y-2 mb-4">{children}</ul>,
                      }}
                   >
                     {steps[activeStepIndex].content || ''}
                   </ReactMarkdown>
                </div>

                {steps[activeStepIndex]?.sources && steps[activeStepIndex].sources.length > 0 && (
                   <div className="mt-8 pt-6 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Activity size={12} />
                        {t('research_sources')}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                         {steps[activeStepIndex].sources.slice(0, 4).map((source, sidx) => (
                           <a 
                              key={sidx}
                              href={source?.url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group"
                           >
                              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
                                 <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500" />
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-xs font-medium text-gray-700 truncate">{source?.title || 'Untitled Source'}</div>
                                <div className="text-[10px] text-gray-400 truncate uppercase mt-0.5">
                                  {source?.url && source.url.startsWith('http') 
                                    ? new URL(source.url).hostname 
                                    : 'Source'}
                                </div>
                              </div>
                           </a>
                         ))}
                      </div>
                   </div>
                )}
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                   <Activity size={32} className="opacity-20" />
                </div>
                <p className="text-sm">{t('initializing_research')}</p>
             </div>
           )}
        </div>
      </div>

      {/* Footer: Report Button */}
      {(reportHtml || reportMarkdown || steps[steps.length - 1]?.content) && (steps[steps.length - 1]?.type === 'report' || (reportHtml || reportMarkdown)) && (
        <div className="p-4 border-t bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center justify-between">
           <div className="flex items-center gap-3 text-white">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <FileText size={20} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">
                  {status === 'completed' ? t('report_ready') : t('report_generating')}
                </div>
                <div className="text-[10px] text-white/70 uppercase tracking-widest font-medium mt-0.5">
                  {status === 'completed' ? 'Comprehensive Analysis Ready' : 'Generating Final Report'}
                </div>
              </div>
           </div>
           <button 
             onClick={() => setShowReport(true)}
             className="px-6 py-2.5 bg-white text-blue-700 rounded-xl text-xs font-black shadow-xl hover:scale-105 transition-all flex items-center gap-2"
           >
             <BookOpen size={14} />
             {status === 'completed' ? t('read_report_now') : t('preview_generating')}
           </button>
        </div>
      )}
    </div>
  );
}


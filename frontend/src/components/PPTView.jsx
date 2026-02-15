import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Circle, Loader2, FileText, Download, Presentation, Layout, Monitor, ChevronRight, ChevronLeft } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

export default function PPTView({ data, isEmbedded = true }) {
  const { t } = useTranslation();
  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    // If we have data and it's already completed, start at page 1 (first slide) instead of page 0 (planning)
    const initialSteps = data?.steps || [];
    const initialStatus = data?.status || 'running';
    const isAllDone = initialSteps.length > 0 && initialSteps.every(s => s.status === 'completed' || s.status === 'success' || s.status === 'error');
    if ((initialStatus === 'completed' || isAllDone) && initialSteps.length > 1) {
      return 1;
    }
    return 0;
  });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [scale, setScale] = useState(0.5);
  const [downloading, setDownloading] = useState(false);
  const previewContainerRef = useRef(null);
  
  // Calculate if really running based on steps
  let { steps = [], finalHtml = '', status = 'running', pptTitle = '演示文稿' } = data;
  
  // Robust status check: if all steps are done but it says running, OR if it says completed but some steps are running
  const isAllDone = steps.length > 0 && steps.every(s => 
    s.status === 'completed' || s.status === 'success' || s.status === 'error' || (s.content && s.thinking)
  );
  if (isAllDone && steps.length > 0) {
    status = 'completed';
  }

  // Ensure steps have correct status if the whole PPT is completed or inferred completed
  if (status === 'completed') {
    steps = steps.map(s => (s.status === 'running' || s.status === 'not-started') ? { ...s, status: 'completed' } : s);
  }

  const activeStep = steps[activeStepIndex];
  const isFinalStep = Boolean(
    activeStep &&
    !activeStep.content &&
    (
      /制作完成|封装最终演示文稿|已完成|Finished|Completed/i.test(activeStep.title || '') ||
      (activeStepIndex === steps.length - 1 && steps.length > 1) ||
      (status === 'completed' && activeStepIndex === steps.length - 1)
    )
  );

  useEffect(() => {
    const existingScript = document.querySelector('script[data-tailwind-cdn="ppt-preview"]');
    if (!existingScript && !window.tailwind) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      script.async = true;
      script.setAttribute('data-tailwind-cdn', 'ppt-preview');
      document.head.appendChild(script);
    }

    const existingStyle = document.querySelector('style[data-ppt-preview="base"]');
    if (!existingStyle) {
      const style = document.createElement('style');
      style.setAttribute('data-ppt-preview', 'base');
      style.textContent = `
        .slide { width: 960px; height: 540px; box-sizing: border-box; overflow: hidden; position: relative; }
        .slide * { box-sizing: border-box; }
        /* 修复内容溢出：强制内容区垂直缩减并处理长文本 */
        .slide p, .slide li { 
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 5; /* 限制单个段落行数 */
          -webkit-box-orient: vertical;
        }
        /* 针对多卡片布局的强制高度限制 */
        .slide .grid > div, .slide .flex > div {
          max-height: 380px; 
          overflow: hidden;
        }
        /* 修复 html2canvas 不支持 text-clip-text 导致的色块问题 */
        .slide [class*="text-transparent"] {
          color: #4f46e5 !important; /* fallback to indigo-600 */
          background-clip: initial !important;
          -webkit-background-clip: initial !important;
          background-image: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.offsetWidth;
        const containerHeight = previewContainerRef.current.offsetHeight;
        const newScale = Math.min((containerWidth - 40) / 960, (containerHeight - 40) / 540);
        setScale(newScale);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [activeStepIndex, isPreviewMode]);

  useEffect(() => {
    // If it's completed, don't auto-jump to a running step (which might be a leftover state)
    if (status === 'completed') {
      // If we are currently at index 0 and it's not the final step, jump to the first content-bearing slide
      // Only do this on mount or when steps change
      if (activeStepIndex === 0 && steps.length > 0) {
          const firstContentIdx = steps.findIndex(s => s.content);
          if (firstContentIdx !== -1) {
            setActiveStepIndex(firstContentIdx);
          } else if (steps.length > 1) {
            // If no content yet but multiple steps, maybe it's the final message?
            // Just don't get stuck on step 0 if it's the planning step
            setActiveStepIndex(1);
          }
      }
      return;
    }

    const runningIdx = steps.findIndex(s => s.status === 'running');
    if (runningIdx !== -1) {
      setActiveStepIndex(runningIdx);
    } else if (steps.length > 0 && activeStepIndex === 0) {
      // Find the last completed step if none are running
      const lastCompleted = [...steps].reverse().findIndex(s => s.status === 'completed' || s.status === 'success');
      if (lastCompleted !== -1) {
        setActiveStepIndex(steps.length - 1 - lastCompleted);
      }
    }
  }, [steps.length, status]);

  const downloadPptx = async () => {
    const slides = steps.filter(s => s.content);
    if (slides.length === 0) return;
    
    setDownloading(true);
    try {
      const slideImages = [];
      // Create a temporary container for rendering slides at full scale
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '0';
      tempContainer.style.top = '0';
      tempContainer.style.width = '960px';
      tempContainer.style.height = '540px';
      tempContainer.style.zIndex = '-9999';
      tempContainer.style.opacity = '0';
      tempContainer.style.pointerEvents = 'none';
      tempContainer.style.overflow = 'hidden';
      tempContainer.className = 'ppt-capture-container';
      document.body.appendChild(tempContainer);

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        
        // Render slide content into temp container
        // Ensure the content is wrapped in a solid background div with fixed dimensions
        tempContainer.innerHTML = `
          <div class="capture-slide-surface" style="width: 960px; height: 540px; background: white; position: relative; overflow: hidden; display: block;">
            ${slide.content}
          </div>
        `;
        
        // Wait for styles and icons to render - increased delay for better reliability
        await new Promise(resolve => setTimeout(resolve, 800));
        
        try {
          const canvas = await html2canvas(tempContainer, {
            width: 960,
            height: 540,
            scale: 2, 
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            // Skip problematic media elements
            ignoreElements: (el) => ['VIDEO', 'AUDIO', 'IFRAME'].includes(el.tagName),
            // Fix for CanvasGradient error: ensure the element is correctly positioned and visible
            onclone: (doc) => {
              const el = doc.querySelector('.ppt-capture-container');
              if (el) {
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.display = 'block';
              }
            }
          });
          slideImages.push(canvas.toDataURL('image/png'));
        } catch (err) {
          console.error(`Slide ${i+1} capture failed:`, err);
          // Retry once with lower scale if it fails
          const canvas = await html2canvas(tempContainer, {
            width: 960,
            height: 540,
            scale: 1,
            useCORS: true,
          });
          slideImages.push(canvas.toDataURL('image/png'));
        }
      }

      document.body.removeChild(tempContainer);

      const response = await axios.post(`${BACKEND_URL}/api/ppt/download-images`, {
        images: slideImages,
        title: pptTitle
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${pptTitle || 'Smart-PPT'}.pptx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
      alert('导出 PPTX 失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  if (isPreviewMode && finalHtml) {
      return (
          <div className="flex flex-col h-[600px] border rounded-2xl overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
                  <div className="flex items-center gap-2">
                      <Presentation size={20} className="text-orange-600" />
                      <span className="font-bold text-gray-800">{pptTitle} - 预览</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <button 
                        onClick={downloadPptx}
                        disabled={downloading}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-all shadow-md active:scale-95 ${downloading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {downloading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            正在导出...
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            下载 PPTX
                          </>
                        )}
                      </button>
                      <button 
                        onClick={() => setIsPreviewMode(false)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={20} />
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100 p-8 flex flex-col items-center gap-4">
                  {steps.filter(s => s.content).map((step, idx) => {
                    const previewScale = Math.min(1, (window.innerWidth - 100) / 960);
                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          width: `${960 * previewScale}px`, 
                          height: `${540 * previewScale}px`,
                          flexShrink: 0
                        }}
                      >
                        <div 
                          className="shadow-2xl bg-white"
                          style={{ 
                            width: '960px', 
                            height: '540px',
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top left',
                          }}
                          dangerouslySetInnerHTML={{ __html: step.content }} 
                        />
                      </div>
                    );
                  })}
              </div>
          </div>
      );
  }

  return (
    <div className={`p-4 rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-500 ${isEmbedded ? 'w-full' : 'max-w-4xl mx-auto h-[600px] flex flex-col'}`}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Presentation size={18} className="text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">{pptTitle}</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{status === 'completed' ? '已完成' : '智能生成中...'}</p>
          </div>
        </div>
        {status === 'completed' && (
          <div className="flex gap-2">
            <button 
              onClick={() => setIsPreviewMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all"
            >
              <Monitor size={14} />
              全屏预览
            </button>
            <button 
              onClick={downloadPptx}
              disabled={downloading}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${downloading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloading ? '正在导出...' : '下载 PPTX'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col h-full overflow-hidden">
        {/* Step Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto pb-4 mb-4 scrollbar-hide border-b border-gray-50">
          {steps.map((step, idx) => (
            <button
              key={idx}
              onClick={() => setActiveStepIndex(idx)}
              className={`flex flex-col items-center min-w-[80px] p-2 rounded-xl transition-all relative ${activeStepIndex === idx ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-gray-50'}`}
            >
              <div className={`mb-1.5 ${activeStepIndex === idx ? 'text-orange-600' : 'text-gray-400'}`}>
                {step.status === 'completed' ? <CheckCircle2 size={16} className="text-green-500" /> : 
                 step.status === 'running' ? <Loader2 size={16} className="animate-spin text-orange-500" /> : 
                 <Circle size={16} />}
              </div>
              <span className={`text-[9px] font-bold text-center line-clamp-1 ${activeStepIndex === idx ? 'text-orange-700' : 'text-gray-500'}`}>
                {step.title}
              </span>
              {activeStepIndex === idx && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-orange-500 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
          {isFinalStep ? (
            <div className="w-full flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50/70">
              <div className="flex items-center gap-3 text-gray-600">
                <CheckCircle2 size={22} className="text-green-500" />
                <span className="text-sm font-semibold">{t('ppt_completed')}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Thinking process if available */}
              {activeStep?.thinking && (
                <div 
                  className="w-full md:w-1/3 flex flex-col bg-gray-50 rounded-xl p-4 overflow-y-auto border border-gray-100"
                  style={{ maxHeight: '540px' }}
                >
                   <div className="flex items-center gap-2 mb-3 text-orange-700">
                      <Layout size={14} />
                      <span className="text-xs font-bold uppercase tracking-tight">{t('design_thinking')}</span>
                   </div>
                   <div className="prose prose-sm prose-orange max-w-none">
                     <ReactMarkdown remarkPlugins={[remarkGfm]}>
                       {(activeStep.thinking || '')
                         .replace(/^(思考过程|思考|Thinking|HTML内容|HTML设计|Réflexion|Design Thinking|デザイン思考)[:：\s]*/i, '')
                         .replace(/(思考过程|思考|Thinking|HTML内容|HTML设计|Réflexion|Design Thinking|デザイン思考)[:：\s]*$/i, '')
                         .trim()}
                     </ReactMarkdown>
                   </div>
                </div>
              )}

              {/* Slide Preview */}
              <div 
                className={`flex-1 flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden shadow-inner ${!activeStep?.thinking ? 'w-full' : ''}`}
                style={{ maxHeight: '540px' }}
              >
                 <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{t('slide_preview', { page: activeStepIndex + 1 })}</span>
                    <div className="flex gap-1">
                       {[1,2,3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-200" />)}
                    </div>
                 </div>
                 <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center bg-gray-200/30" ref={previewContainerRef}>
                    {activeStep?.content ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div 
                          className="shadow-2xl bg-white origin-center"
                          style={{ 
                            width: '960px', 
                            height: '540px',
                            transform: `scale(${scale})`,
                            flexShrink: 0
                          }}
                          dangerouslySetInnerHTML={{ __html: activeStep.content }} 
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                        <Loader2 size={32} className="animate-spin text-gray-200" />
                        <span className="text-xs font-medium">{t('ppt_generating_content')}</span>
                      </div>
                    )}
                 </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

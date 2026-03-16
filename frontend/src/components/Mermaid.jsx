import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import mermaid from 'mermaid';
import { ZoomIn, X } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  suppressErrorNotifications: true,
  errorHandler: () => {},
  parseError: () => {},
});

const Mermaid = ({ chart }) => {
  const { t } = useTranslation();
  const [svg, setSvg] = useState('');
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (chart && chart.trim()) {
      // 预处理代码：移除 Markdown 标记
      let cleanedChart = chart.trim();
      
      // 如果代码看起来还没写完（比如只有 ```mermaid 但没有内容），先暂停渲染
      if (cleanedChart === '```mermaid' || cleanedChart === '```') return;

      cleanedChart = cleanedChart.replace(/^```mermaid\s*\n?/i, '').replace(/^```\s*\n?/, '');
      cleanedChart = cleanedChart.replace(/\n?```$/, '');
      cleanedChart = cleanedChart.trim();

      // 基本校验：检查关键字以避免在生成初期就尝试渲染
      const keywords = ['graph', 'flowchart', 'sequenceDiagram', 'gantt', 'pie', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'mindmap', 'timeline', 'quadrantChart'];
      const hasKeyword = keywords.some(k => cleanedChart.toLowerCase().includes(k));
      if (!hasKeyword) return;

      const renderChart = async () => {
        try {
          // 语法检查：只有通过了 mermaid.parse 才会更新状态，从而实现“生成完毕再渲染”的效果
          await mermaid.parse(cleanedChart);
          
          const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;
          const { svg: generatedSvg } = await mermaid.render(id, cleanedChart);
          
          if (isMounted) {
            setSvg(generatedSvg);
            // 稍作延迟显示动画，让体验更平滑
            setTimeout(() => {
              if (isMounted) setIsFinishing(true);
            }, 50);
          }
        } catch (e) {
          // 解析失败说明代码尚不完整或有错，静默处理（等待下一波更新）
        }
      };

      // 增加防抖延迟，避免生成过程中的高频渲染
      const timer = setTimeout(renderChart, 400);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [chart]);

  if (!svg) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 my-4 animate-pulse">
         <div className="flex gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
         </div>
         <span className="text-[11px] font-medium tracking-wide">{t('parsing_mermaid')}</span>
      </div>
    );
  }

  return (
    <>
      <div className={`group relative w-full my-6 transition-all duration-500 ${isFinishing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        <div 
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomed(true);
          }}
          className="mermaid-container w-full overflow-x-auto bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-zoom-in flex justify-center active:scale-[0.99]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 pointer-events-none">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-lg flex items-center gap-2">
            <ZoomIn size={14} />
            <span className="text-[10px] font-bold pr-1">{t('click_to_enlarge')}</span>
          </div>
        </div>
      </div>

      {/* Zoom Modal */}
      {isZoomed && ReactDOM.createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-12 animate-in fade-in duration-200"
          onClick={() => setIsZoomed(false)}
        >
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
            onClick={() => setIsZoomed(false)}
          >
            <X size={32} />
          </button>
          
          <div 
            className="w-full h-full bg-white rounded-3xl overflow-auto shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 使用 flex 并在子项上使用 m-auto 是处理可滚动居中内容最可靠的方式 */}
            <div className="min-h-full min-w-full flex p-6 md:p-12">
              <div 
                dangerouslySetInnerHTML={{ __html: svg }} 
                className="m-auto max-w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Mermaid;

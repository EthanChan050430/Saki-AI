import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CharacterView = ({ currentExpression, isOpen, setIsOpen, triggerAnimation }) => {
  const { t } = useTranslation();
  const assetsPath = '/assets';
  const [clickCount, setClickCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationType, setAnimationType] = useState('chuo'); // 'chuo' or 'hello' or 'busy' or 'thinking'
  const [frameIndex, setFrameIndex] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [showAngry, setShowAngry] = useState(false);
  const clickTimerRef = useRef(null);
  const animationRequestRef = useRef(null);
  const startTimeRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen for external animation triggers
  useEffect(() => {
    if (triggerAnimation) {
      if (triggerAnimation.type === 'stop') {
        stopAnimation();
      } else {
        startSequenceAnimation(triggerAnimation.type || 'hello', triggerAnimation.loop || false);
      }
    }
  }, [triggerAnimation]);

  // Mapping expressions to actual file paths
  const expressionUrl = `/assets/expression/${currentExpression || 'normal.png'}`;
  const phoneUrl = '/assets/Phone.png';

  const handleClick = () => {
    // 处理气泡显示
    setShowAngry(true);
    setTimeout(() => setShowAngry(false), 1000);

    // 处理连击动画
    setClickCount(prev => {
      const newCount = prev + 1;
      
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      
      if (newCount >= 3) {
        startSequenceAnimation('chuo', false);
        return 0; // 重置计数
      }
      
      clickTimerRef.current = setTimeout(() => {
        setClickCount(0);
      }, 500); // 500ms 内连击有效

      return newCount;
    });
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    setIsLooping(false);
    if (animationRequestRef.current) cancelAnimationFrame(animationRequestRef.current);
  };

  const startSequenceAnimation = (type = 'chuo', loop = false) => {
    // Force reset even if same type to ensure it interrupts correctly
    if (animationRequestRef.current) {
      cancelAnimationFrame(animationRequestRef.current);
    }

    setIsAnimating(true);
    setAnimationType(type);
    setIsLooping(loop);
    setFrameIndex(type === 'busy' ? 0 : 1);
    
    // Use a local copy of totalFrames to be safe
    const totalFrames = 145;
    const fps = 24; 
    startTimeRef.current = performance.now();

    const animate = (time) => {
      const elapsed = time - startTimeRef.current;
      let currentFrame = Math.floor((elapsed / 1000) * fps);

      // Handle start index: busy starts at 0, others start at 1
      const frameOffset = type === 'busy' ? 0 : 1;
      const displayFrame = (currentFrame % totalFrames) + frameOffset;

      if (loop) {
        setFrameIndex(displayFrame);
        animationRequestRef.current = requestAnimationFrame(animate);
      } else {
        if (currentFrame < totalFrames) {
          setFrameIndex(displayFrame);
          animationRequestRef.current = requestAnimationFrame(animate);
        } else {
          setFrameIndex(frameOffset);
          setIsAnimating(false);
          // Only cancel if it's the current one
          cancelAnimationFrame(animationRequestRef.current);
        }
      }
    };

    animationRequestRef.current = requestAnimationFrame(animate);
  };

  // 组件卸载时清理定时器/动画
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (animationRequestRef.current) cancelAnimationFrame(animationRequestRef.current);
    };
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-white/60 backdrop-blur-sm shadow-2xl p-3 rounded-full hover:bg-white/80 z-50 transition-all border border-white/40"
        title={t('video_call')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    );
  }

  // Mobile Floating Version
  if (isMobile) {
    return (
      <motion.div 
        drag
        dragMomentum={false}
        className="fixed bottom-24 right-4 z-[100] w-48 h-[360px] bg-transparent overflow-hidden flex flex-col group touch-none"
      >
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md"
          >
            <X size={16} />
          </button>
        </div>
        
        <div 
          className="relative w-full h-[360px] bg-contain bg-no-repeat bg-center cursor-move select-none bg-transparent"
          style={{ backgroundImage: `url(${phoneUrl})` }}
          onClick={handleClick}
        >
          {showAngry && (
            <div className="absolute top-1/4 left-[20%] -translate-x-1/2 -translate-y-5 z-10 animate-bounce pointer-events-none">
              <img src="/assets/angry_qipao.png" alt="Angry" className="w-10 h-10 object-contain" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <img 
              src={isAnimating ? `/assets/animate/${animationType}/${frameIndex}.png` : expressionUrl} 
              alt="Character" 
              className={`max-h-[43%] w-auto transition-all transform scale-125 ${isAnimating ? '' : 'duration-300'}`}
              onError={(e) => {
                e.target.src = '/assets/expression/normal.png';
              }}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="w-80 h-full bg-white/20 backdrop-blur-sm border-l border-white/20 flex flex-col relative transition-all duration-300 shadow-2xl shrink-0">
      <div className="flex items-center justify-between p-4 border-b border-white/20 bg-white/40 backdrop-blur-md">
        <h3 className="font-bold text-gray-900">{t('video_call')}</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
        {/* Phone Container */}
        <div 
          className="relative w-full h-[600px] bg-contain bg-no-repeat bg-center transition-all duration-500 cursor-pointer select-none"
          style={{ backgroundImage: `url(${phoneUrl})` }}
          onClick={handleClick}
        >
          {/* Angry Bubble Overlay */}
          {showAngry && (
            <div className="absolute top-1/4 left-[20%] -translate-x-1/2 -translate-y-10 z-10 animate-bounce pointer-events-none">
              <img src="/assets/angry_qipao.png" alt="Angry" className="w-16 h-16 object-contain" />
            </div>
          )}

          {/* Character Container inside phone screen area */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <img 
              src={isAnimating ? `/assets/animate/${animationType}/${frameIndex}.png` : expressionUrl} 
              alt="Character" 
              className={`max-h-[43%] w-auto transition-all transform scale-125 ${isAnimating ? '' : 'duration-300'}`}
              onError={(e) => {
                e.target.src = '/assets/expression/normal.png';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterView;

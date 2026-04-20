import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const CherryBlossoms = () => {
  const petals = useMemo(() => {
    const images = [
      '/assets/huaban/flower.png',
      '/assets/huaban/flower2.png',
      '/assets/huaban/flower3.png'
    ];
    return Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100 + '%',
      delay: Math.random() * 10,
      duration: 15 + Math.random() * 25, // 稍微减慢速度，显得更轻盈
      size: 15 + Math.random() * 20,     // 稍微增大尺寸以适应图片
      rotate: Math.random() * 360,
      img: images[Math.floor(Math.random() * images.length)]
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {petals.map((petal) => (
        <motion.div
          key={petal.id}
          initial={{ 
            top: '-10%', 
            left: petal.x, 
            opacity: 0,
            rotate: petal.rotate 
          }}
          animate={{
            top: '110%',
            left: `calc(${petal.x} + ${Math.random() * 300 - 150}px)`,
            opacity: [0, 0.8, 0.8, 0],
            rotate: petal.rotate + 720,
          }}
          transition={{
            duration: petal.duration,
            repeat: Infinity,
            delay: petal.delay,
            ease: "easeInOut"
          }}
          className="absolute"
          style={{ width: petal.size, height: petal.size }}
        >
          <img 
            src={petal.img} 
            alt="petal" 
            className="w-full h-full object-contain drop-shadow-sm" 
            style={{ filter: 'brightness(1.1) contrast(0.9)' }} 
          />
        </motion.div>
      ))}
    </div>
  );
};

export default CherryBlossoms;

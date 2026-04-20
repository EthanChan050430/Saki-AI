export const modalEase = [0.22, 1, 0.36, 1];
export const modalEaseOut = [0.4, 0, 1, 1];

export const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.24,
      ease: modalEase,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.18,
      ease: modalEaseOut,
    },
  },
};

export const modalPanelMotion = {
  initial: {
    opacity: 0,
    scale: 0.965,
    y: 24,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.34,
      ease: modalEase,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 18,
    transition: {
      duration: 0.2,
      ease: modalEaseOut,
    },
  },
};

export const tiledOverlayMotion = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.28,
      ease: modalEase,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: modalEaseOut,
    },
  },
};

export function getTiledWindowMotion(index = 0) {
  return {
    initial: {
      opacity: 0,
      scale: 0.94,
      y: 28,
    },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.38,
        delay: index * 0.04,
        ease: modalEase,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.965,
      y: 18,
      transition: {
        duration: 0.22,
        ease: modalEaseOut,
      },
    },
    layout: {
      type: 'spring',
      stiffness: 320,
      damping: 34,
      mass: 0.82,
    },
  };
}

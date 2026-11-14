import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+(?:\([^)]*\)[^)\s]*)*)\)/g;

/**
 * Split markdown text into plain markdown segments and consecutive image-gallery groups (>= 2 images).
 * Ignores image syntax inside fenced code blocks.
 */
export function splitMarkdownImageGroups(markdown = '') {
  const source = String(markdown || '');
  if (!source || !source.includes('![')) {
    return [{ type: 'markdown', content: source }];
  }

  // Track fenced code block ranges so we never rewrite markdown examples inside ```...```
  const codeRanges = [];
  const fenceRegex = /(^|\n)(```+|~~~+)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g;
  let fenceMatch;
  while ((fenceMatch = fenceRegex.exec(source)) !== null) {
    codeRanges.push([fenceMatch.index, fenceMatch.index + fenceMatch[0].length]);
  }
  const isInsideCodeFence = (index) => codeRanges.some(([start, end]) => index >= start && index < end);

  const matches = [];
  MARKDOWN_IMAGE_REGEX.lastIndex = 0;
  let match;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(source)) !== null) {
    if (isInsideCodeFence(match.index)) continue;
    const src = String(match[2] || '').trim();
    if (!src) continue;
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      alt: String(match[1] || '').trim(),
      src,
    });
  }

  if (matches.length < 2) {
    return [{ type: 'markdown', content: source }];
  }

  // Group consecutive images separated only by whitespace
  const runs = [];
  let currentRun = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = matches[i - 1];
    const curr = matches[i];
    const between = source.slice(prev.end, curr.start);
    if (/^\s*$/.test(between)) {
      currentRun.push(curr);
    } else {
      runs.push(currentRun);
      currentRun = [curr];
    }
  }
  runs.push(currentRun);

  const galleryRuns = runs.filter((run) => run.length >= 2);
  if (galleryRuns.length === 0) {
    return [{ type: 'markdown', content: source }];
  }

  const segments = [];
  let cursor = 0;
  for (const run of galleryRuns) {
    const runStart = run[0].start;
    const runEnd = run[run.length - 1].end;
    if (runStart > cursor) {
      const textChunk = source.slice(cursor, runStart);
      if (textChunk.trim()) {
        segments.push({ type: 'markdown', content: textChunk });
      }
    }
    segments.push({
      type: 'gallery',
      images: run.map((item) => ({ src: item.src, alt: item.alt })),
    });
    cursor = runEnd;
  }

  if (cursor < source.length) {
    const tail = source.slice(cursor);
    if (tail.trim()) {
      segments.push({ type: 'markdown', content: tail });
    }
  }

  return segments;
}

export function extractMarkdownImages(text = '') {
  const source = String(text || '');
  if (!source) return [];
  const images = [];
  MARKDOWN_IMAGE_REGEX.lastIndex = 0;
  let match;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(source)) !== null) {
    const src = String(match[2] || '').trim();
    if (src) {
      images.push({ src, alt: String(match[1] || '').trim() });
    }
  }
  if (images.length > 0) return images;

  const trimmed = source.trim();
  if (trimmed.startsWith('data:image/') || /^https?:\/\/\S+$/i.test(trimmed)) {
    return [{ src: trimmed, alt: 'Generated Image' }];
  }
  return [];
}

async function downloadImageSrc(src, filenamePrefix = 'agent-draw') {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download failed:', err);
    const link = document.createElement('a');
    link.href = src;
    link.download = `${filenamePrefix}-${Date.now()}.png`;
    link.click();
  }
}

export default function CollapsibleImageGallery({ images = [] }) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverMain, setHoverMain] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const safeImages = Array.isArray(images) ? images.filter((img) => img && img.src) : [];

  useEffect(() => {
    if (activeIndex >= safeImages.length && safeImages.length > 0) {
      setActiveIndex(safeImages.length - 1);
    }
  }, [activeIndex, safeImages.length]);

  useEffect(() => {
    if (!zoomOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setZoomOpen(false);
      else if (e.key === 'ArrowLeft') setActiveIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
      else if (e.key === 'ArrowRight') setActiveIndex((prev) => (prev + 1) % safeImages.length);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomOpen, safeImages.length]);

  if (safeImages.length === 0) return null;

  const activeImage = safeImages[activeIndex] || safeImages[0];

  return (
    <>
      <div className="my-2.5 flex items-stretch gap-2.5 w-full h-[250px] sm:h-[300px]">
        {/* Main large preview on the left */}
        <div
          className="relative flex-1 min-w-0 h-full rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 shadow-sm group"
          onMouseEnter={() => setHoverMain(true)}
          onMouseLeave={() => setHoverMain(false)}
        >
          <img
            src={activeImage.src}
            alt={activeImage.alt || `Image ${activeIndex + 1}`}
            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.01]"
            onClick={() => setZoomOpen(true)}
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYjVjNWMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxsaW5lIHgxPSIzIiB5MT0iOSIgeDI9IjIxIiB5Mj0iOSIvPjxsbmUgeDE9IjkiIHkxPSIzIiB4Mj0iOSIgeTI9IjIxIi8+PC9zdmc+';
              e.target.className = 'w-12 h-12 opacity-20 m-auto';
            }}
          />
          {!activeImage.src?.includes('svg+xml') && (
            <div className="saki-touch-visible absolute top-2.5 right-2.5 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImageSrc(activeImage.src);
                }}
                className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-full backdrop-blur-md shadow-lg transition-all"
                title={t('download_image')}
              >
                <Download size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Vertical scrollable thumbnail strip on the right */}
        <div
          className="w-[66px] sm:w-[74px] shrink-0 h-full overflow-y-auto flex flex-col gap-2 pr-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {safeImages.map((img, index) => {
            const isSelected = index === activeIndex;
            return (
              <button
                key={`${img.src.slice(0, 48)}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Image ${index + 1}`}
                aria-pressed={isSelected}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl overflow-hidden transition-all focus:outline-none ${
                  isSelected
                    ? 'ring-2 ring-[#ff75ac] ring-offset-1 ring-offset-white dark:ring-offset-[#181922] opacity-100 shadow-sm'
                    : 'opacity-75 hover:opacity-100 border border-black/10 dark:border-white/10'
                }`}
              >
                <img
                  src={img.src}
                  alt={img.alt || `Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      </div>

      {zoomOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
            onClick={() => setZoomOpen(false)}
            aria-label="Close"
          >
            <X size={28} />
          </button>

          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 text-white p-2.5 backdrop-blur-md transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
                }}
                aria-label="Previous image"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 text-white p-2.5 backdrop-blur-md transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((prev) => (prev + 1) % safeImages.length);
                }}
                aria-label="Next image"
              >
                <ChevronRight size={24} />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
                {activeIndex + 1} / {safeImages.length}
              </div>
            </>
          )}

          <img
            src={activeImage.src}
            alt={activeImage.alt || 'Zoom'}
            className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  );
}

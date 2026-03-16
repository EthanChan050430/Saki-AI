import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Circle, Loader2, FileText, Download, Presentation, Layout, Monitor, ChevronRight, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import { BACKEND_URL } from '../utils/backendUrl';
const PPT_CAPTURE_STYLE = `
  .ppt-capture-surface {
    width: 960px;
    height: 540px;
    overflow: hidden;
    position: relative;
    background: #ffffff;
  }
  .ppt-capture-surface .slide {
    width: 960px !important;
    height: 540px !important;
    overflow: hidden;
    position: relative;
    isolation: isolate;
  }
  .ppt-capture-surface .slide,
  .ppt-capture-surface .slide * {
    box-sizing: border-box;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
  }
  .ppt-capture-surface .slide h1,
  .ppt-capture-surface .slide h2,
  .ppt-capture-surface .slide h3,
  .ppt-capture-surface .slide h4,
  .ppt-capture-surface .slide h5,
  .ppt-capture-surface .slide h6 {
    line-height: 1.16 !important;
    overflow: visible !important;
    padding-bottom: 0.12em;
  }
  .ppt-capture-surface .slide p,
  .ppt-capture-surface .slide li,
  .ppt-capture-surface .slide span {
    line-height: 1.34 !important;
    overflow: visible !important;
    padding-bottom: 0.08em;
  }
  .ppt-capture-surface .slide [class*="leading-tight"] {
    line-height: 1.16 !important;
  }
  .ppt-capture-surface .slide [class*="leading-snug"] {
    line-height: 1.34 !important;
  }
  .ppt-capture-surface .slide [class*="leading-relaxed"] {
    line-height: 1.45 !important;
  }
  .ppt-capture-surface .slide svg {
    overflow: visible;
  }
`;
const PPT_SCENE_SIZE = {
  widthPx: 960,
  heightPx: 540,
  widthIn: 10,
  heightIn: 5.625
};

function sanitizeThinkingText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const withoutLabels = raw
    .replace(/^(思考过程|思考|Thinking|HTML内容|HTML设计|Réflexion|Design Thinking|デザイン思考)[:：\s]*/i, '')
    .replace(/(思考过程|思考|Thinking|HTML内容|HTML设计|Réflexion|Design Thinking|デザイン思考)[:：\s]*$/i, '')
    .trim();

  const htmlStart = withoutLabels.search(/<(?:div|section|main|article|html|body)\b/i);
  return htmlStart >= 0 ? withoutLabels.slice(0, htmlStart).trim() : withoutLabels;
}

function isCanvasMostlyBlank(canvas) {
  const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const points = [
    [20, 20],
    [canvas.width / 2, 20],
    [canvas.width - 20, 20],
    [20, canvas.height / 2],
    [canvas.width / 2, canvas.height / 2],
    [canvas.width - 20, canvas.height / 2],
    [20, canvas.height - 20],
    [canvas.width / 2, canvas.height - 20],
    [canvas.width - 20, canvas.height - 20],
  ];

  let blankCount = 0;
  for (const [rawX, rawY] of points) {
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(rawX)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(rawY)));
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const isBlankPixel = pixel[3] === 0 || (pixel[0] > 248 && pixel[1] > 248 && pixel[2] > 248);
    if (isBlankPixel) blankCount += 1;
  }

  return blankCount >= points.length - 1;
}

function pxToInX(px) {
  return Number(((Number(px) || 0) * PPT_SCENE_SIZE.widthIn / PPT_SCENE_SIZE.widthPx).toFixed(4));
}

function pxToInY(px) {
  return Number(((Number(px) || 0) * PPT_SCENE_SIZE.heightIn / PPT_SCENE_SIZE.heightPx).toFixed(4));
}

function pxToPt(px) {
  return Number(((Number(px) || 0) * 72 / 96).toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTextValue(text = '') {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCssColor(color, opacityMultiplier = 1) {
  const raw = String(color || '').trim();
  if (!raw || raw === 'transparent') return null;

  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    const normalized = hex.length === 3
      ? hex.split('').map(char => char + char).join('')
      : hex.slice(0, 6);
    const alpha = clamp(opacityMultiplier, 0, 1);
    return {
      color: normalized.toUpperCase(),
      alpha,
      transparency: Math.round((1 - alpha) * 100)
    };
  }

  const match = raw.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(',').map(part => part.trim());
  const [r = '0', g = '0', b = '0', a = '1'] = parts;
  const red = clamp(Math.round(Number(r) || 0), 0, 255);
  const green = clamp(Math.round(Number(g) || 0), 0, 255);
  const blue = clamp(Math.round(Number(b) || 0), 0, 255);
  const alpha = clamp((parts.length > 3 ? Number(a) : 1) * opacityMultiplier, 0, 1);
  if (alpha <= 0) return null;

  return {
    color: [red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(),
    alpha,
    transparency: Math.round((1 - alpha) * 100)
  };
}

function normalizeFontFamily(fontFamily = '') {
  const first = String(fontFamily || '')
    .split(',')
    .map(part => part.replace(/['"]/g, '').trim())
    .find(Boolean);

  if (!first) return 'Microsoft YaHei';
  if (/^(ui-|system-ui|-apple-system|blinkmacsystemfont|segoe ui|sans-serif|serif|monospace)$/i.test(first)) {
    return 'Microsoft YaHei';
  }
  return first;
}

function getElementDepth(element) {
  let depth = 0;
  let current = element;
  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function getRelativeRect(element, slideRect) {
  const rect = element.getBoundingClientRect();
  const left = clamp(rect.left - slideRect.left, 0, PPT_SCENE_SIZE.widthPx);
  const top = clamp(rect.top - slideRect.top, 0, PPT_SCENE_SIZE.heightPx);
  const right = clamp(rect.right - slideRect.left, 0, PPT_SCENE_SIZE.widthPx);
  const bottom = clamp(rect.bottom - slideRect.top, 0, PPT_SCENE_SIZE.heightPx);
  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

function isRenderableElement(element, slideRect, style = window.getComputedStyle(element)) {
  if (!element || !style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if ((Number(style.opacity) || 0) <= 0) return false;

  const rect = getRelativeRect(element, slideRect);
  if (rect.w < 1 || rect.h < 1) return false;
  return rect.x < PPT_SCENE_SIZE.widthPx && rect.y < PPT_SCENE_SIZE.heightPx;
}

function getRotationDegrees(style) {
  const transform = style?.transform || '';
  if (!transform || transform === 'none') return 0;

  try {
    const matrix = new DOMMatrixReadOnly(transform);
    const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    return Number(angle.toFixed(2));
  } catch {
    return 0;
  }
}

function getShapeShadow(boxShadow = '') {
  const raw = String(boxShadow || '').trim();
  if (!raw || raw === 'none') return null;

  const firstShadow = raw.includes('),') ? `${raw.split('),')[0]})` : raw;
  const shadowMatch = firstShadow.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
  if (!shadowMatch) return null;

  const [, offsetX, offsetY, blurRadius, , colorValue] = shadowMatch;
  const color = parseCssColor(colorValue);
  if (!color) return null;

  const distancePx = Math.sqrt((Number(offsetX) || 0) ** 2 + (Number(offsetY) || 0) ** 2);
  const angle = Math.atan2(Number(offsetY) || 0, Number(offsetX) || 0) * (180 / Math.PI);

  return {
    color: color.color,
    opacity: Number((color.alpha * 0.6).toFixed(2)),
    blur: pxToPt(Number(blurRadius) || 0),
    distance: pxToPt(distancePx),
    angle: Number(angle.toFixed(2))
  };
}

function getUniformBorder(style) {
  const widths = ['Top', 'Right', 'Bottom', 'Left'].map(side => Number.parseFloat(style[`border${side}Width`]) || 0);
  const styles = ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Style`]);
  const colors = ['Top', 'Right', 'Bottom', 'Left'].map(side => parseCssColor(style[`border${side}Color`]));

  if (!widths.some(width => width > 0)) return null;
  if (styles.every(value => value === 'none')) return null;

  const primaryColor = colors.find(Boolean);
  if (!primaryColor) return null;

  return {
    color: primaryColor.color,
    transparency: primaryColor.transparency,
    width: pxToPt(Math.max(...widths)),
    dashType: styles.some(value => value === 'dashed') ? 'dash' : 'solid'
  };
}

function collectTextElements(slideEl) {
  const slideRect = slideEl.getBoundingClientRect();
  const candidates = new Set();
  const walker = document.createTreeWalker(slideEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!normalizeTextValue(node.textContent || '')) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('svg,script,style,noscript')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    let candidate = currentNode.parentElement;
    while (candidate && candidate !== slideEl) {
      const style = window.getComputedStyle(candidate);
      if (style.display !== 'inline' && style.display !== 'contents') break;
      candidate = candidate.parentElement;
    }
    if (candidate && candidate !== slideEl) {
      candidates.add(candidate);
    }
    currentNode = walker.nextNode();
  }

  return Array.from(candidates)
    .filter(element => isRenderableElement(element, slideRect))
    .filter(element => {
      const text = normalizeTextValue(element.innerText || element.textContent || '');
      if (!text) return false;
      const rect = getRelativeRect(element, slideRect);
      if (rect.w < 6 || rect.h < 6) return false;
      return Boolean(parseCssColor(window.getComputedStyle(element).color, Number(window.getComputedStyle(element).opacity) || 1));
    })
    .sort((a, b) => getElementDepth(a) - getElementDepth(b))
    .filter((element, index, array) => {
      const text = normalizeTextValue(element.innerText || element.textContent || '');
      return !array.some((other, otherIndex) => (
        otherIndex < index &&
        other.contains(element) &&
        normalizeTextValue(other.innerText || other.textContent || '') === text
      ));
    });
}

function collectImageElements(slideEl) {
  const slideRect = slideEl.getBoundingClientRect();
  return Array.from(slideEl.querySelectorAll('img, svg'))
    .filter(element => isRenderableElement(element, slideRect))
    .filter(element => {
      const rect = getRelativeRect(element, slideRect);
      return rect.w >= 4 && rect.h >= 4;
    });
}

function collectShapeElements(slideEl, imageElements) {
  const slideRect = slideEl.getBoundingClientRect();
  const imageSet = new Set(imageElements);

  return Array.from(slideEl.querySelectorAll('*'))
    .filter(element => element !== slideEl)
    .filter(element => !imageSet.has(element))
    .filter(element => !element.closest('svg'))
    .filter(element => {
      const style = window.getComputedStyle(element);
      if (!isRenderableElement(element, slideRect, style)) return false;

      const rect = getRelativeRect(element, slideRect);
      if (rect.w < 6 || rect.h < 6) return false;
      if (rect.w > 940 && rect.h > 520) return false;
      if (style.backgroundImage && style.backgroundImage !== 'none') return false;

      const fill = parseCssColor(style.backgroundColor, Number(style.opacity) || 1);
      const border = getUniformBorder(style);
      const hasShadow = style.boxShadow && style.boxShadow !== 'none';
      return Boolean(fill || border || hasShadow);
    });
}

function svgMarkupToDataUrl(markup = '') {
  const normalized = String(markup || '').trim();
  if (!normalized) return '';
  return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(normalized)))}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchUrlAsDataUrl(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function inlineSvgComputedStyles(sourceNode, targetNode) {
  if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

  const style = window.getComputedStyle(sourceNode);
  const relevantProps = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'color',
    'filter',
    'mix-blend-mode',
    'transform',
    'transform-origin',
    'display',
    'visibility'
  ];

  const styleText = relevantProps
    .map(prop => {
      const value = style.getPropertyValue(prop);
      return value && value !== 'none' && value !== 'normal' ? `${prop}:${value}` : '';
    })
    .filter(Boolean)
    .join(';');

  if (styleText) {
    const existing = targetNode.getAttribute('style');
    targetNode.setAttribute('style', existing ? `${existing};${styleText}` : styleText);
  }

  Array.from(sourceNode.children).forEach((child, index) => {
    inlineSvgComputedStyles(child, targetNode.children[index]);
  });
}

function svgElementToDataUrl(svgElement) {
  const clone = svgElement.cloneNode(true);
  const rect = svgElement.getBoundingClientRect();

  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  if (!clone.getAttribute('width') && rect.width) {
    clone.setAttribute('width', `${Math.max(1, Math.round(rect.width))}`);
  }
  if (!clone.getAttribute('height') && rect.height) {
    clone.setAttribute('height', `${Math.max(1, Math.round(rect.height))}`);
  }
  if (!clone.getAttribute('viewBox') && rect.width && rect.height) {
    clone.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(rect.width))} ${Math.max(1, Math.round(rect.height))}`);
  }

  inlineSvgComputedStyles(svgElement, clone);
  return svgMarkupToDataUrl(new XMLSerializer().serializeToString(clone));
}

async function captureElementAsDataUrl(element) {
  if (!element) return '';

  const tagName = element.tagName?.toLowerCase?.() || '';
  const rect = element.getBoundingClientRect();

  if (tagName === 'svg') {
    return svgElementToDataUrl(element);
  }

  if (tagName === 'img') {
    const src = element.currentSrc || element.src || element.getAttribute('src') || '';
    if (!src) return '';
    if (src.startsWith('data:')) return src;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, element.naturalWidth || Math.ceil(rect.width));
      canvas.height = Math.max(1, element.naturalHeight || Math.ceil(rect.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Missing canvas context');
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      try {
        return await fetchUrlAsDataUrl(src);
      } catch {
        // Fall through to html2canvas fallback.
      }
    }
  }

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      logging: false,
      useCORS: true,
      foreignObjectRendering: false,
      scale: 3,
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height)),
      windowWidth: Math.max(1, Math.ceil(rect.width)),
      windowHeight: Math.max(1, Math.ceil(rect.height)),
      scrollX: 0,
      scrollY: 0
    });

    return isCanvasMostlyBlank(canvas) ? '' : canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Skipping element capture for editable PPT:', error?.message || error);
    return '';
  }
}

async function captureBackgroundLayer(slideEl, hiddenElements) {
  hiddenElements.forEach(element => element.setAttribute('data-ppt-export-hidden', 'true'));

  let canvas;
  try {
    canvas = await html2canvas(slideEl, {
      backgroundColor: null,
      logging: false,
      useCORS: true,
      foreignObjectRendering: false,
      scale: 2,
      width: PPT_SCENE_SIZE.widthPx,
      height: PPT_SCENE_SIZE.heightPx,
      windowWidth: PPT_SCENE_SIZE.widthPx,
      windowHeight: PPT_SCENE_SIZE.heightPx,
      scrollX: 0,
      scrollY: 0
    });
  } finally {
    hiddenElements.forEach(element => element.removeAttribute('data-ppt-export-hidden'));
  }

  return isCanvasMostlyBlank(canvas) ? '' : canvas.toDataURL('image/png');
}

function applyTextTransform(text, textTransform) {
  if (textTransform === 'uppercase') return text.toUpperCase();
  if (textTransform === 'lowercase') return text.toLowerCase();
  if (textTransform === 'capitalize') {
    return text.replace(/\b(\w)/g, match => match.toUpperCase());
  }
  return text;
}

function buildTextScene(element, slideRect) {
  const style = window.getComputedStyle(element);
  const rect = getRelativeRect(element, slideRect);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const color = parseCssColor(style.color, Number(style.opacity) || 1);
  const fontSizePx = Number.parseFloat(style.fontSize) || 16;
  const rawLineHeight = style.lineHeight === 'normal'
    ? fontSizePx * 1.2
    : (Number.parseFloat(style.lineHeight) || (fontSizePx * 1.2));
  const text = normalizeTextValue(applyTextTransform(element.innerText || element.textContent || '', style.textTransform));

  if (!text || !color) return null;

  return {
    text,
    x: pxToInX(rect.x + paddingLeft),
    y: pxToInY(rect.y + paddingTop),
    w: pxToInX(Math.max(4, rect.w - paddingLeft - paddingRight)),
    h: pxToInY(Math.max(4, rect.h - paddingTop - paddingBottom)),
    fontSize: pxToPt(fontSizePx),
    fontFace: normalizeFontFamily(style.fontFamily),
    color: color.color,
    transparency: color.transparency,
    bold: style.fontWeight === 'bold' || (Number(style.fontWeight) || 0) >= 600,
    italic: style.fontStyle.includes('italic'),
    underline: style.textDecorationLine.includes('underline'),
    align: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : style.textAlign === 'justify' ? 'justify' : 'left',
    valign: 'top',
    lineSpacingMultiple: Number((rawLineHeight / fontSizePx).toFixed(2)),
    rotate: getRotationDegrees(style),
  };
}

function buildShapeScene(element, slideRect) {
  const style = window.getComputedStyle(element);
  const rect = getRelativeRect(element, slideRect);
  const fill = parseCssColor(style.backgroundColor, Number(style.opacity) || 1);
  const line = getUniformBorder(style);
  const shadow = getShapeShadow(style.boxShadow);
  const radiusPx = Number.parseFloat(style.borderTopLeftRadius) || 0;
  const minSide = Math.min(rect.w, rect.h);
  const rotation = getRotationDegrees(style);

  if (rect.w < 6 || rect.h < 6) return null;

  if (!fill && !line && !shadow) return null;

  if (minSide <= 6 && Math.max(rect.w, rect.h) >= 24 && fill) {
    const isHorizontal = rect.w >= rect.h;
    return {
      kind: 'line',
      x: pxToInX(isHorizontal ? rect.x : rect.x + (rect.w / 2)),
      y: pxToInY(isHorizontal ? rect.y + (rect.h / 2) : rect.y),
      w: pxToInX(isHorizontal ? rect.w : 0.01),
      h: pxToInY(isHorizontal ? 0.01 : rect.h),
      line: {
        color: fill.color,
        transparency: fill.transparency,
        width: pxToPt(Math.max(1, minSide))
      },
      rotate: rotation
    };
  }

  const shapeKind = radiusPx >= (minSide / 2) - 2
    ? 'ellipse'
    : radiusPx > 2
      ? 'roundRect'
      : 'rect';

  return {
    kind: shapeKind,
    x: pxToInX(rect.x),
    y: pxToInY(rect.y),
    w: pxToInX(rect.w),
    h: pxToInY(rect.h),
    rectRadius: shapeKind === 'roundRect' ? Number(clamp(radiusPx / Math.max(1, minSide), 0, 1).toFixed(3)) : 0,
    fill: fill ? { color: fill.color, transparency: fill.transparency } : null,
    line,
    shadow,
    rotate: rotation
  };
}

async function buildEditableSceneFromHtml(slideHtml, tempContainer) {
  tempContainer.innerHTML = `
    <style>
      ${PPT_CAPTURE_STYLE}
      [data-ppt-export-hidden="true"] {
        visibility: hidden !important;
      }
      [data-ppt-export-hidden="true"] * {
        visibility: hidden !important;
      }
    </style>
    <div class="ppt-capture-surface">
      ${slideHtml}
    </div>
  `;

  const slideEl = tempContainer.querySelector('.ppt-capture-surface .slide');
  if (!slideEl) {
    throw new Error('Failed to prepare editable slide scene.');
  }

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 180));

  const slideRect = slideEl.getBoundingClientRect();
  const textElements = collectTextElements(slideEl);
  const imageElements = collectImageElements(slideEl);
  const shapeElements = collectShapeElements(slideEl, imageElements);

  const images = [];
  for (const element of imageElements) {
    try {
      const rect = getRelativeRect(element, slideRect);
      const data = await captureElementAsDataUrl(element);
      if (!data) continue;
      images.push({
        data,
        x: pxToInX(rect.x),
        y: pxToInY(rect.y),
        w: pxToInX(rect.w),
        h: pxToInY(rect.h),
        rotate: getRotationDegrees(window.getComputedStyle(element)),
        transparency: 0
      });
    } catch (error) {
      console.warn('Skipping image element during editable PPT export:', error?.message || error);
    }
  }

  const shapes = shapeElements
    .map(element => buildShapeScene(element, slideRect))
    .filter(Boolean);

  const texts = textElements
    .map(element => buildTextScene(element, slideRect))
    .filter(Boolean);

  const hiddenElements = Array.from(new Set([...shapeElements, ...textElements, ...imageElements]));
  const backgroundData = await captureBackgroundLayer(slideEl, hiddenElements);
  const backgroundColor = parseCssColor(window.getComputedStyle(slideEl).backgroundColor)?.color || 'FFFFFF';

  return {
    backgroundColor,
    backgroundLayer: backgroundData ? { data: backgroundData } : null,
    shapes,
    images,
    texts,
  };
}

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
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [scale, setScale] = useState(0.5);
  const [downloading, setDownloading] = useState(false);
  const [editableDownloading, setEditableDownloading] = useState(false);
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
    let tempContainer = null;
    try {
      try {
        const response = await axios.post(`${BACKEND_URL}/api/ppt/download-images`, {
          slides: slides.map(slide => ({
            title: slide.title,
            content: slide.content,
          })),
          finalHtml,
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
        window.URL.revokeObjectURL(url);
        return;
      } catch (serverError) {
        console.warn('Server-side PPT snapshot export failed, falling back to browser capture:', serverError);
      }

      const slideImages = [];
      // Create a temporary container for rendering slides at full scale
      tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '960px';
      tempContainer.style.height = '540px';
      tempContainer.style.overflow = 'hidden';
      tempContainer.className = 'ppt-capture-container';
      document.body.appendChild(tempContainer);

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];

        // Render slide content into temp container
        tempContainer.innerHTML = `
          <style>${PPT_CAPTURE_STYLE}</style>
          <div class="ppt-capture-surface">
            ${slide.content}
          </div>
        `;

        const captureNode = tempContainer.querySelector('.ppt-capture-surface');
        if (!captureNode) {
          throw new Error('Failed to prepare slide capture surface.');
        }

        // Wait for styles and icons to render
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 300));

        let canvas = await html2canvas(captureNode, {
          width: 960,
          height: 540,
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          foreignObjectRendering: false,
          windowWidth: 960,
          windowHeight: 540,
          scrollX: 0,
          scrollY: 0
        });

        if (isCanvasMostlyBlank(canvas)) {
          canvas = await html2canvas(tempContainer, {
            width: 960,
            height: 540,
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            foreignObjectRendering: false,
            windowWidth: 960,
            windowHeight: 540,
            scrollX: 0,
            scrollY: 0
          });
        }

        slideImages.push(canvas.toDataURL('image/png'));
      }

      document.body.removeChild(tempContainer);
      tempContainer = null;

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
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('导出 PPTX 失败，请重试');
    } finally {
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setDownloading(false);
    }
  };

  const downloadEditablePptx = async () => {
    const slides = steps.filter(s => s.content);
    if (slides.length === 0) return;

    setEditableDownloading(true);
    let tempContainer = null;
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '960px';
      tempContainer.style.height = '540px';
      tempContainer.style.overflow = 'hidden';
      tempContainer.className = 'ppt-editable-capture-container';
      document.body.appendChild(tempContainer);

      const scenes = [];
      for (const slide of slides) {
        const scene = await buildEditableSceneFromHtml(slide.content, tempContainer);
        scenes.push(scene);
      }

      const response = await axios.post(`${BACKEND_URL}/api/ppt/download-editable`, {
        slides,
        scenes,
        title: pptTitle
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${pptTitle || 'Smart-PPT'}-editable.pptx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Editable PPT download failed:', error);
      alert('可编辑 PPTX 导出失败，请重试');
    } finally {
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setEditableDownloading(false);
    }
  };

  const renderFocusButton = (focusMode = false) => (
    <button
      onClick={() => setIsFocusMode(!focusMode)}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition-all hover:bg-gray-50 shadow-sm"
    >
      {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      {focusMode ? 'Exit Focus' : 'Focus'}
    </button>
  );

  if (isPreviewMode && finalHtml) {
    const previewView = (focusMode = false) => (
      <div className={`flex flex-col overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in duration-300 ${focusMode ? 'h-full rounded-[2rem]' : 'h-[600px] rounded-2xl border'}`}>
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
          <div className="flex items-center gap-2">
            <Presentation size={20} className="text-orange-600" />
            <span className="font-bold text-gray-800">{pptTitle} - 预览</span>
          </div>
          <div className="flex items-center gap-2">
            {renderFocusButton(focusMode)}
            <button
              onClick={downloadEditablePptx}
              disabled={editableDownloading || downloading}
              className={`flex items-center gap-2 px-3 py-1.5 bg-white text-orange-700 border border-orange-200 rounded-lg text-xs font-bold hover:bg-orange-50 transition-all shadow-sm active:scale-95 ${(editableDownloading || downloading) ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {editableDownloading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  正在生成可编辑版...
                </>
              ) : (
                <>
                  <FileText size={14} />
                  下载可编辑 PPTX
                </>
              )}
            </button>
            <button
              onClick={downloadPptx}
              disabled={downloading || editableDownloading}
              className={`flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-all shadow-md active:scale-95 ${(downloading || editableDownloading) ? 'opacity-70 cursor-not-allowed' : ''}`}
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

    return (
      <>
        {previewView(false)}
        {isFocusMode && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[170] bg-slate-950/55 p-3 backdrop-blur-md md:p-6">
            {previewView(true)}
          </div>,
          document.body
        )}
      </>
    );
  }

  const mainView = (
    <div className={`relative p-4 rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-500 ${isEmbedded ? 'w-full' : 'max-w-4xl mx-auto h-[600px] flex flex-col'}`}>
      <div className="absolute right-4 top-4 z-10">
        {renderFocusButton(false)}
      </div>
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
              onClick={downloadEditablePptx}
              disabled={editableDownloading || downloading}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-200 hover:bg-orange-50 text-orange-700 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${(editableDownloading || downloading) ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {editableDownloading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {editableDownloading ? '正在生成可编辑版...' : '下载可编辑 PPTX'}
            </button>
            <button
              onClick={downloadPptx}
              disabled={downloading || editableDownloading}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${(downloading || editableDownloading) ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                      {sanitizeThinkingText(activeStep.thinking || '')}
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
                    {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-200" />)}
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

  return (
    <>
      {mainView}
      {isFocusMode && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[170] bg-slate-950/55 p-3 backdrop-blur-md md:p-6">
          <button
            onClick={() => setIsFocusMode(false)}
            className="absolute right-6 top-6 z-20 flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-white"
          >
            <Minimize2 size={14} />
            Exit Focus
          </button>
          {mainView}
        </div>,
        document.body
      )}
    </>
  );
}

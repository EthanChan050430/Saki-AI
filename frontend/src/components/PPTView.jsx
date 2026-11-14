import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  CheckCircle2,
  Circle,
  Loader2,
  FileText,
  Download,
  Presentation,
  Layout,
  Monitor,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Wand2,
  AlertCircle,
  Layers,
  Image as ImageIcon,
  Paperclip,
  ArrowUp,
  Undo2,
  ArrowUpRight,
} from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const html2canvas = async (...args) => (await import('html2canvas')).default(...args);
import { BACKEND_URL } from '../utils/backendUrl';
import { localizeWith } from '../utils/localize';
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

const SAKI_PPT_ANIM_STYLE = `
  @keyframes saki-ppt-float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes saki-ppt-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes saki-ppt-eq {
    0%, 100% { transform: scaleY(0.35); opacity: 0.55; }
    50% { transform: scaleY(1); opacity: 1; }
  }
  @keyframes saki-ppt-orbit {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.04); }
    100% { transform: rotate(360deg) scale(1); }
  }
  .saki-ppt-float { animation: saki-ppt-float 3.4s ease-in-out infinite; }
  .saki-ppt-shimmer {
    background: linear-gradient(90deg, rgba(255,117,172,0.06) 25%, rgba(255,117,172,0.16) 50%, rgba(255,117,172,0.06) 75%);
    background-size: 200% 100%;
    animation: saki-ppt-shimmer 2.1s infinite linear;
  }
  .saki-ppt-eq-bar {
    transform-origin: bottom center;
    animation: saki-ppt-eq 1.1s ease-in-out infinite;
  }
  .saki-ppt-orbit { animation: saki-ppt-orbit 18s linear infinite; }
  @media (prefers-reduced-motion: reduce) {
    .saki-ppt-float, .saki-ppt-shimmer, .saki-ppt-eq-bar, .saki-ppt-orbit {
      animation: none !important;
    }
  }
`;

function SakiStageAvatar({ sources, alt, className = '' }) {
  const [idx, setIdx] = useState(0);
  const key = sources.join('|');
  useEffect(() => {
    setIdx(0);
  }, [key]);
  const src = sources[Math.min(idx, sources.length - 1)];
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setIdx((prev) => (prev + 1 < sources.length ? prev + 1 : prev));
      }}
    />
  );
}

function SakiStudioStage({
  stageKind,
  step,
  stepIndex,
  totalContentSlides,
  elapsedSeconds,
  tx,
  onBrowseFirst,
  onOpenPreview,
  onDownloadEditable,
  onDownloadSnapshot,
  downloading,
  editableDownloading,
}) {
  const [quoteTick, setQuoteTick] = useState(0);
  const planningQuotes = [
    tx('Saki 正在为你梳理演示文稿的章节脉络与故事线~ ✨', 'Saki is mapping out your presentation narrative and chapters~ ✨', 'Sakiが構成とストーリーラインを整理しています~ ✨'),
    tx('正在拆解每一页的核心观点与视觉版式设计 ♪', 'Breaking down key insights and layout hints for each slide ♪', '各スライドの要点とレイアウトを組み立て中 ♪'),
    tx('马上就好啦，正在平衡封面视觉重心与内容节奏~', 'Almost ready—balancing cover impact and pacing across slides~', 'もうすぐ完了！表紙と全体のテンポを調整しています~'),
  ];
  const thinkingQuotes = [
    tx(`正在推敲第 ${stepIndex + 1} 页的视觉焦点与信息层级~ ✨`, `Refining visual hierarchy for slide ${stepIndex + 1}~ ✨`, `${stepIndex + 1}ページ目の視覚設計を構想中~ ✨`),
    tx('把长文本凝练成一眼看懂的要点卡片与结构图 ♪', 'Distilling dense points into crisp visual cards and structure ♪', '要点を読みやすいビジュアル構造へ整理しています ♪'),
  ];
  const codingQuotes = [
    tx(`版式构思完成！Saki 正在为你绘制第 ${stepIndex + 1} 页的视觉元素与排版~ 🖌️✨`, `Layout ready! Saki is painting slide ${stepIndex + 1} elements and typography~ 🖌️✨`, `レイアウト確定！${stepIndex + 1}ページ目のデザインを描画中です~ 🖌️✨`),
    tx('正在精调配色对比、留白安全区与卡片细节~', 'Fine-tuning color contrast, safe margins, and card details~', '配色バランスと余白のディテールを整えています~'),
  ];

  useEffect(() => {
    const timer = setInterval(() => setQuoteTick((prev) => prev + 1), 3500);
    return () => clearInterval(timer);
  }, [stageKind, stepIndex]);

  if (stageKind === 'final') {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-rose-50/85 via-white to-orange-50/75 p-6 text-center dark:from-[#1f1824] dark:via-[#171924] dark:to-[#1f1a18]">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-pink-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-14 -left-10 h-52 w-52 rounded-full bg-orange-300/20 blur-3xl" />

        <div className="relative z-10 flex max-w-xl flex-col items-center">
          <div className="saki-ppt-float relative mb-3 flex h-44 w-44 items-center justify-center">
            <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-[#ff75ac]/25 via-amber-200/25 to-sky-200/20 blur-xl" />
            <SakiStageAvatar
              sources={['/assets/saki/ppt/ppt_complete.webp', '/assets/saki/ppt/ppt_complete.png', '/assets/saki/docked/clap.png']}
              alt="Saki Presentation Ready"
              className="relative h-full w-full object-contain drop-shadow-[0_14px_24px_rgba(255,117,172,0.22)]"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={14} />
            {tx(`全稿共 ${totalContentSlides} 页幻灯片已制作完成`, `All ${totalContentSlides} slides are ready`, `全${totalContentSlides}枚のスライドが完成しました`)}
          </div>

          <h4 className="mt-3 text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {tx('Saki 已经把整套演示文稿封装好啦~ ✨', 'Saki has finished packaging your presentation~ ✨', 'Sakiがプレゼンテーションの仕上げを完了しました~ ✨')}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tx('你可以切回第 1 页逐页微调，或直接开启全屏预览与导出 PPTX。', 'Jump back to Slide 1 to review & revise, or preview and export as PPTX.', '1ページ目から確認・編集するか、全画面プレビューやPPTX出力ができます。')}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {totalContentSlides > 0 && (
              <button
                type="button"
                onClick={onBrowseFirst}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff75ac] to-[#ff5b9a] px-4 py-2 text-xs font-bold text-white shadow-md shadow-pink-500/25 transition hover:brightness-105 active:scale-95"
              >
                <Layers size={14} />
                {tx('浏览第 1 页', 'Browse Slide 1', '1ページ目を見る')}
              </button>
            )}
            {totalContentSlides > 0 && (
              <button
                type="button"
                onClick={onOpenPreview}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
              >
                <Monitor size={14} />
                {tx('全屏预览', 'Full Preview', '全画面プレビュー')}
              </button>
            )}
            <button
              type="button"
              onClick={onDownloadEditable}
              disabled={editableDownloading || downloading || totalContentSlides === 0}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/80 px-3.5 py-2 text-xs font-bold text-orange-700 shadow-sm transition hover:bg-orange-100/70 active:scale-95 disabled:opacity-60 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200"
            >
              {editableDownloading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {tx('下载可编辑 PPTX', 'Editable PPTX', '編集可能 PPTX')}
            </button>
            <button
              type="button"
              onClick={onDownloadSnapshot}
              disabled={downloading || editableDownloading || totalContentSlides === 0}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {tx('下载 PPTX', 'Download PPTX', 'PPTX を保存')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stageKind === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-rose-50/40 p-6 text-center dark:bg-rose-950/15">
        <SakiStageAvatar
          sources={['/assets/saki/docked/worry.png', '/assets/saki/full/worry.png']}
          alt="Saki Error"
          className="h-32 w-32 object-contain"
        />
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
          <AlertCircle size={14} />
          {tx(`第 ${stepIndex + 1} 页生成遇到问题`, `Slide ${stepIndex + 1} failed`, `${stepIndex + 1}ページ目の生成に失敗`)}
        </div>
        <p className="mt-2 max-w-md text-xs text-slate-600 dark:text-slate-300">
          {step?.thinking || tx('这一页暂时未能完成渲染，可以查看其他页面或重新生成。', 'This slide could not be rendered.', 'このスライドの生成を完了できませんでした。')}
        </p>
      </div>
    );
  }

  const isSearchingImage = step?.subStage === 'searching-image' || stageKind === 'searching-image';
  const isDrawingImage = step?.subStage === 'drawing-image' || stageKind === 'drawing-image';
  const isCoding = stageKind === 'coding' || isSearchingImage || isDrawingImage;
  const isPlanning = stageKind === 'planning';
  const isQueued = stageKind === 'queued';

  const avatarSources = isCoding
    ? ['/assets/saki/ppt/ppt_design.webp', '/assets/saki/ppt/ppt_design.png', '/assets/saki/docked/happy.png']
    : ['/assets/saki/ppt/ppt_plan.webp', '/assets/saki/ppt/ppt_plan.png', '/assets/saki/docked/think.png'];

  const activeQuotes = isPlanning ? planningQuotes : isCoding ? codingQuotes : thinkingQuotes;
  const activeQuote = isQueued
    ? tx(`第 ${stepIndex + 1} 页正在排队等待 Saki 绘制中~ ⏳`, `Slide ${stepIndex + 1} is queued next~ ⏳`, `${stepIndex + 1}ページ目は待機中です~ ⏳`)
    : isSearchingImage
      ? tx('Saki 正在检索与本页主题契合的高清配图~ 🔍', 'Saki is searching the web for a matching high-res image~ 🔍', 'テーマに合う高解像度画像を検索中~ 🔍')
      : isDrawingImage
        ? tx('Saki 正在挥动画笔，为本页绘制专属 AI 插画~ 🎨', 'Saki is painting a custom AI illustration for this slide~ 🎨', 'AIイラストを描画中~ 🎨')
        : activeQuotes[quoteTick % activeQuotes.length];

  const activePhaseIdx = isPlanning ? 0 : isCoding ? 2 : 1;
  const phasePills = [
    tx('01 架构拆解', '01 Outline', '01 構成設計'),
    tx('02 版式推敲', '02 Thinking', '02 レイアウト考案'),
    tx('03 视觉渲染', '03 Rendering', '03 ビジュアル描画'),
  ];

  const streamPct = isCoding
    ? Math.min(96, Math.max(12, Math.round((Number(step?.streamProgress || 0) / 2200) * 100)))
    : 0;
  const thinkingLen = String(step?.thinking || '').length;

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#fff8fb] via-white to-[#f6f8ff] p-5 md:p-6 dark:from-[#171624] dark:via-[#151722] dark:to-[#1b1622]">
      <div
        className="pointer-events-none absolute inset-0 opacity-45 dark:opacity-20"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,117,172,0.18) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-[#ff75ac]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 left-8 h-44 w-44 rounded-full bg-indigo-400/12 blur-3xl" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {phasePills.map((label, idx) => {
            const done = !isQueued && idx < activePhaseIdx;
            const current = !isQueued && idx === activePhaseIdx;
            return (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                  current
                    ? 'bg-gradient-to-r from-[#ff75ac] to-[#ff5b9a] text-white shadow-sm shadow-pink-500/25'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
                      : 'bg-white/80 text-slate-400 ring-1 ring-slate-200/80 dark:bg-white/5 dark:text-slate-500 dark:ring-white/10'
                }`}
              >
                {current && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />}
                {done && <CheckCircle2 size={11} />}
                {label}
              </span>
            );
          })}
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-pink-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm dark:border-pink-400/20 dark:bg-white/10 dark:text-slate-200">
          <div className="flex h-3 items-end gap-0.5">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className="saki-ppt-eq-bar w-0.5 rounded-full bg-[#ff5b9a]"
                style={{
                  height: `${8 + (bar % 2) * 4}px`,
                  animationDelay: `${bar * 0.16}s`,
                }}
              />
            ))}
          </div>
          <span>{tx(`已运行 ${elapsedSeconds}s`, `${elapsedSeconds}s elapsed`, `${elapsedSeconds}秒経過`)}</span>
        </div>
      </div>

      <div className="relative z-10 my-auto flex flex-col items-center justify-center gap-4 py-3 md:flex-row md:gap-7">
        <div className="relative flex shrink-0 flex-col items-center">
          <div className="saki-ppt-orbit pointer-events-none absolute inset-1 rounded-full border border-dashed border-[#ff75ac]/35" />
          <div className="saki-ppt-float relative flex h-40 w-40 items-center justify-center md:h-48 md:w-48">
            <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-[#ff75ac]/22 via-pink-200/20 to-indigo-300/15 blur-2xl" />
            <SakiStageAvatar
              sources={avatarSources}
              alt="Saki Thinking"
              className="relative h-full w-full object-contain drop-shadow-[0_14px_26px_rgba(255,117,172,0.24)]"
            />
          </div>
        </div>

        <div className="flex w-full max-w-md flex-col gap-3">
          <div className="relative rounded-2xl border border-pink-200/75 bg-white/90 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-md dark:border-pink-400/25 dark:bg-[#222334]/90 dark:text-slate-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ff5b9a]">
              <Sparkles size={12} />
              <span>Saki Studio</span>
              {thinkingLen > 0 && (
                <span className="ml-auto rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-bold text-pink-600 dark:bg-pink-500/15 dark:text-pink-300">
                  {tx(`已构思 ${thinkingLen} 字`, `${thinkingLen} chars thought`, `${thinkingLen}文字構想`)}
                </span>
              )}
            </div>
            <p className="mt-1 leading-relaxed">{activeQuote}</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#1d1f2e]/85">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-extrabold text-white dark:bg-pink-500">
                {isPlanning ? 'OUTLINE' : `P${stepIndex + 1}`}
              </span>
              <h4 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                {step?.title || tx('正在规划演示结构...', 'Planning slide structure...', '構成を計画中...')}
              </h4>
            </div>

            {step?.description && (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {step.description}
              </p>
            )}

            {step?.designHint && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-indigo-50/75 px-2.5 py-1.5 text-[11px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                <Wand2 size={12} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{step.designHint}</span>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/90 p-2.5 dark:border-white/10 dark:bg-black/25">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-400">
                <span>
                  {isSearchingImage
                    ? tx('🔍 正在智能检索配图...', '🔍 Searching for slide visual...', '🔍 配図を検索中...')
                    : isDrawingImage
                      ? tx('🎨 正在调用绘图工具生图...', '🎨 Generating AI illustration...', '🎨 AIイラスト生成中...')
                      : isCoding
                        ? tx('正在组装 16:9 幻灯片版面...', 'Assembling 16:9 slide canvas...', '16:9キャンバスを描画中...')
                        : isPlanning
                          ? tx('正在推演全稿分镜蓝图...', 'Drafting deck storyboard...', '全体構成を作成中...')
                          : tx('正在构建页面构图骨架...', 'Structuring slide layout...', 'ページ骨格を構築中...')}
                </span>
                {isCoding && <span className="font-bold text-[#ff5b9a]">{streamPct}%</span>}
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5 h-12 rounded-lg saki-ppt-shimmer border border-pink-200/40" />
                <div className="col-span-7 flex flex-col gap-1.5">
                  <div className="h-3.5 w-3/4 rounded saki-ppt-shimmer" />
                  <div className="h-2.5 w-full rounded saki-ppt-shimmer" />
                  <div className="h-2.5 w-5/6 rounded saki-ppt-shimmer" />
                </div>
              </div>
              {isCoding && (
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ff75ac] via-pink-500 to-indigo-500 transition-all duration-300"
                    style={{ width: `${streamPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>{tx('AI 实时流式绘制中，完成后将自动呈现完整高清幻灯片', 'Streaming in real time — full HD slide will appear automatically', 'リアルタイム生成中・完了後に高精細スライドを表示します')}</span>
        <span className="hidden font-mono sm:inline">960 × 540 · 16:9</span>
      </div>
    </div>
  );
}

export default function PPTView({
  data,
  isEmbedded = true,
  isFocusMode: controlledFocusMode,
  onFocusModeChange,
  backendUrl = BACKEND_URL,
  onRevise,
  editingDisabled = false,
}) {
  const { t, i18n } = useTranslation();
  const tx = (zhText, enText, jaText) => localizeWith(i18n.resolvedLanguage || i18n.language, zhText, enText, jaText);
  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    const initialSteps = data?.steps || [];
    const initialStatus = data?.status || 'running';
    const isAllDone = initialSteps.length > 0 && initialSteps.every(s => s.status === 'completed' || s.status === 'success' || s.status === 'error');
    if ((initialStatus === 'completed' || isAllDone) && initialSteps.length > 1) {
      const firstIdx = initialSteps.findIndex(step => step.content);
      return firstIdx >= 0 ? firstIdx : 0;
    }
    return 0;
  });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [internalFocusMode, setInternalFocusMode] = useState(false);
  const isFocusMode = controlledFocusMode !== undefined ? Boolean(controlledFocusMode) : internalFocusMode;
  const setIsFocusMode = (nextValue) => {
    const resolved = typeof nextValue === 'function' ? nextValue(isFocusMode) : Boolean(nextValue);
    if (onFocusModeChange) {
      onFocusModeChange(resolved);
    } else {
      setInternalFocusMode(resolved);
    }
  };
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState(() => (data?.status === 'completed' ? 'revise' : 'thinking'));
  const [fitScale, setFitScale] = useState(0.75);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [previewListScale, setPreviewListScale] = useState(0.85);
  const [downloading, setDownloading] = useState(false);
  const [editableDownloading, setEditableDownloading] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [revisionHistoryLog, setRevisionHistoryLog] = useState([]);
  const [revising, setRevising] = useState(false);
  const [revisionError, setRevisionError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const previewContainerRef = useRef(null);
  const previewScrollRef = useRef(null);
  const stepButtonRefs = useRef([]);
  const fileInputRef = useRef(null);

  // Calculate if really running based on steps
  let { steps = [], finalHtml = '', status = 'running', pptTitle } = data || {};
  pptTitle = pptTitle || tx('演示文稿', 'Presentation', 'プレゼンテーション');

  // Robust status check: never override an actively running deck or step to completed
  const hasRunningStep = steps.some(s => s.status === 'running');
  const isAllDone = status !== 'running' && !hasRunningStep && steps.length > 0 && steps.every(s =>
    s.status === 'completed' || s.status === 'success' || s.status === 'error' || (s.content && s.thinking)
  );
  if (isAllDone && steps.length > 0) {
    status = 'completed';
  }

  // Ensure steps have correct status if the whole PPT is completed
  if (status === 'completed') {
    steps = steps.map(s => (s.status === 'running' || s.status === 'not-started') ? { ...s, status: 'completed' } : s);
  }

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== 'completed' && status === 'completed') {
      setSidebarTab('revise');
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (isEmbedded && !isFocusMode && isPreviewMode) {
      setIsPreviewMode(false);
    }
  }, [isEmbedded, isFocusMode, isPreviewMode]);

  const activeStep = steps[activeStepIndex];
  const contentSlides = steps.filter(s => Boolean(s.content));
  const completedStepsCount = steps.filter(s => s.status === 'completed' || s.status === 'success').length;
  const deckProgressPercent = steps.length > 0
    ? Math.round((completedStepsCount / steps.length) * 100)
    : 0;

  const handleAttachFiles = async (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    setUploadingAttachment(true);
    setRevisionError('');
    try {
      const apiBase = backendUrl || BACKEND_URL;
      const uploadedItems = [];
      for (const file of picked) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${apiBase}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error(tx(`上传 ${file.name} 失败`, `Failed to upload ${file.name}`));
        const uploaded = await res.json();
        uploadedItems.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: uploaded.filename || file.name,
          filename: uploaded.filename || file.name,
          path: uploaded.path,
          content: uploaded.content || '',
          isImage: Boolean(uploaded.isImage),
          previewUrl: uploaded.isImage ? URL.createObjectURL(file) : '',
        });
      }
      setAttachments((prev) => [...prev, ...uploadedItems]);
    } catch (err) {
      setRevisionError(err.message || tx('附件上传失败，请重试。', 'Attachment upload failed. Please retry.'));
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((prev) => {
      const removed = prev.find(item => item.id === attachmentId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(item => item.id !== attachmentId);
    });
  };

  const reviseSlide = async (restore = false) => {
    if (!onRevise || revising || editingDisabled || activeStep?.id == null) return;
    const trimmed = revisionInstruction.trim();
    if (!restore && !trimmed && attachments.length === 0) return;

    setRevising(true);
    setRevisionError('');
    try {
      if (restore) {
        await onRevise(activeStep.id, '', true);
        setRevisionHistoryLog((prev) => [
          ...prev,
          {
            id: Date.now(),
            userText: tx('撤销修改 · 恢复上一版', 'Restore previous version'),
            attachments: [],
            summary: tx(`已将第 ${activeStepIndex + 1} 页恢复到上一历史版本。`, `Restored slide ${activeStepIndex + 1} to previous version.`),
          },
        ]);
      } else {
        const attachmentPayload = attachments.map(({ name, filename, path, content, isImage }) => ({
          name,
          filename,
          path,
          content,
          isImage,
        }));
        const submittedText = trimmed || tx('结合附带的素材优化当前幻灯片与配图', 'Revise slide and visuals using attached files');
        const result = await onRevise(activeStep.id, submittedText, false, null, {
          scope: 'agent',
          attachments: attachmentPayload,
        });
        setRevisionHistoryLog((prev) => [
          ...prev,
          {
            id: Date.now(),
            userText: submittedText,
            attachments: attachments.map(a => ({ name: a.name, isImage: a.isImage, previewUrl: a.previewUrl })),
            summary: result?.summary || tx(`已完成修改（当前第 ${activeStepIndex + 1} 页）。`, `Updated slide ${activeStepIndex + 1}.`),
          },
        ]);
        setRevisionInstruction('');
        setAttachments([]);
      }
    } catch (error) {
      setRevisionError(error.response?.data?.error || error.message || tx('修改失败，请重试。', 'Revision failed. Please retry.', '変更に失敗しました。'));
    } finally {
      setRevising(false);
    }
  };

  const isFinalStep = Boolean(
    activeStep &&
    !activeStep.content &&
    (
      /制作完成|封装最终演示文稿|已完成|Finished|Completed/i.test(activeStep.title || '') ||
      (activeStepIndex === steps.length - 1 && steps.length > 1 && status === 'completed') ||
      (status === 'completed' && activeStepIndex === steps.length - 1)
    )
  );

  useEffect(() => {
    if (status === 'completed') {
      setElapsedSeconds(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, activeStepIndex]);

  useEffect(() => {
    const existingScript = document.querySelector('script[data-tailwind-cdn="ppt-preview"]');
    if (!existingScript && !window.tailwind) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      script.async = true;
      script.setAttribute('data-tailwind-cdn', 'ppt-preview');
      document.head.appendChild(script);
    }

    let style = document.querySelector('style[data-ppt-preview="base"]');
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-ppt-preview', 'base');
      document.head.appendChild(style);
    }
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
      ${SAKI_PPT_ANIM_STYLE}
    `;
  }, []);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return undefined;

    const computeScale = () => {
      const containerWidth = el.clientWidth || el.offsetWidth;
      const containerHeight = el.clientHeight || el.offsetHeight;
      if (!containerWidth || !containerHeight) return;
      const padX = containerWidth < 640 ? 16 : 32;
      const padY = containerHeight < 420 ? 16 : 32;
      const availW = Math.max(240, containerWidth - padX);
      const availH = Math.max(180, containerHeight - padY);
      const nextScale = clamp(Math.min(availW / 960, availH / 540), 0.25, 1.35);
      setFitScale(nextScale);
    };

    computeScale();
    const rafId = requestAnimationFrame(computeScale);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(computeScale);
      ro.observe(el);
    }
    window.addEventListener('resize', computeScale);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', computeScale);
    };
  }, [activeStepIndex, activeStep?.content, activeStep?.thinking, isPreviewMode, isFocusMode, isThinkingOpen, sidebarTab, status, steps.length]);

  useEffect(() => {
    if (!isPreviewMode) return undefined;
    const el = previewScrollRef.current;
    if (!el) return undefined;

    const updateListScale = () => {
      const w = el.clientWidth || window.innerWidth;
      setPreviewListScale(clamp((w - 64) / 960, 0.35, 1.15));
    };
    updateListScale();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateListScale);
      ro.observe(el);
    }
    window.addEventListener('resize', updateListScale);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateListScale);
    };
  }, [isPreviewMode, isFocusMode]);

  // Auto-follow running step or jump to first content slide when completed
  useEffect(() => {
    if (status === 'completed') {
      if (activeStepIndex === 0 && steps.length > 0 && !steps[0]?.content) {
        const firstContentIdx = steps.findIndex(s => s.content);
        if (firstContentIdx !== -1) {
          setActiveStepIndex(firstContentIdx);
        } else if (steps.length > 1) {
          setActiveStepIndex(1);
        }
      }
      return;
    }

    const runningIdx = steps.findIndex(s => s.status === 'running');
    if (runningIdx !== -1) {
      setActiveStepIndex(runningIdx);
    } else if (steps.length > 0 && activeStepIndex === 0) {
      const lastCompleted = [...steps].reverse().findIndex(s => s.status === 'completed' || s.status === 'success');
      if (lastCompleted !== -1) {
        setActiveStepIndex(steps.length - 1 - lastCompleted);
      }
    }
  }, [steps.length, status]);

  useEffect(() => {
    const btn = stepButtonRefs.current[activeStepIndex];
    if (btn && typeof btn.scrollIntoView === 'function') {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeStepIndex]);

  const effectiveScale = clamp(fitScale * zoomFactor, 0.25, 1.5);

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
      alert(tx('导出 PPTX 失败，请重试', 'Failed to export PPTX, please try again', 'PPTX のエクスポートに失敗しました。もう一度お試しください'));
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
      alert(tx('可编辑 PPTX 导出失败，请重试', 'Failed to export editable PPTX, please try again', '編集可能な PPTX のエクスポートに失敗しました。もう一度お試しください'));
    } finally {
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setEditableDownloading(false);
    }
  };

  const renderFocusButton = (focusMode = false) => (
    <button
      type="button"
      onClick={() => setIsFocusMode(!focusMode)}
      className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
      title={focusMode ? tx('收起全屏，回到对话', 'Exit Fullscreen', '全画面を閉じる') : tx('全屏工作台', 'Fullscreen Studio', '全画面表示')}
    >
      {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      <span className="hidden sm:inline">{focusMode ? tx('收起全屏', 'Exit Fullscreen', '閉じる') : tx('全屏', 'Fullscreen', '全画面')}</span>
    </button>
  );

  // Determine which Saki stage kind to show when slide content is not ready
  const getStageKind = () => {
    if (isFinalStep) return 'final';
    if (activeStep?.status === 'error') return 'error';
    const isPlanning = (
      steps.length <= 1
      && !activeStep?.content
      && (/规划|大纲|planning|outline/i.test(activeStep?.title || '') || (!activeStep?.thinking && !activeStep?.description))
    );
    if (isPlanning) return 'planning';
    if (activeStep?.status === 'not-started') return 'queued';
    if (activeStep?.subStage === 'searching-image') return 'searching-image';
    if (activeStep?.subStage === 'drawing-image') return 'drawing-image';
    if (activeStep?.subStage === 'coding' || (activeStep?.thinking && !activeStep?.content && activeStep?.status === 'running')) {
      return 'coding';
    }
    return 'thinking';
  };

  const canReviseInSidebar = Boolean(onRevise && status === 'completed' && contentSlides.length > 0);
  const hasThinkingPanelContent = Boolean(activeStep?.thinking || (status !== 'completed' && !isFinalStep));
  const activeSidebarMode = canReviseInSidebar ? sidebarTab : 'thinking';
  const showThinkingSidebar = isThinkingOpen && (canReviseInSidebar || (!isFinalStep && hasThinkingPanelContent));
  const stageKind = getStageKind();

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && isFocusMode) {
      if (isPreviewMode) {
        event.preventDefault();
        setIsPreviewMode(false);
        return;
      }
      if (event.target?.tagName !== 'INPUT' && event.target?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        setIsFocusMode(false);
        return;
      }
    }
    if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA' || event.target?.isContentEditable) {
      return;
    }
    if (event.key === 'ArrowLeft' && activeStepIndex > 0) {
      event.preventDefault();
      setActiveStepIndex((prev) => Math.max(0, prev - 1));
    } else if (event.key === 'ArrowRight' && activeStepIndex < steps.length - 1) {
      event.preventDefault();
      setActiveStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
    }
  };

  const renderCompactEntryCard = () => {
    const runningStep = steps.find(s => s.status === 'running') || activeStep;
    const updatedCount = data?.revision || 0;
    const isGeneratingDeck = status !== 'completed';
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsFocusMode(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsFocusMode(true);
          }
        }}
        className="group relative flex w-full cursor-pointer flex-col gap-3 rounded-2xl border border-pink-200/80 bg-gradient-to-r from-rose-50/90 via-white to-orange-50/70 p-4 shadow-[0_10px_28px_rgba(244,114,182,0.10)] transition-all hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-[0_14px_34px_rgba(244,114,182,0.16)] sm:flex-row sm:items-center sm:justify-between dark:border-pink-500/25 dark:from-[#211b2a] dark:via-[#171824] dark:to-[#221c1a]"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-pink-200/80 bg-white shadow-sm dark:border-pink-400/30 dark:bg-white/10">
            <SakiStageAvatar
              sources={
                isGeneratingDeck
                  ? ['/assets/saki/ppt/ppt_plan.webp', '/assets/saki/ppt/ppt_plan.png', '/assets/saki/docked/think.png']
                  : ['/assets/saki/ppt/ppt_complete.webp', '/assets/saki/ppt/ppt_complete.png', '/assets/saki/docked/happy.png']
              }
              alt="Saki PPT Studio"
              className="h-full w-full object-cover object-top"
            />
            {isGeneratingDeck && (
              <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-[#ff5b9a] ring-2 ring-white animate-pulse" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{pptTitle}</span>
              {isGeneratingDeck ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pink-100/90 px-2 py-0.5 text-[10px] font-bold text-[#d43678] dark:bg-pink-500/20 dark:text-pink-300">
                  <Loader2 size={10} className="animate-spin" />
                  {tx(`制作中 ${deckProgressPercent}%`, `Creating ${deckProgressPercent}%`, `作成中 ${deckProgressPercent}%`)}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {tx(`${contentSlides.length} 页 · 已完成`, `${contentSlides.length} slides · Done`, `${contentSlides.length}ページ · 完了`)}
                </span>
              )}
              {updatedCount > 0 && (
                <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 ring-1 ring-orange-200/80 dark:bg-orange-500/15 dark:text-orange-300">
                  V{updatedCount + 1}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {isGeneratingDeck
                ? (runningStep?.title ? tx(`当前步骤：${runningStep.title}`, `Current: ${runningStep.title}`) : tx('Saki 正在实时设计幻灯片...', 'Saki is designing slides live...'))
                : tx('点击全屏打开 PPT 工作台 · 可在左侧边栏直接与 AI 对话改版或插图', 'Click to open fullscreen PPT studio · Revise or attach visuals via AI sidebar')}
            </p>
            {isGeneratingDeck && steps.length > 0 && (
              <div className="mt-2 h-1.5 w-44 max-w-full overflow-hidden rounded-full bg-pink-100/90 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#ff75ac] to-orange-500 transition-all duration-300"
                  style={{ width: `${Math.max(8, deckProgressPercent)}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === 'completed' && contentSlides.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadPptx();
              }}
              disabled={downloading || editableDownloading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200/90 bg-white px-3 py-2 text-xs font-bold text-orange-700 shadow-sm transition hover:bg-orange-50 disabled:opacity-60 dark:border-orange-500/30 dark:bg-white/10 dark:text-orange-200"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>{tx('导出 PPTX', 'Export', '出力')}</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff5b9a] to-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition group-hover:brightness-105">
            <Maximize2 size={13} />
            <span>{isGeneratingDeck ? tx('全屏观看制作', 'Open Studio', '全画面表示') : tx('全屏打开工作台', 'Open Fullscreen', '全画面で開く')}</span>
            <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    );
  };

  if (isEmbedded && !isFocusMode) {
    return renderCompactEntryCard();
  }

  if (isPreviewMode && steps.some(step => step.content)) {
    const previewView = (focusMode = false) => (
      <div className={`flex flex-col overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in duration-300 dark:bg-[#141520] ${focusMode ? 'h-full w-full rounded-[1.75rem] border border-white/20' : 'h-[680px] rounded-2xl border border-slate-200/80 dark:border-white/10'}`}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-rose-50/70 via-white to-orange-50/60 px-4 py-2.5 dark:border-white/10 dark:from-[#1c1826] dark:via-[#151722] dark:to-[#1e1918]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff75ac] to-orange-500 text-white shadow-sm">
              <Presentation size={16} />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{pptTitle}</span>
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {tx(`${contentSlides.length} 页全景预览`, `${contentSlides.length} slides`, `全${contentSlides.length}ページ`)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderFocusButton(focusMode)}
            <button
              type="button"
              onClick={downloadEditablePptx}
              disabled={editableDownloading || downloading}
              className={`flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold text-orange-700 shadow-sm transition-all hover:bg-orange-50 active:scale-95 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200 ${(editableDownloading || downloading) ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              {editableDownloading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  {tx('正在生成可编辑版...', 'Generating editable version...', '編集可能版を生成中...')}
                </>
              ) : (
                <>
                  <FileText size={13} />
                  {tx('下载可编辑 PPTX', 'Download editable PPTX', '編集可能な PPTX をダウンロード')}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={downloadPptx}
              disabled={downloading || editableDownloading}
              className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:brightness-105 active:scale-95 ${(downloading || editableDownloading) ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              {downloading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  {tx('正在导出...', 'Exporting...', 'エクスポート中...')}
                </>
              ) : (
                <>
                  <Download size={13} />
                  {tx('下载 PPTX', 'Download PPTX', 'PPTX をダウンロード')}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsPreviewMode(false)}
              className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-white/10"
              title={tx('关闭全屏预览', 'Close preview', 'プレビューを閉じる')}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div
          ref={previewScrollRef}
          className="flex flex-1 flex-col items-center gap-6 overflow-auto bg-slate-100/90 p-6 md:p-8 dark:bg-[#0f1018]"
        >
          {contentSlides.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <div
                className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
                style={{
                  width: `${Math.round(960 * previewListScale)}px`,
                  height: `${Math.round(540 * previewListScale)}px`,
                  flexShrink: 0,
                }}
              >
                <div
                  className="bg-white"
                  style={{
                    width: '960px',
                    height: '540px',
                    transform: `scale(${previewListScale})`,
                    transformOrigin: 'top left',
                  }}
                  dangerouslySetInnerHTML={{ __html: step.content }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                {idx + 1} / {contentSlides.length} · {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <>
        {!isEmbedded && previewView(false)}
        {isFocusMode && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[170] flex bg-slate-950/60 p-0 backdrop-blur-md sm:p-3 md:p-5">
            {previewView(true)}
          </div>,
          document.body
        )}
      </>
    );
  }

  const renderMainView = (focusMode = false) => (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col overflow-hidden border border-slate-200/80 bg-white/95 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.08)] outline-none transition-all duration-300 sm:p-3.5 md:p-4 dark:border-white/10 dark:bg-[#141520]/95 ${
        focusMode
          ? 'h-full w-full rounded-none sm:rounded-[1.75rem]'
          : isEmbedded
            ? 'w-full rounded-2xl'
            : 'mx-auto h-[min(680px,78dvh)] max-w-5xl rounded-2xl'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff75ac] to-orange-500 text-white shadow-sm shadow-pink-500/20">
            <Presentation size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{pptTitle}</h3>
              {status === 'completed' ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
                  {tx(`${contentSlides.length} 页 · 已完成`, `${contentSlides.length} slides · Done`, `${contentSlides.length}ページ · 完了`)}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-bold text-[#ff5b9a] ring-1 ring-pink-200/80 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30">
                  <Loader2 size={10} className="animate-spin" />
                  {tx(`生成中 ${deckProgressPercent}%`, `Generating ${deckProgressPercent}%`, `生成中 ${deckProgressPercent}%`)}
                </span>
              )}
            </div>
            {status !== 'completed' && steps.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ff75ac] to-orange-500 transition-all duration-300"
                    style={{ width: `${Math.max(8, deckProgressPercent)}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {completedStepsCount}/{steps.length}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(canReviseInSidebar || (!isFinalStep && hasThinkingPanelContent)) && (
            <button
              type="button"
              onClick={() => setIsThinkingOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold shadow-sm transition-all active:scale-95 ${
                isThinkingOpen
                  ? 'border-pink-200 bg-pink-50/80 text-[#d44b83] dark:border-pink-500/30 dark:bg-pink-500/15 dark:text-pink-300'
                  : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-200'
              }`}
              title={isThinkingOpen ? tx('隐藏侧边栏，放大幻灯片', 'Hide sidebar', 'サイドバーを隠す') : tx('显示思考与 AI 改版侧边栏', 'Show thinking & AI revise sidebar', 'サイドバーを表示')}
            >
              {isThinkingOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
              <span className="hidden sm:inline">{isThinkingOpen ? tx('收起侧栏', 'Hide Sidebar', '閉じる') : tx('AI 改版 / 思考', 'Revise & Notes', 'AI修正・思考')}</span>
            </button>
          )}

          {status === 'completed' && contentSlides.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setIsPreviewMode(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
              >
                <Monitor size={13} />
                <span className="hidden md:inline">{tx('全屏预览', 'Full screen preview', '全画面プレビュー')}</span>
              </button>
              <button
                type="button"
                onClick={downloadEditablePptx}
                disabled={editableDownloading || downloading}
                className={`flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-bold text-orange-700 shadow-sm transition-all hover:bg-orange-50 active:scale-95 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200 ${(editableDownloading || downloading) ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                {editableDownloading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                <span>{editableDownloading ? tx('生成可编辑版...', 'Generating...', '生成中...') : tx('可编辑 PPTX', 'Editable PPTX', '編集可能 PPTX')}</span>
              </button>
              <button
                type="button"
                onClick={downloadPptx}
                disabled={downloading || editableDownloading}
                className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:brightness-105 active:scale-95 ${(downloading || editableDownloading) ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>{downloading ? tx('导出中...', 'Exporting...', '出力中...') : tx('下载 PPTX', 'Download PPTX', 'PPTX 保存')}</span>
              </button>
            </>
          )}

          {renderFocusButton(focusMode)}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-hide mb-3 flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 pb-2.5 dark:border-white/10">
          {steps.map((step, idx) => {
            const isActive = activeStepIndex === idx;
            const isRunningStep = step.status === 'running';
            const isDoneStep = step.status === 'completed' || step.status === 'success';
            const isErrorStep = step.status === 'error';
            return (
              <button
                key={idx}
                ref={(el) => { stepButtonRefs.current[idx] = el; }}
                type="button"
                disabled={revising}
                onClick={() => setActiveStepIndex(idx)}
                title={step.title}
                className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-50 to-orange-50/80 text-[#c93672] ring-1 ring-pink-300/80 shadow-sm dark:from-pink-500/20 dark:to-orange-500/15 dark:text-pink-200 dark:ring-pink-400/40'
                    : 'bg-slate-50/70 text-slate-600 hover:bg-slate-100/90 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                <span className="flex shrink-0 items-center justify-center">
                  {isDoneStep ? (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  ) : isRunningStep ? (
                    <Loader2 size={14} className="animate-spin text-[#ff5b9a]" />
                  ) : isErrorStep ? (
                    <AlertCircle size={14} className="text-rose-500" />
                  ) : (
                    <Circle size={14} className="text-slate-300 dark:text-slate-600" />
                  )}
                </span>
                <div className="flex max-w-[140px] flex-col">
                  <span className={`text-[9px] font-extrabold uppercase tracking-wider leading-none ${isActive ? 'text-[#ff5b9a]' : 'text-slate-400'}`}>
                    P{idx + 1}
                  </span>
                  <span className="mt-0.5 truncate text-[11px] font-bold leading-tight">
                    {step.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`flex min-h-[420px] flex-1 flex-col gap-3.5 overflow-hidden lg:flex-row ${focusMode ? 'h-full' : 'h-[520px]'}`}>
          {showThinkingSidebar && (
            <div className="flex max-h-[260px] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-pink-100/80 bg-gradient-to-b from-rose-50/50 via-white to-slate-50/60 shadow-sm lg:max-h-none lg:w-[320px] xl:w-[345px] dark:border-white/10 dark:from-[#1d1928] dark:via-[#171925] dark:to-[#151722]">
              <div className="flex shrink-0 flex-col gap-2 border-b border-pink-100/70 bg-white/85 px-3.5 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-pink-200/70 bg-pink-50/70 dark:border-pink-400/30 dark:bg-pink-500/15">
                    <SakiStageAvatar
                      sources={
                        (activeStep?.status === 'running' || revising)
                          ? ['/assets/saki/ppt/ppt_plan.webp', '/assets/saki/ppt/ppt_plan.png', '/assets/saki/docked/think.png']
                          : ['/assets/saki/ppt/ppt_complete.png', '/assets/saki/docked/happy.png']
                      }
                      alt="Saki Studio"
                      className="h-full w-full object-cover object-top"
                    />
                    {(activeStep?.status === 'running' || revising) && (
                      <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-[#ff5b9a] ring-2 ring-white animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                      {activeSidebarMode === 'revise' ? (
                        <Wand2 size={12} className="text-[#ff5b9a]" />
                      ) : (
                        <Layout size={12} className="text-[#ff5b9a]" />
                      )}
                      <span>
                        {activeSidebarMode === 'revise'
                          ? tx('AI 改版助手', 'AI Revision Agent', 'AI 修正アシスタント')
                          : t('design_thinking')}
                      </span>
                    </div>
                    <p className="truncate text-[10px] font-semibold text-slate-400">
                      {revising
                        ? tx('Agent 正在调整幻灯片与配图...', 'Agent is revising slides & visuals...', '編集中...')
                        : activeStep?.status === 'running'
                          ? tx('Saki 正在实时推敲版式...', 'Saki is thinking live...', 'リアルタイムで構想中...')
                          : tx(`当前 P${activeStepIndex + 1} · ${activeStep?.title || ''}`, `Slide ${activeStepIndex + 1} · ${activeStep?.title || ''}`)}
                    </p>
                  </div>
                </div>

                {canReviseInSidebar && (
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-pink-100/80 bg-slate-100/80 p-0.5 dark:border-white/10 dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setSidebarTab('revise')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                        activeSidebarMode === 'revise'
                          ? 'bg-white text-[#d43678] shadow-sm dark:bg-[#ff5b9a]/25 dark:text-pink-200'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Wand2 size={11} />
                      <span>{tx('AI 改版', 'AI Revise', 'AI 修正')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarTab('thinking')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                        activeSidebarMode === 'thinking'
                          ? 'bg-white text-[#d43678] shadow-sm dark:bg-[#ff5b9a]/25 dark:text-pink-200'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Layout size={11} />
                      <span>{t('design_thinking')}</span>
                    </button>
                  </div>
                )}
              </div>

              {activeSidebarMode === 'revise' && canReviseInSidebar ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2 border-b border-pink-100/60 bg-rose-50/30 px-3.5 py-1.5 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                      {tx('默认修改当前页，也可指定页码/整套', 'Targets current slide or mentioned pages', '現在のページまたは指定ページを修正')}
                    </span>
                    <button
                      type="button"
                      onClick={() => reviseSlide(true)}
                      disabled={revising || editingDisabled || !activeStep?.revisions?.length}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-pink-200/80 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 transition hover:bg-pink-50 disabled:opacity-40 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
                    >
                      <Undo2 size={10} />
                      <span>{tx('恢复上一版', 'Undo', '元に戻す')}</span>
                    </button>
                  </div>

                  <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                    {revisionHistoryLog.length === 0 ? (
                      <div className="rounded-xl border border-pink-100/90 bg-white/80 p-3 text-xs leading-relaxed text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        <div className="mb-1 flex items-center gap-1.5 font-bold text-[#d43678] dark:text-pink-300">
                          <Sparkles size={12} />
                          <span>{tx('直接告诉 Saki 想怎么改', 'Tell Saki what to refine')}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx(
                            '只需在下方对话框输入要求，也可点击左下角插入图片或参考文件。Saki 会自主判断改版范围，并自动决定插入你的素材、联网搜图或 AI 绘图。',
                            'Describe changes or attach images/docs below. Agent decides layout and visuals automatically.'
                          )}
                        </p>
                      </div>
                    ) : (
                      revisionHistoryLog.map((entry) => (
                        <div key={entry.id} className="space-y-1.5">
                          <div className="ml-4 rounded-xl bg-gradient-to-r from-[#ff5b9a] to-orange-500 px-3 py-2 text-xs text-white shadow-sm">
                            <p className="whitespace-pre-wrap break-words font-medium">{entry.userText}</p>
                            {entry.attachments?.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {entry.attachments.map((att, attIdx) => (
                                  <span key={attIdx} className="inline-flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                                    {att.isImage ? <ImageIcon size={10} /> : <FileText size={10} />}
                                    {att.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="mr-3 rounded-xl border border-pink-100 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.summary}</ReactMarkdown>
                          </div>
                        </div>
                      ))
                    )}

                    {revising && (
                      <div className="mr-3 flex items-center gap-2 rounded-xl border border-pink-200/80 bg-pink-50/70 px-3 py-2 text-xs font-semibold text-[#d43678] dark:border-pink-500/30 dark:bg-pink-500/15 dark:text-pink-200">
                        <Loader2 size={13} className="animate-spin shrink-0" />
                        <span>{tx('Agent 正在执行改版与配图...', 'Agent is working on your revision...')}</span>
                      </div>
                    )}

                    {revisionError && (
                      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
                        {revisionError}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 border-t border-pink-100/80 bg-white/90 p-3 dark:border-white/10 dark:bg-[#141622]">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.xlsx"
                      className="hidden"
                      onChange={(e) => handleAttachFiles(e.target.files)}
                    />
                    {attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {attachments.map((att) => (
                          <div
                            key={att.id}
                            className="group relative inline-flex max-w-[140px] items-center gap-1.5 rounded-lg border border-pink-200/80 bg-rose-50/60 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
                          >
                            {att.isImage && att.previewUrl ? (
                              <img src={att.previewUrl} alt={att.name} className="h-5 w-5 rounded object-cover shrink-0" />
                            ) : (
                              <FileText size={12} className="shrink-0 text-pink-500" />
                            )}
                            <span className="truncate">{att.name}</span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(att.id)}
                              className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/20"
                              aria-label={tx('移除附件', 'Remove attachment')}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-pink-200/90 bg-white p-2 shadow-sm focus-within:border-[#ff5b9a] focus-within:ring-2 focus-within:ring-pink-200/50 dark:border-white/15 dark:bg-[#1a1c28]">
                      <textarea
                        value={revisionInstruction}
                        onChange={(e) => setRevisionInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
                            e.preventDefault();
                            reviseSlide(false);
                          }
                        }}
                        maxLength={4000}
                        rows={2}
                        disabled={revising || editingDisabled}
                        placeholder={tx('例如：给这页配张合适图片 / 结合上传文档提炼重点...', 'Ask Saki to revise, illustrate, or use attached files...')}
                        className="w-full resize-none bg-transparent text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                      />
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={revising || editingDisabled || uploadingAttachment}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-[#d43678] disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                          title={tx('插入图片或参考文件让 Agent 查看', 'Attach images or files for the Agent')}
                        >
                          {uploadingAttachment ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                          <span>{uploadingAttachment ? tx('上传中...', 'Uploading...') : tx('图片 / 文件', 'Image / File')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => reviseSlide(false)}
                          disabled={revising || editingDisabled || uploadingAttachment || (!revisionInstruction.trim() && attachments.length === 0)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff5b9a] to-orange-500 text-white shadow-sm transition hover:brightness-105 disabled:opacity-40"
                          aria-label={tx('发送修改指令', 'Send revision instruction')}
                        >
                          {revising ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Thinking Content */
                <div className="flex-1 overflow-y-auto p-3.5">
                  {activeStep?.designHint && (
                    <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5 text-[11px] leading-relaxed text-indigo-800 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200">
                      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                        <Sparkles size={10} />
                        <span>{tx('版式建议', 'Layout Hint', 'レイアウト案')}</span>
                      </div>
                      {activeStep.designHint}
                    </div>
                  )}

                  {activeStep?.thinking ? (
                    <div className="prose prose-sm max-w-none text-xs leading-relaxed text-slate-700 dark:prose-invert dark:text-slate-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {sanitizeThinkingText(activeStep.thinking || '')}
                      </ReactMarkdown>
                      {activeStep?.status === 'running' && !activeStep?.content && (
                        <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-[#ff5b9a] align-middle" />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 py-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#ff5b9a]">
                        <Loader2 size={13} className="animate-spin" />
                        <span>{tx('Saki 正在组织设计思路...', 'Saki is drafting design thoughts...', '設計アイデアを整理中...')}</span>
                      </div>
                      <div className="h-3 w-11/12 rounded saki-ppt-shimmer" />
                      <div className="h-3 w-4/5 rounded saki-ppt-shimmer" />
                      <div className="h-3 w-3/4 rounded saki-ppt-shimmer" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-inner dark:border-white/10 dark:bg-[#10121c]">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex shrink-0 gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/90" />
                </div>
                <span className="truncate whitespace-nowrap text-[11px] font-bold text-slate-500 dark:text-slate-300">
                  {t('slide_preview', { page: activeStepIndex + 1 })}
                </span>
                {activeStep?.imageStatus === 'completed' && (
                  <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-bold text-pink-600 ring-1 ring-pink-200/80 sm:inline-flex dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30">
                    <ImageIcon size={10} />
                    {activeStep?.imageMode === 'draw'
                      ? tx('AI 绘图已插入', 'AI Art Inserted', 'AI画像挿入済み')
                      : tx('搜索配图已插入', 'Web Image Inserted', '検索画像挿入済み')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {activeStep?.content && (
                  <div className="mr-1 hidden items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white px-1 py-0.5 sm:flex dark:border-white/10 dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setZoomFactor((prev) => clamp(Number((prev - 0.12).toFixed(2)), 0.5, 1.5))}
                      className="rounded p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10"
                      title={tx('缩小', 'Zoom out', '縮小')}
                    >
                      <ZoomOut size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomFactor(1)}
                      className="px-1.5 text-[10px] font-bold text-slate-600 hover:text-[#ff5b9a] dark:text-slate-200"
                      title={tx('自适应画布大小', 'Fit to stage', '画面に合わせる')}
                    >
                      {Math.round(effectiveScale * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomFactor((prev) => clamp(Number((prev + 0.12).toFixed(2)), 0.5, 1.5))}
                      className="rounded p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10"
                      title={tx('放大', 'Zoom in', '拡大')}
                    >
                      <ZoomIn size={12} />
                    </button>
                    {zoomFactor !== 1 && (
                      <button
                        type="button"
                        onClick={() => setZoomFactor(1)}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                        title={tx('重置缩放', 'Reset zoom', 'リセット')}
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={activeStepIndex <= 0}
                    onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                    className="rounded-lg border border-slate-200/80 bg-white p-1 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                    title={tx('上一页', 'Previous slide', '前のページ')}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={activeStepIndex >= steps.length - 1}
                    onClick={() => setActiveStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                    className="rounded-lg border border-slate-200/80 bg-white p-1 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                    title={tx('下一页', 'Next slide', '次のページ')}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div
              ref={previewContainerRef}
              className="relative flex flex-1 items-center justify-center overflow-auto bg-gradient-to-br from-slate-100/90 via-slate-100/70 to-rose-50/40 p-2 md:p-4 dark:from-[#0d0f17] dark:via-[#11131e] dark:to-[#18121f]"
            >
              {activeStep?.content ? (
                <div
                  className="relative shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] ring-1 ring-black/5 transition-[width,height] duration-200 ease-out"
                  style={{
                    width: `${Math.round(960 * effectiveScale)}px`,
                    height: `${Math.round(540 * effectiveScale)}px`,
                  }}
                >
                  <div
                    className="bg-white"
                    style={{
                      width: '960px',
                      height: '540px',
                      transform: `scale(${effectiveScale})`,
                      transformOrigin: 'top left',
                    }}
                    dangerouslySetInnerHTML={{ __html: activeStep.content }}
                  />
                  {(activeStep?.subStage === 'searching-image' || activeStep?.subStage === 'drawing-image') && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[2px] dark:bg-slate-950/45">
                      <div className="flex items-center gap-2.5 rounded-2xl border border-pink-200/80 bg-white/95 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-lg dark:border-pink-400/30 dark:bg-[#1c1e2e]/95 dark:text-slate-100">
                        <Loader2 size={14} className="animate-spin text-[#ff5b9a]" />
                        <span>
                          {activeStep?.subStage === 'drawing-image'
                            ? tx('🎨 Saki 正在调用绘图工具生成配图...', '🎨 Saki is drawing a custom visual...', '🎨 AIイラスト生成中...')
                            : tx('🔍 Saki 正在智能检索并嵌入高清配图...', '🔍 Saki is searching & embedding a photo...', '🔍 高解像度画像を検索中...')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full w-full overflow-hidden rounded-xl border border-white/70 shadow-sm dark:border-white/10">
                  <SakiStudioStage
                    stageKind={stageKind}
                    step={activeStep}
                    stepIndex={activeStepIndex}
                    totalContentSlides={contentSlides.length}
                    elapsedSeconds={elapsedSeconds}
                    tx={tx}
                    onBrowseFirst={() => {
                      const firstIdx = steps.findIndex((s) => Boolean(s.content));
                      setActiveStepIndex(firstIdx >= 0 ? firstIdx : 0);
                    }}
                    onOpenPreview={() => setIsPreviewMode(true)}
                    onDownloadEditable={downloadEditablePptx}
                    onDownloadSnapshot={downloadPptx}
                    downloading={downloading}
                    editableDownloading={editableDownloading}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {!isEmbedded && renderMainView(false)}
      {isFocusMode && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[170] flex bg-slate-950/60 p-0 backdrop-blur-md sm:p-3 md:p-5">
          {renderMainView(true)}
        </div>,
        document.body
      )}
    </>
  );
}

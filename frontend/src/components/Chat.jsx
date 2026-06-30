import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { diffLines } from 'diff';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Send, Plus, Paperclip, ChevronDown, ChevronUp, Bot, User, Terminal, Square, Search, Globe, Server, Palette, Download, Activity, Share2, Copy, Volume2, RotateCcw, Check, X, FileDiff, Undo2, HardDrive, Brain, Presentation, Mic, MicOff, FileText, Shield, Music2, Play, Pause, Trash2, PencilLine, Sparkles, ListChecks } from 'lucide-react';
import CredibilityCheckView from './CredibilityCheckView';
import DeepReadingView from './DeepReadingView';
import PPTView from './PPTView';
import StoryGlassView from './StoryGlassView';
import StoryGlassOverlay from './StoryGlassOverlay';
import Mermaid from './Mermaid';
import DiffModal from './DiffModal';
import AiCustomizationModal from './AiCustomizationModal';
import botAvatar from '../head.png';

const FEATURE_TOOLTIP_THEMES = {
  webSearch: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(37,99,235,0.3)]',
    glow: 'from-sky-400/14 via-transparent to-blue-400/10',
    arrow: 'bg-slate-950/94',
  },
  deepResearch: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(5,150,105,0.35)]',
    glow: 'from-emerald-400/10 via-transparent to-cyan-400/10',
    arrow: 'bg-slate-950/94',
  },
  memory: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(168,85,247,0.35)]',
    glow: 'from-fuchsia-400/10 via-transparent to-violet-400/10',
    arrow: 'bg-slate-950/94',
  },
  ppt: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(249,115,22,0.35)]',
    glow: 'from-orange-400/12 via-transparent to-amber-300/10',
    arrow: 'bg-slate-950/94',
  },
  credibility: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(20,184,166,0.35)]',
    glow: 'from-teal-400/12 via-transparent to-cyan-300/10',
    arrow: 'bg-slate-950/94',
  },
  storyGlass: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(244,114,182,0.3)]',
    glow: 'from-rose-300/14 via-amber-200/10 to-sky-300/10',
    arrow: 'bg-slate-950/94',
  },
  permission: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(16,185,129,0.28)]',
    glow: 'from-emerald-300/12 via-transparent to-rose-300/10',
    arrow: 'bg-slate-950/94',
  },
  default: {
    container: 'bg-slate-950/94 shadow-[0_28px_80px_rgba(15,23,42,0.4)]',
    glow: 'from-white/5 via-transparent to-white/0',
    arrow: 'bg-slate-950/94',
  },
};

function WebSearchTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-search-bg`;
  const glowId = `${uid}-search-glow`;
  const globeId = `${uid}-search-globe`;
  const beamId = `${uid}-search-beam`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="10" x2="198" y2="122" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f3a74" />
          <stop offset="0.55" stopColor="#0f172a" />
          <stop offset="1" stopColor="#0c4a6e" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(176 20) rotate(120) scale(78 66)">
          <stop stopColor="#38bdf8" stopOpacity="0.82" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={globeId} x1="92" y1="42" x2="136" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={beamId} x1="0" y1="0" x2="28" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="176" cy="20" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.3;0.82;0.3" dur="5s" repeatCount="indefinite" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="16 18;16 14;16 18" dur="4.1s" repeatCount="indefinite" />
        <rect width="54" height="24" rx="12" fill="#ffffff" fillOpacity="0.08" stroke="#7dd3fc" strokeOpacity="0.28" />
        <circle cx="14" cy="12" r="5" stroke="#e0f2fe" strokeWidth="2.2" />
        <path d="M18 16L23 21" stroke="#e0f2fe" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30 9H44" stroke="#e0f2fe" strokeWidth="3" strokeLinecap="round" />
        <path d="M30 15H40" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.65" />
      </g>

      <g>
        <animateTransform attributeName="transform" type="translate" values="18 84;18 88;18 84" dur="4.8s" repeatCount="indefinite" />
        <rect width="48" height="24" rx="8" fill="#ffffff" fillOpacity="0.07" stroke="#67e8f9" strokeOpacity="0.28" />
        <rect x="8" y="7" width="15" height="10" rx="3" fill="#0ea5e9" fillOpacity="0.8" />
        <path d="M28 9H39" stroke="#e0f2fe" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 15H34" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7" />
      </g>

      <path d="M68 28C84 34 95 42 102 52" stroke="#7dd3fc" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="2.6s" repeatCount="indefinite" />
      </path>
      <path d="M66 96C86 92 97 82 104 70" stroke="#67e8f9" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="2.9s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill="#e0f2fe">
        <animateMotion dur="2.6s" repeatCount="indefinite" path="M68 28C84 34 95 42 102 52" />
      </circle>
      <circle r="2.3" fill="#bae6fd">
        <animateMotion dur="2.9s" repeatCount="indefinite" path="M66 96C86 92 97 82 104 70" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="112 64;115 62;112 64;109 66;112 64" dur="4.6s" repeatCount="indefinite" />
        <circle r="20" fill="#082f49" fillOpacity="0.8" stroke="#7dd3fc" strokeOpacity="0.35" strokeWidth="1.4" />
        <circle r="15" fill={`url(#${globeId})`} />
        <path d="M-12 0H12" stroke="#082f49" strokeOpacity="0.4" strokeWidth="1.5" />
        <path d="M0 -12C4 -8 4 8 0 12C-4 8 -4 -8 0 -12Z" stroke="#082f49" strokeOpacity="0.35" strokeWidth="1.5" />
        <ellipse cx="0" cy="0" rx="8" ry="15" stroke="#082f49" strokeOpacity="0.35" strokeWidth="1.3" />
        <path d="M-15 -4C-8 -6 8 -6 15 -4" stroke="#082f49" strokeOpacity="0.3" strokeWidth="1.2" />
        <path d="M-15 4C-8 6 8 6 15 4" stroke="#082f49" strokeOpacity="0.3" strokeWidth="1.2" />
        <circle r="24" stroke="#38bdf8" strokeOpacity="0.18" strokeDasharray="3 7">
          <animate attributeName="stroke-dashoffset" values="0;-40" dur="3.2s" repeatCount="indefinite" />
        </circle>
      </g>

      <g>
        <circle cx="112" cy="64" r="30" stroke="#e0f2fe" strokeOpacity="0.18" strokeDasharray="2 8" />
        <circle r="2.4" fill="#e0f2fe">
          <animateMotion dur="3.2s" repeatCount="indefinite" path="M82 64A30 30 0 1 0 142 64A30 30 0 1 0 82 64" />
        </circle>
      </g>

      <path d="M132 58C145 48 154 42 164 40" stroke="#7dd3fc" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M132 68C146 72 154 76 166 82" stroke="#67e8f9" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="2.2s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill="#e0f2fe">
        <animateMotion dur="2s" repeatCount="indefinite" path="M132 58C145 48 154 42 164 40" />
      </circle>
      <circle r="2.4" fill="#bae6fd">
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M132 68C146 72 154 76 166 82" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="156 24;156 21;156 24" dur="4.3s" repeatCount="indefinite" />
          <rect width="44" height="24" rx="8" fill="#ffffff" fillOpacity="0.92" />
          <rect x="8" y="7" width="16" height="10" rx="3" fill="#0ea5e9" />
          <path d="M28 9H36" stroke="#0c4a6e" strokeWidth="3" strokeLinecap="round" />
          <path d="M28 15H34" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.65" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="164 74;164 77;164 74" dur="4.7s" repeatCount="indefinite" />
          <rect width="36" height="24" rx="8" fill="#ffffff" fillOpacity="0.84" />
          <rect x="8" y="8" width="11" height="8" rx="2.5" fill="#38bdf8" />
          <path d="M23 10H30" stroke="#0c4a6e" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M23 15H28" stroke="#67e8f9" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.68" />
        </g>
      </g>

      <rect x="132" y="18" width="24" height="92" fill={`url(#${beamId})`} opacity="0.8">
        <animate attributeName="x" values="132;202;132" dur="4.4s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

function DeepResearchTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-deep-bg`;
  const glowId = `${uid}-deep-glow`;
  const gridId = `${uid}-deep-grid`;
  const lensId = `${uid}-deep-lens`;
  const scanId = `${uid}-deep-scan`;
  const lensClipId = `${uid}-deep-lens-clip`;
  const reportId = `${uid}-deep-report`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="20" y1="12" x2="194" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#032c22" />
          <stop offset="0.55" stopColor="#0f172a" />
          <stop offset="1" stopColor="#052e16" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(178 18) rotate(125) scale(78 68)">
          <stop stopColor="#34d399" stopOpacity="0.8" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gridId} x1="76" y1="18" x2="160" y2="102" gradientUnits="userSpaceOnUse">
          <stop stopColor="#99f6e4" stopOpacity="0.45" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={lensId} x1="104" y1="42" x2="136" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dcfce7" />
          <stop offset="1" stopColor="#5eead4" />
        </linearGradient>
        <linearGradient id={scanId} x1="0" y1="-18" x2="0" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" stopOpacity="0" />
          <stop offset="0.5" stopColor="#a7f3d0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={reportId} x1="160" y1="56" x2="188" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <clipPath id={lensClipId}>
          <circle cx="0" cy="0" r="16" />
        </clipPath>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="178" cy="18" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.35;0.85;0.35" dur="5.5s" repeatCount="indefinite" />
      </circle>

      <g opacity="0.45">
        <circle cx="116" cy="62" r="46" stroke={`url(#${gridId})`} strokeWidth="0.8" />
        <circle cx="116" cy="62" r="32" stroke={`url(#${gridId})`} strokeWidth="0.8" />
        <path d="M70 62H162" stroke={`url(#${gridId})`} strokeWidth="0.8" />
        <path d="M116 16V108" stroke={`url(#${gridId})`} strokeWidth="0.8" />
      </g>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="16 18;16 14;16 18" dur="4.2s" repeatCount="indefinite" />
          <rect width="48" height="28" rx="8" fill="#f8fafc" fillOpacity="0.08" stroke="#86efac" strokeOpacity="0.4" />
          <rect x="9" y="8" width="22" height="4" rx="2" fill="#d1fae5" fillOpacity="0.9" />
          <rect x="9" y="16" width="18" height="3" rx="1.5" fill="#a7f3d0" fillOpacity="0.55" />
          <circle cx="36" cy="14" r="4" fill="#34d399" fillOpacity="0.85" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="18 78;18 82;18 78" dur="4.6s" repeatCount="indefinite" />
          <rect width="44" height="24" rx="8" fill="#f8fafc" fillOpacity="0.07" stroke="#6ee7b7" strokeOpacity="0.35" />
          <rect x="9" y="7" width="15" height="10" rx="3" fill="#14b8a6" fillOpacity="0.75" />
          <rect x="28" y="8" width="7" height="2.8" rx="1.4" fill="#ccfbf1" fillOpacity="0.9" />
          <rect x="28" y="13" width="10" height="2.8" rx="1.4" fill="#99f6e4" fillOpacity="0.55" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="142 18;142 20;142 18" dur="3.8s" repeatCount="indefinite" />
          <rect width="34" height="22" rx="7" fill="#f8fafc" fillOpacity="0.08" stroke="#a7f3d0" strokeOpacity="0.35" />
          <circle cx="11" cy="11" r="4" fill="#facc15" fillOpacity="0.85" />
          <path d="M20 8H27" stroke="#ecfccb" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M20 14H24" stroke="#99f6e4" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>

      <path d="M64 32C82 34 94 42 102 54" stroke="#6ee7b7" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-36" dur="3.2s" repeatCount="indefinite" />
      </path>
      <path d="M62 90C82 88 94 79 102 69" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-32" dur="2.8s" repeatCount="indefinite" />
      </path>
      <path d="M142 40C134 44 130 48 126 52" stroke="#a7f3d0" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-24" dur="2.4s" repeatCount="indefinite" />
      </path>

      <circle r="2.4" fill="#bbf7d0">
        <animateMotion dur="3.2s" repeatCount="indefinite" path="M64 32C82 34 94 42 102 54" />
      </circle>
      <circle r="2.2" fill="#99f6e4">
        <animateMotion dur="2.8s" repeatCount="indefinite" path="M62 90C82 88 94 79 102 69" />
      </circle>
      <circle r="2" fill="#d9f99d">
        <animateMotion dur="2.4s" repeatCount="indefinite" path="M142 40C134 44 130 48 126 52" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="116 62;119 60;116 62;113 64;116 62" dur="4.8s" repeatCount="indefinite" />
        <circle r="21" fill="#052e16" fillOpacity="0.85" stroke="#34d399" strokeOpacity="0.35" strokeWidth="1.4" />
        <circle r="16" fill={`url(#${lensId})`} />
        <g clipPath={`url(#${lensClipId})`}>
          <rect x="-18" y="-22" width="36" height="16" fill={`url(#${scanId})`} fillOpacity="0.95">
            <animate attributeName="y" values="-24;8;18;-24" dur="3.8s" repeatCount="indefinite" />
          </rect>
        </g>
        <path d="M-10 -8C-2 -12 8 -10 12 -3C15 4 12 11 4 14C-4 17 -12 12 -14 4C-15 0 -14 -5 -10 -8Z" stroke="#ecfeff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d="M13 13L29 29" stroke="#ecfeff" strokeWidth="4.6" strokeLinecap="round" />
      </g>

      <path d="M132 68C143 70 147 72 150 78" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.8s" repeatCount="indefinite" />
      </path>
      <circle r="2.6" fill="#d1fae5">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M132 68C143 70 147 72 150 78" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="150 48;150 46;150 48" dur="4.2s" repeatCount="indefinite" />
        <rect width="50" height="64" rx="14" fill="#f8fafc" fillOpacity="0.96" />
        <rect x="10" y="10" width="16" height="16" rx="5" fill={`url(#${reportId})`}>
          <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
        </rect>
        <path d="M32 14H41" stroke="#0f766e" strokeWidth="3" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 12;12 0;12 0" dur="3.2s" repeatCount="indefinite" />
        </path>
        <path d="M32 21H38" stroke="#34d399" strokeWidth="2.8" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 9;9 0;9 0" dur="3.2s" repeatCount="indefinite" />
        </path>
        <path d="M10 36H40" stroke="#0f172a" strokeOpacity="0.18" strokeWidth="4" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 34;34 0;34 0" dur="2.6s" repeatCount="indefinite" />
        </path>
        <path d="M10 45H34" stroke="#0f172a" strokeOpacity="0.14" strokeWidth="4" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 28;28 0;28 0" dur="2.9s" repeatCount="indefinite" />
        </path>
        <rect x="10" y="50" width="8" height="10" rx="3" fill="#10b981">
          <animate attributeName="height" values="10;18;10" dur="3.6s" repeatCount="indefinite" />
          <animate attributeName="y" values="50;42;50" dur="3.6s" repeatCount="indefinite" />
        </rect>
        <rect x="21" y="46" width="8" height="14" rx="3" fill="#14b8a6">
          <animate attributeName="height" values="14;10;14" dur="3.6s" repeatCount="indefinite" />
          <animate attributeName="y" values="46;50;46" dur="3.6s" repeatCount="indefinite" />
        </rect>
        <rect x="32" y="40" width="8" height="20" rx="3" fill="#0f766e">
          <animate attributeName="height" values="20;12;20" dur="3.6s" repeatCount="indefinite" />
          <animate attributeName="y" values="40;48;40" dur="3.6s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  );
}

function MemoryTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-memory-bg`;
  const glowId = `${uid}-memory-glow`;
  const coreId = `${uid}-memory-core`;
  const nodeId = `${uid}-memory-node`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="8" x2="196" y2="122" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b0764" />
          <stop offset="0.58" stopColor="#111827" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(168 22) rotate(122) scale(80 68)">
          <stop stopColor="#c084fc" stopOpacity="0.82" />
          <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={coreId} x1="94" y1="44" x2="132" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5d0fe" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={nodeId} x1="154" y1="24" x2="198" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5d0fe" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="168" cy="22" r="62" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.3;0.78;0.3" dur="5.2s" repeatCount="indefinite" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="16 18;16 14;16 18" dur="4s" repeatCount="indefinite" />
          <path d="M0 6C0 2.686 2.686 0 6 0H36C39.314 0 42 2.686 42 6V18C42 21.314 39.314 24 36 24H18L10 30V24H6C2.686 24 0 21.314 0 18V6Z" fill="#ffffff" fillOpacity="0.08" stroke="#e9d5ff" strokeOpacity="0.35" />
          <circle cx="12" cy="12" r="2.5" fill="#e9d5ff" />
          <circle cx="21" cy="12" r="2.5" fill="#d8b4fe" />
          <circle cx="30" cy="12" r="2.5" fill="#c084fc" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="16 54;16 58;16 54" dur="4.8s" repeatCount="indefinite" />
          <path d="M0 6C0 2.686 2.686 0 6 0H42C45.314 0 48 2.686 48 6V18C48 21.314 45.314 24 42 24H24L14 30V24H6C2.686 24 0 21.314 0 18V6Z" fill="#ffffff" fillOpacity="0.07" stroke="#f0abfc" strokeOpacity="0.32" />
          <rect x="9" y="8" width="28" height="3.5" rx="1.75" fill="#f5d0fe" fillOpacity="0.9" />
          <rect x="9" y="15" width="19" height="3.5" rx="1.75" fill="#d8b4fe" fillOpacity="0.6" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="20 96;20 94;20 96" dur="3.7s" repeatCount="indefinite" />
          <rect width="34" height="20" rx="7" fill="#ffffff" fillOpacity="0.08" stroke="#f5d0fe" strokeOpacity="0.28" />
          <rect x="8" y="6" width="18" height="3" rx="1.5" fill="#f5d0fe" fillOpacity="0.9" />
          <rect x="8" y="11" width="12" height="3" rx="1.5" fill="#d8b4fe" fillOpacity="0.55" />
        </g>
      </g>

      <path d="M58 32C78 34 90 42 98 54" stroke="#d8b4fe" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-28" dur="2.8s" repeatCount="indefinite" />
      </path>
      <path d="M64 66C82 66 91 66 98 66" stroke="#c084fc" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-24" dur="2.2s" repeatCount="indefinite" />
      </path>
      <path d="M54 104C76 98 89 86 98 76" stroke="#f0abfc" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-30" dur="3s" repeatCount="indefinite" />
      </path>

      <circle r="2.4" fill="#f5d0fe">
        <animateMotion dur="2.8s" repeatCount="indefinite" path="M58 32C78 34 90 42 98 54" />
      </circle>
      <circle r="2.2" fill="#e9d5ff">
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M64 66C82 66 91 66 98 66" />
      </circle>
      <circle r="2.3" fill="#d8b4fe">
        <animateMotion dur="3s" repeatCount="indefinite" path="M54 104C76 98 89 86 98 76" />
      </circle>

      <g>
        <rect x="86" y="44" width="48" height="44" rx="16" fill="#2e1065" fillOpacity="0.75" stroke="#e9d5ff" strokeOpacity="0.36" strokeWidth="1.5" />
        {[50, 58, 66, 74, 82].map((y) => (
          <path key={`left-pin-${y}`} d={`M82 ${y}H86`} stroke="#c084fc" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        ))}
        {[50, 58, 66, 74, 82].map((y) => (
          <path key={`right-pin-${y}`} d={`M134 ${y}H138`} stroke="#c084fc" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        ))}
        <path
          d="M101 56C101 49 109 46 113 50C116 45 125 47 125 54C131 55 133 63 128 67C130 73 125 79 118 77C115 81 109 81 106 76C99 77 95 71 97 65C93 61 95 54 101 56Z"
          fill={`url(#${coreId})`}
        >
          <animate attributeName="opacity" values="0.85;1;0.85" dur="3.2s" repeatCount="indefinite" />
        </path>
        <path d="M104 61L110 66L116 58L122 69" stroke="#4c1d95" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        <circle cx="104" cy="61" r="2.8" fill="#faf5ff">
          <animate attributeName="r" values="2.2;3.2;2.2" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="110" cy="66" r="2.8" fill="#faf5ff">
          <animate attributeName="r" values="3.2;2.2;3.2" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="116" cy="58" r="2.8" fill="#faf5ff">
          <animate attributeName="r" values="2.2;3.2;2.2" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="122" cy="69" r="2.8" fill="#faf5ff">
          <animate attributeName="r" values="3.2;2.2;3.2" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </g>

      <path d="M134 58C148 52 154 44 160 34" stroke="#d8b4fe" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-18" dur="2.4s" repeatCount="indefinite" />
      </path>
      <path d="M138 66C151 66 158 66 164 66" stroke="#e9d5ff" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-16" dur="1.9s" repeatCount="indefinite" />
      </path>
      <path d="M134 74C148 80 154 88 160 98" stroke="#f0abfc" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-18" dur="2.7s" repeatCount="indefinite" />
      </path>

      <circle r="2.4" fill="#f5d0fe">
        <animateMotion dur="2.4s" repeatCount="indefinite" path="M134 58C148 52 154 44 160 34" />
      </circle>
      <circle r="2.3" fill="#faf5ff">
        <animateMotion dur="1.9s" repeatCount="indefinite" path="M138 66C151 66 158 66 164 66" />
      </circle>
      <circle r="2.4" fill="#e9d5ff">
        <animateMotion dur="2.7s" repeatCount="indefinite" path="M134 74C148 80 154 88 160 98" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="154 22;154 20;154 22" dur="4.4s" repeatCount="indefinite" />
          <rect width="46" height="22" rx="8" fill="#ffffff" fillOpacity="0.9" />
          <rect x="8" y="7" width="14" height="8" rx="3" fill={`url(#${nodeId})`} />
          <rect x="26" y="8" width="12" height="3" rx="1.5" fill="#6d28d9" fillOpacity="0.7" />
          <rect x="26" y="13" width="8" height="3" rx="1.5" fill="#a855f7" fillOpacity="0.45" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="160 54;160 58;160 54" dur="4.1s" repeatCount="indefinite" />
          <rect width="40" height="22" rx="8" fill="#ffffff" fillOpacity="0.82" />
          <circle cx="12" cy="11" r="4" fill="#a855f7" />
          <path d="M20 9H31" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
          <path d="M20 14H27" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="152 88;152 86;152 88" dur="4.8s" repeatCount="indefinite" />
          <rect width="48" height="24" rx="8" fill="#ffffff" fillOpacity="0.78" />
          <rect x="8" y="8" width="20" height="3.5" rx="1.75" fill="#6d28d9" fillOpacity="0.78" />
          <rect x="8" y="14" width="13" height="3.5" rx="1.75" fill="#c084fc" fillOpacity="0.58" />
          <circle cx="37" cy="12" r="4" fill="#e879f9">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2.6s" repeatCount="indefinite" />
          </circle>
        </g>
      </g>
    </svg>
  );
}

function PptTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-ppt-bg`;
  const glowId = `${uid}-ppt-glow`;
  const screenId = `${uid}-ppt-screen`;
  const deckId = `${uid}-ppt-deck`;
  const beamId = `${uid}-ppt-beam`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="8" x2="200" y2="124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c2d12" />
          <stop offset="0.55" stopColor="#111827" />
          <stop offset="1" stopColor="#9a3412" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(174 22) rotate(120) scale(76 66)">
          <stop stopColor="#fb923c" stopOpacity="0.82" />
          <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={screenId} x1="138" y1="22" x2="198" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff7ed" />
          <stop offset="1" stopColor="#ffedd5" />
        </linearGradient>
        <linearGradient id={deckId} x1="96" y1="32" x2="136" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fdba74" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={beamId} x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fdba74" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffedd5" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fdba74" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="174" cy="22" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.3;0.78;0.3" dur="5s" repeatCount="indefinite" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="16 18;16 14;16 18" dur="4.2s" repeatCount="indefinite" />
          <rect width="46" height="30" rx="10" fill="#ffffff" fillOpacity="0.08" stroke="#fdba74" strokeOpacity="0.35" />
          <rect x="8" y="8" width="20" height="5" rx="2.5" fill="#ffedd5" fillOpacity="0.9" />
          <rect x="8" y="17" width="14" height="3.5" rx="1.75" fill="#fed7aa" fillOpacity="0.65" />
          <rect x="30" y="8" width="9" height="12" rx="3" fill="#fb923c" fillOpacity="0.85" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="20 72;20 76;20 72" dur="4.7s" repeatCount="indefinite" />
          <rect width="42" height="26" rx="9" fill="#ffffff" fillOpacity="0.07" stroke="#fb923c" strokeOpacity="0.32" />
          <rect x="8" y="7" width="12" height="12" rx="3" fill="#fdba74" fillOpacity="0.9" />
          <path d="M25 9H34" stroke="#ffedd5" strokeWidth="3" strokeLinecap="round" />
          <path d="M25 15H31" stroke="#fed7aa" strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>

      <path d="M64 34C82 38 92 44 98 52" stroke="#fdba74" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-28" dur="2.6s" repeatCount="indefinite" />
      </path>
      <path d="M62 86C84 84 94 76 100 66" stroke="#fb923c" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="2.8s" repeatCount="indefinite" />
      </path>
      <circle r="2.3" fill="#ffedd5">
        <animateMotion dur="2.6s" repeatCount="indefinite" path="M64 34C82 38 92 44 98 52" />
      </circle>
      <circle r="2.3" fill="#fed7aa">
        <animateMotion dur="2.8s" repeatCount="indefinite" path="M62 86C84 84 94 76 100 66" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="90 36;90 34;90 36" dur="3.8s" repeatCount="indefinite" />
        <rect x="6" y="8" width="44" height="34" rx="10" fill="#7c2d12" fillOpacity="0.45" />
        <rect x="3" y="4" width="44" height="34" rx="10" fill="#9a3412" fillOpacity="0.55" />
        <rect width="44" height="34" rx="10" fill={`url(#${deckId})`} />
        <rect x="8" y="8" width="18" height="10" rx="4" fill="#fff7ed" fillOpacity="0.85" />
        <path d="M30 10H36" stroke="#ffedd5" strokeWidth="3" strokeLinecap="round" />
        <path d="M8 24H35" stroke="#ffedd5" strokeWidth="3.4" strokeLinecap="round" strokeOpacity="0.75" />
        <path d="M8 30H28" stroke="#fed7aa" strokeWidth="3.4" strokeLinecap="round" strokeOpacity="0.55" />
      </g>

      <path d="M136 52C150 48 155 46 160 44" stroke="#fdba74" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="1.8s" repeatCount="indefinite" />
      </path>
      <path d="M136 64C150 66 155 68 160 68" stroke="#fb923c" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill="#fff7ed">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M136 52C150 48 155 46 160 44" />
      </circle>
      <circle r="2.4" fill="#fed7aa">
        <animateMotion dur="2s" repeatCount="indefinite" path="M136 64C150 66 155 68 160 68" />
      </circle>

      <g>
        <rect x="132" y="18" width="72" height="54" rx="14" fill={`url(#${screenId})`} />
        <rect x="132" y="18" width="72" height="54" rx="14" stroke="#fdba74" strokeOpacity="0.4" />
        <rect x="140" y="28" width="24" height="14" rx="5" fill="#fb923c" fillOpacity="0.9" />
        <path d="M170 31H191" stroke="#c2410c" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M170 38H184" stroke="#fdba74" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="140" y="48" width="8" height="12" rx="3" fill="#fdba74">
          <animate attributeName="height" values="12;18;12" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="y" values="48;42;48" dur="3.4s" repeatCount="indefinite" />
        </rect>
        <rect x="151" y="44" width="8" height="16" rx="3" fill="#fb923c">
          <animate attributeName="height" values="16;10;16" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="y" values="44;50;44" dur="3.4s" repeatCount="indefinite" />
        </rect>
        <rect x="162" y="40" width="8" height="20" rx="3" fill="#f97316">
          <animate attributeName="height" values="20;14;20" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="y" values="40;46;40" dur="3.4s" repeatCount="indefinite" />
        </rect>
        <circle cx="186" cy="52" r="8" fill="#fed7aa" />
        <path d="M186 44A8 8 0 0 1 194 52L186 52Z" fill="#f97316">
          <animateTransform attributeName="transform" type="rotate" values="0 186 52;360 186 52" dur="6s" repeatCount="indefinite" />
        </path>
        <rect x="126" y="18" width="28" height="54" fill={`url(#${beamId})`} opacity="0.75">
          <animate attributeName="x" values="126;206;126" dur="4.2s" repeatCount="indefinite" />
        </rect>
      </g>

      <path d="M168 74V89" stroke="#fdba74" strokeWidth="5" strokeLinecap="round" />
      <path d="M150 92H186" stroke="#fdba74" strokeWidth="6" strokeLinecap="round" />
      <rect x="150" y="98" width="18" height="10" rx="4" fill="#fff7ed" fillOpacity="0.35" />
      <rect x="172" y="98" width="24" height="10" rx="4" fill="#fff7ed" fillOpacity="0.24" />
    </svg>
  );
}

function CredibilityTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-cred-bg`;
  const glowId = `${uid}-cred-glow`;
  const sweepId = `${uid}-cred-sweep`;
  const shieldId = `${uid}-cred-shield`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="10" x2="198" y2="124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#134e4a" />
          <stop offset="0.55" stopColor="#0f172a" />
          <stop offset="1" stopColor="#115e59" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(176 22) rotate(120) scale(80 68)">
          <stop stopColor="#2dd4bf" stopOpacity="0.8" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sweepId} x1="112" y1="64" x2="132" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" stopOpacity="0.08" />
          <stop offset="1" stopColor="#99f6e4" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={shieldId} x1="160" y1="36" x2="194" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ecfeff" />
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="176" cy="22" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.32;0.78;0.32" dur="5.2s" repeatCount="indefinite" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="18 18;18 14;18 18" dur="4.4s" repeatCount="indefinite" />
          <rect width="42" height="24" rx="8" fill="#ffffff" fillOpacity="0.08" stroke="#99f6e4" strokeOpacity="0.35" />
          <rect x="9" y="7" width="18" height="4" rx="2" fill="#ecfeff" fillOpacity="0.92" />
          <rect x="9" y="14" width="12" height="3" rx="1.5" fill="#99f6e4" fillOpacity="0.58" />
          <circle cx="32" cy="12" r="4" fill="#34d399" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="18 54;18 58;18 54" dur="4.1s" repeatCount="indefinite" />
          <rect width="46" height="24" rx="8" fill="#ffffff" fillOpacity="0.07" stroke="#67e8f9" strokeOpacity="0.32" />
          <rect x="9" y="7" width="14" height="10" rx="3" fill="#06b6d4" fillOpacity="0.82" />
          <path d="M27 9H37" stroke="#ecfeff" strokeWidth="3" strokeLinecap="round" />
          <path d="M27 15H33" stroke="#a5f3fc" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="20 92;20 90;20 92" dur="4.8s" repeatCount="indefinite" />
          <rect width="42" height="24" rx="8" fill="#ffffff" fillOpacity="0.07" stroke="#fca5a5" strokeOpacity="0.35" />
          <path d="M11 8H29" stroke="#fecaca" strokeWidth="3" strokeLinecap="round" />
          <path d="M11 15H23" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
          <path d="M31 8L37 14" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M37 8L31 14" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      </g>

      <path d="M60 30C84 34 96 44 104 54" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-30" dur="2.7s" repeatCount="indefinite" />
      </path>
      <path d="M64 66C84 66 96 66 104 66" stroke="#67e8f9" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-22" dur="2.2s" repeatCount="indefinite" />
      </path>
      <path d="M62 102C80 96 88 88 94 82" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-22" dur="2.5s" repeatCount="indefinite" />
      </path>

      <circle r="2.3" fill="#ccfbf1">
        <animateMotion dur="2.7s" repeatCount="indefinite" path="M60 30C84 34 96 44 104 54" />
      </circle>
      <circle r="2.3" fill="#a5f3fc">
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M64 66C84 66 96 66 104 66" />
      </circle>
      <circle r="2.3" fill="#fca5a5">
        <animateMotion dur="2.5s" repeatCount="indefinite" path="M62 102C80 96 88 88 94 82" />
      </circle>

      <g>
        <circle cx="112" cy="64" r="20" fill="#0f766e" fillOpacity="0.18" stroke="#99f6e4" strokeOpacity="0.35" />
        <circle cx="112" cy="64" r="12" fill="#0b3b37" stroke="#67e8f9" strokeOpacity="0.25" />
        <path d="M112 64L127 50A20 20 0 0 1 131 70Z" fill={`url(#${sweepId})`}>
          <animateTransform attributeName="transform" type="rotate" values="0 112 64;360 112 64" dur="3.4s" repeatCount="indefinite" />
        </path>
        <circle cx="112" cy="64" r="3" fill="#99f6e4">
          <animate attributeName="r" values="2.5;4;2.5" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </g>

      <g>
        <circle cx="94" cy="82" r="8" fill="#7f1d1d" fillOpacity="0.85" stroke="#fca5a5" strokeOpacity="0.45" />
        <path d="M91 79L97 85" stroke="#fecaca" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M97 79L91 85" stroke="#fecaca" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      <path d="M124 56C138 48 148 46 160 48" stroke="#5eead4" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-22" dur="1.8s" repeatCount="indefinite" />
      </path>
      <path d="M124 70C138 76 148 78 160 76" stroke="#67e8f9" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-22" dur="2s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill="#ccfbf1">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M124 56C138 48 148 46 160 48" />
      </circle>
      <circle r="2.4" fill="#a5f3fc">
        <animateMotion dur="2s" repeatCount="indefinite" path="M124 70C138 76 148 78 160 76" />
      </circle>

      <g>
        <path d="M178 34L198 42V58C198 74 186 84 178 88C170 84 158 74 158 58V42L178 34Z" fill={`url(#${shieldId})`} />
        <path d="M178 34L198 42V58C198 74 186 84 178 88C170 84 158 74 158 58V42L178 34Z" stroke="#99f6e4" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M168 60L176 68L190 52" stroke="#0f766e" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
          <animate attributeName="stroke-dasharray" values="0 40;40 0;40 0" dur="3s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  );
}

function StoryGlassTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-story-bg`;
  const glowId = `${uid}-story-glow`;
  const glassId = `${uid}-story-glass`;
  const liquidId = `${uid}-story-liquid`;
  const pourId = `${uid}-story-pour`;
  const clipId = `${uid}-story-clip`;
  const cardId = `${uid}-story-card`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="12" x2="200" y2="124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7f1d1d" />
          <stop offset="0.48" stopColor="#0f172a" />
          <stop offset="1" stopColor="#0c4a6e" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(176 22) rotate(120) scale(82 64)">
          <stop stopColor="#fda4af" stopOpacity="0.82" />
          <stop offset="0.48" stopColor="#fbbf24" stopOpacity="0.28" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={glassId} x1="92" y1="28" x2="130" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.48" stopColor="#e0f2fe" stopOpacity="0.38" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.68" />
        </linearGradient>
        <linearGradient id={liquidId} x1="90" y1="58" x2="132" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fb7185" />
          <stop offset="0.48" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={pourId} x1="58" y1="48" x2="112" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fecdd3" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffe4e6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={cardId} x1="16" y1="16" x2="64" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff7ed" />
          <stop offset="1" stopColor="#fecdd3" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d="M90 34H132L126 108C125 115 120 118 111 118C102 118 97 115 96 108L90 34Z" />
        </clipPath>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="176" cy="22" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.32;0.82;0.32" dur="5s" repeatCount="indefinite" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="18 22;18 17;18 22" dur="4.4s" repeatCount="indefinite" />
        <rect width="48" height="28" rx="10" fill={`url(#${cardId})`} fillOpacity="0.95" />
        <path d="M11 9H32" stroke="#9f1239" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 16H38" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.72" />
        <path d="M11 22H25" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.72" />
      </g>

      <g>
        <animateTransform attributeName="transform" type="translate" values="25 80;25 84;25 80" dur="4.9s" repeatCount="indefinite" />
        <rect width="44" height="26" rx="10" fill="#ffffff" fillOpacity="0.09" stroke="#fda4af" strokeOpacity="0.34" />
        <circle cx="13" cy="13" r="5" fill="#fb7185" fillOpacity="0.88" />
        <path d="M25 9H36" stroke="#fff7ed" strokeWidth="3" strokeLinecap="round" />
        <path d="M25 16H33" stroke="#fed7aa" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.74" />
      </g>

      <path d="M60 36C78 40 90 52 99 66" stroke="#fecdd3" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="2.3s" repeatCount="indefinite" />
      </path>
      <path d="M68 92C84 88 94 80 102 72" stroke="#fbbf24" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-24" dur="2.7s" repeatCount="indefinite" />
      </path>
      <rect x="66" y="48" width="54" height="18" fill={`url(#${pourId})`} opacity="0.7">
        <animate attributeName="x" values="54;104;54" dur="3.6s" repeatCount="indefinite" />
      </rect>
      <circle r="2.5" fill="#ffe4e6">
        <animateMotion dur="2.3s" repeatCount="indefinite" path="M60 36C78 40 90 52 99 66" />
      </circle>
      <circle r="2.5" fill="#fde68a">
        <animateMotion dur="2.7s" repeatCount="indefinite" path="M68 92C84 88 94 80 102 72" />
      </circle>

      <g>
        <path d="M96 31H126" stroke="#e0f2fe" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
        <path d="M98 34H130L124 108C123 114 119 116 111 116C103 116 99 114 98 108L92 34H98Z" fill={`url(#${glassId})`} fillOpacity="0.18" stroke="#e0f2fe" strokeOpacity="0.66" strokeWidth="2" />
        <g clipPath={`url(#${clipId})`}>
          <path d="M88 78C96 72 104 84 112 78C120 72 128 84 136 78V122H88V78Z" fill={`url(#${liquidId})`} opacity="0.88">
            <animate attributeName="d" values="M88 78C96 72 104 84 112 78C120 72 128 84 136 78V122H88V78Z;M88 81C96 87 104 75 112 81C120 87 128 75 136 81V122H88V81Z;M88 78C96 72 104 84 112 78C120 72 128 84 136 78V122H88V78Z" dur="3.2s" repeatCount="indefinite" />
          </path>
          <circle cx="104" cy="96" r="2.6" fill="#fff7ed" fillOpacity="0.8">
            <animate attributeName="cy" values="104;80;104" dur="3.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.86;0" dur="3.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="118" cy="100" r="2.1" fill="#e0f2fe" fillOpacity="0.8">
            <animate attributeName="cy" values="106;84;106" dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.78;0" dur="3.2s" repeatCount="indefinite" />
          </circle>
        </g>
        <path d="M120 27C130 44 128 58 120 75" stroke="#fda4af" strokeWidth="3" strokeLinecap="round">
          <animate attributeName="strokeOpacity" values="0.52;0.95;0.52" dur="2.8s" repeatCount="indefinite" />
        </path>
      </g>

      <g>
        <animateTransform attributeName="transform" type="translate" values="154 28;154 24;154 28" dur="4.1s" repeatCount="indefinite" />
        <rect width="44" height="28" rx="10" fill="#ffffff" fillOpacity="0.9" />
        <path d="M12 12C16 6 25 6 29 12C33 18 27 23 22 25C17 23 8 18 12 12Z" fill="#fb7185" />
        <path d="M34 8L38 12L34 16L30 12Z" fill="#fbbf24">
          <animate attributeName="opacity" values="0.42;1;0.42" dur="1.8s" repeatCount="indefinite" />
        </path>
      </g>

      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M172 82L176 90L184 94L176 98L172 106L168 98L160 94L168 90Z" fill="#fef3c7" fillOpacity="0.95" stroke="#fbbf24" strokeWidth="1.5">
          <animateTransform attributeName="transform" type="scale" values="1;1.12;1" dur="2.4s" repeatCount="indefinite" />
        </path>
        <path d="M192 70L194 74L198 76L194 78L192 82L190 78L186 76L190 74Z" fill="#bae6fd" fillOpacity="0.95" stroke="#38bdf8" strokeWidth="1.2">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="2s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  );
}

function PermissionTooltipScene() {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `${uid}-permission-bg`;
  const glowId = `${uid}-permission-glow`;
  const panelId = `${uid}-permission-panel`;
  const doorId = `${uid}-permission-door`;
  const pathId = `${uid}-permission-path`;

  return (
    <svg viewBox="0 0 220 132" className="h-36 w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="18" y1="10" x2="198" y2="122" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f3b2e" />
          <stop offset="0.55" stopColor="#0f172a" />
          <stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(178 20) rotate(120) scale(78 64)">
          <stop stopColor="#34d399" stopOpacity="0.75" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={panelId} x1="18" y1="18" x2="66" y2="106" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dcfce7" />
          <stop offset="1" stopColor="#86efac" />
        </linearGradient>
        <linearGradient id={doorId} x1="90" y1="34" x2="128" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fed7aa" />
          <stop offset="1" stopColor="#fb7185" />
        </linearGradient>
        <linearGradient id={pathId} x1="126" y1="56" x2="190" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#86efac" stopOpacity="0" />
          <stop offset="0.45" stopColor="#dcfce7" stopOpacity="0.95" />
          <stop offset="1" stopColor="#86efac" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="220" height="132" rx="20" fill={`url(#${bgId})`} />
      <circle cx="178" cy="20" r="58" fill={`url(#${glowId})`}>
        <animate attributeName="opacity" values="0.28;0.78;0.28" dur="5.2s" repeatCount="indefinite" />
      </circle>

      <g>
        <animateTransform attributeName="transform" type="translate" values="16 28;16 24;16 28" dur="4.2s" repeatCount="indefinite" />
        <rect width="44" height="76" rx="14" fill="#ffffff" fillOpacity="0.08" stroke="#86efac" strokeOpacity="0.28" />
        <rect x="8" y="10" width="28" height="16" rx="6" fill={`url(#${panelId})`} />
        <rect x="8" y="34" width="18" height="4" rx="2" fill="#dcfce7" fillOpacity="0.92" />
        <rect x="8" y="42" width="22" height="4" rx="2" fill="#bbf7d0" fillOpacity="0.62" />
        <rect x="8" y="52" width="10" height="10" rx="3" fill="#34d399" fillOpacity="0.85" />
        <rect x="22" y="52" width="10" height="10" rx="3" fill="#10b981" fillOpacity="0.6" />
      </g>

      <path d="M60 64C72 64 79 64 86 64" stroke="#86efac" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 7">
        <animate attributeName="stroke-dashoffset" values="0;-22" dur="2.1s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill="#dcfce7">
        <animateMotion dur="2.1s" repeatCount="indefinite" path="M60 64C72 64 79 64 86 64" />
      </circle>

      <g>
        <rect x="86" y="30" width="42" height="68" rx="16" fill="#1f2937" fillOpacity="0.45" stroke="#fed7aa" strokeOpacity="0.26" />
        <rect x="94" y="38" width="26" height="52" rx="12" fill={`url(#${doorId})`} />
        <rect x="111" y="58" width="3.5" height="12" rx="1.75" fill="#7f1d1d" fillOpacity="0.55" />
        <circle cx="104" cy="64" r="4" fill="#fff7ed" fillOpacity="0.9" />
        <animateTransform attributeName="transform" type="translate" values="0 0;14 0;14 0;0 0" dur="4.6s" repeatCount="indefinite" />
      </g>

      <path d="M126 56H188" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 8">
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="2s" repeatCount="indefinite" />
      </path>
      <rect x="126" y="48" width="24" height="16" fill={`url(#${pathId})`} opacity="0.8">
        <animate attributeName="x" values="126;188;126" dur="3.2s" repeatCount="indefinite" />
      </rect>
      <circle r="2.5" fill="#dcfce7">
        <animateMotion dur="2s" repeatCount="indefinite" path="M126 56H188" />
      </circle>

      <g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="156 20;156 18;156 20" dur="4.4s" repeatCount="indefinite" />
          <rect width="44" height="22" rx="8" fill="#ffffff" fillOpacity="0.92" />
          <circle cx="12" cy="11" r="4" fill="#10b981" />
          <path d="M20 9H34" stroke="#065f46" strokeWidth="3" strokeLinecap="round" />
          <path d="M20 14H28" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.68" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="164 54;164 58;164 54" dur="4s" repeatCount="indefinite" />
          <rect width="36" height="22" rx="8" fill="#ffffff" fillOpacity="0.84" />
          <rect x="8" y="7" width="10" height="8" rx="2.5" fill="#34d399" />
          <path d="M22 9H30" stroke="#065f46" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M22 14H27" stroke="#6ee7b7" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.68" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="154 88;154 85;154 88" dur="4.8s" repeatCount="indefinite" />
          <path d="M24 0L44 8V24C44 38 34 46 24 50C14 46 4 38 4 24V8L24 0Z" fill="#ffffff" fillOpacity="0.88" />
          <path d="M16 24L22 30L33 18" stroke="#047857" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
            <animate attributeName="stroke-dasharray" values="0 24;24 0;24 0" dur="3s" repeatCount="indefinite" />
          </path>
        </g>
      </g>
    </svg>
  );
}

function TooltipScene({ type }) {
  switch (type) {
    case 'webSearch':
      return <WebSearchTooltipScene />;
    case 'deepResearch':
      return <DeepResearchTooltipScene />;
    case 'memory':
      return <MemoryTooltipScene />;
    case 'ppt':
      return <PptTooltipScene />;
    case 'credibility':
      return <CredibilityTooltipScene />;
    case 'storyGlass':
      return <StoryGlassTooltipScene />;
    case 'permission':
      return <PermissionTooltipScene />;
    default:
      return null;
  }
}

const FLOATING_POPOVER_MARGIN = 16;

const FloatingPopover = ({
  children,
  content,
  width = 288,
  align = 'center',
  interactive = false,
  disabled = false,
  onOpenChange
}) => {
  const anchorRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({
    left: FLOATING_POPOVER_MARGIN,
    top: FLOATING_POPOVER_MARGIN,
    width,
    arrowLeft: width / 2
  });

  const setOpenState = (nextOpen) => {
    setIsOpen((current) => (current === nextOpen ? current : nextOpen));
  };

  const updatePosition = () => {
    if (typeof window === 'undefined' || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || width;
    const popupWidth = Math.min(width, Math.max(180, viewportWidth - FLOATING_POPOVER_MARGIN * 2));
    const maxLeft = Math.max(FLOATING_POPOVER_MARGIN, viewportWidth - popupWidth - FLOATING_POPOVER_MARGIN);
    const preferredLeft = align === 'start'
      ? rect.left
      : align === 'end'
        ? rect.right - popupWidth
        : rect.left + rect.width / 2 - popupWidth / 2;
    const left = Math.min(maxLeft, Math.max(FLOATING_POPOVER_MARGIN, preferredLeft));
    const top = Math.max(FLOATING_POPOVER_MARGIN, rect.top - 14);
    const arrowLeft = Math.min(popupWidth - 14, Math.max(14, rect.left + rect.width / 2 - left));

    setPosition({ left, top, width: popupWidth, arrowLeft });
  };

  const openPopover = () => {
    if (disabled) return;
    window.clearTimeout(closeTimerRef.current);
    setOpenState(true);
    requestAnimationFrame(updatePosition);
  };

  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpenState(false), interactive ? 120 : 70);
  };

  useEffect(() => {
    return () => window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return undefined;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, width, align]);

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex shrink-0"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onFocus={openPopover}
      onBlur={scheduleClose}
    >
      {children}
      {isOpen && !disabled && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className={`fixed z-[9999] ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            transform: 'translateY(-100%)'
          }}
          onMouseEnter={interactive ? openPopover : undefined}
          onMouseLeave={interactive ? scheduleClose : undefined}
        >
          {typeof content === 'function' ? content(position) : content}
        </div>,
        document.body
      )}
    </span>
  );
};

const FeatureTooltip = ({ children, description, type = 'default' }) => {
  const theme = FEATURE_TOOLTIP_THEMES[type] || FEATURE_TOOLTIP_THEMES.default;
  const hasScene = type === 'webSearch' || type === 'deepResearch' || type === 'memory' || type === 'ppt' || type === 'credibility' || type === 'storyGlass' || type === 'permission';
  const scene = <TooltipScene type={type} />;

  if (!hasScene) {
    return children;
  }

  return (
    <FloatingPopover
      width={288}
      content={({ arrowLeft }) => (
        <>
          <div className={`relative overflow-hidden rounded-[1.4rem] backdrop-blur-md ${theme.container}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${theme.glow}`} />
            <div className="absolute inset-x-5 top-0 h-px bg-white/20" />
            <div className="relative p-3">
              {scene}
              {description ? (
                <div className="px-2 pb-2 pt-1">
                  <div className="text-[12px] font-medium leading-5 text-white/92 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                    {description}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div
            className={`absolute top-full h-4 w-4 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[4px] shadow-[0_10px_25px_rgba(15,23,42,0.24)] ${theme.arrow}`}
            style={{ left: arrowLeft }}
          />
        </>
      )}
    >
      {children}
    </FloatingPopover>
  );
};

const markdownPlugins = [[remarkGfm, { singleTilde: false }]];
const INTERNAL_SETTINGS_LINK_PREFIX = 'agent://settings';

const urlTransform = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  if (trimmed.startsWith(INTERNAL_SETTINGS_LINK_PREFIX)) return trimmed;
  return '';
};

const getChatDownloadUrl = (backendUrl, file) => {
  if (!file?.downloadUrl) return '';
  if (file.downloadUrl.startsWith('http://') || file.downloadUrl.startsWith('https://')) {
    return file.downloadUrl;
  }
  return `${backendUrl}${file.downloadUrl}`;
};

const AUTO_COLLAPSE_CODE_LINE_LIMIT = 14;
const AGENT_PERMISSION_MODE_DEFAULT = 'default';
const AGENT_PERMISSION_MODE_FULL = 'full-access';
const CHAT_CODE_THEME = {
  ...oneLight,
  'pre[class*="language-"]': {
    ...(oneLight['pre[class*="language-"]'] || {}),
    background: 'transparent',
    margin: 0,
    padding: 0,
    borderRadius: '1rem'
  },
  'code[class*="language-"]': {
    ...(oneLight['code[class*="language-"]'] || {}),
    background: 'transparent',
    fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", monospace',
    textShadow: 'none'
  }
};
const NOTE_TO_SEMITONE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SLASH_COMMANDS = [
  {
    id: 'image',
    trigger: '/image',
    aliases: ['/img'],
    labels: {
      zh: '切换到生图',
      en: 'Switch to image generation'
    },
    descriptions: {
      zh: '打开生图模式，继续输入提示词即可发送',
      en: 'Enable image generation and keep typing your prompt'
    }
  },
  {
    id: 'file',
    trigger: '/file',
    aliases: ['/upload'],
    labels: {
      zh: '快速选择文件',
      en: 'Quick file picker'
    },
    descriptions: {
      zh: '立刻打开本地文件选择器',
      en: 'Open the local file picker immediately'
    }
  },
  {
    id: 'ppt',
    trigger: '/ppt',
    aliases: [],
    labels: {
      zh: '切换到 PPT',
      en: 'Switch to PPT mode'
    },
    descriptions: {
      zh: '把下一条消息作为 PPT 生成请求',
      en: 'Turn the next prompt into a PPT generation request'
    }
  },
  {
    id: 'glass',
    trigger: '/glass',
    aliases: ['/mix'],
    labels: {
      zh: '切换到故事杯',
      en: 'Switch to Story Glass'
    },
    descriptions: {
      zh: '把下一条输入调成一张 Saki 风格的情绪特调卡',
      en: 'Turn the next prompt into a Saki-style mood drink card'
    }
  },
  {
    id: 'deep',
    trigger: '/deep',
    aliases: ['/research'],
    labels: {
      zh: '切换到深度研究',
      en: 'Switch to deep research'
    },
    descriptions: {
      zh: '启动联网深度研究流程',
      en: 'Start the deep research workflow'
    }
  },
  {
    id: 'truth',
    trigger: '/truth',
    aliases: ['/verify'],
    labels: {
      zh: '切换到智链核验',
      en: 'Switch to credibility check'
    },
    descriptions: {
      zh: '提取关键词并用多搜索引擎联合查证真假',
      en: 'Extract keywords and verify the claim across multiple search engines'
    }
  }
];

const DEFAULT_STORY_GLASS_PREFERENCES = {
  mode: 'auto',
  intensity: 'medium',
  realism: 'home',
};

const STORY_GLASS_PREFERENCE_GROUPS = [
  {
    id: 'mode',
    labels: { zh: '模式', en: 'Mode' },
    options: [
      { value: 'auto', labels: { zh: '自动', en: 'Auto' } },
      { value: 'night-bar', labels: { zh: '夜幕', en: 'Night' } },
      { value: 'comfort-home', labels: { zh: '居家', en: 'Home' } },
      { value: 'zero-proof', labels: { zh: '无酒精', en: 'Zero' } },
    ],
  },
  {
    id: 'intensity',
    labels: { zh: '情绪浓度', en: 'Mood' },
    options: [
      { value: 'light', labels: { zh: '轻', en: 'Light' } },
      { value: 'medium', labels: { zh: '中', en: 'Medium' } },
      { value: 'deep', labels: { zh: '浓', en: 'Deep' } },
    ],
  },
  {
    id: 'realism',
    labels: { zh: '配方', en: 'Recipe' },
    options: [
      { value: 'home', labels: { zh: '家里能做', en: 'Home' } },
      { value: 'bar', labels: { zh: '酒吧感', en: 'Bar' } },
      { value: 'visual', labels: { zh: '海报感', en: 'Poster' } },
    ],
  },
];

const STORY_GLASS_REMIX_ACTIONS = [
  {
    id: 'sweeter',
    labels: { zh: '更甜一点', en: 'Sweeter' },
    instructions: {
      zh: '让这杯更甜一点，情绪更柔软，尾韵更有安慰感。',
      en: 'Make this glass sweeter, softer, and more comforting in the finish.',
    },
    preferences: { intensity: 'light' },
  },
  {
    id: 'clearer',
    labels: { zh: '更清醒一点', en: 'Clearer' },
    instructions: {
      zh: '改成更清醒、更透气的版本，尽量保持无酒精或低负担。',
      en: 'Make it clearer and more breathable, preferably zero-proof or very low burden.',
    },
    preferences: { mode: 'zero-proof', intensity: 'light', realism: 'home' },
  },
  {
    id: 'night',
    labels: { zh: '更像夜晚酒吧', en: 'More Night' },
    instructions: {
      zh: '把它调得更像夜晚酒吧，氛围更深，名字和风味更有夜色。',
      en: 'Make it feel more like a late-night bar, with a deeper mood, name, and flavor profile.',
    },
    preferences: { mode: 'night-bar', intensity: 'deep', realism: 'bar' },
  },
  {
    id: 'rename',
    labels: { zh: '换一个杯名', en: 'Rename' },
    instructions: {
      zh: '保留这杯的核心情绪和配方方向，但换一个更有记忆点的杯名。',
      en: 'Keep the core mood and recipe direction, but give it a more memorable name.',
    },
    preferences: {},
  },
  {
    id: 'saki',
    labels: { zh: '更像 Saki 会说的话', en: 'More Saki' },
    instructions: {
      zh: '让 Saki 的备注更贴近、更灵动，但不要油腻或过度煽情。',
      en: 'Make Saki\'s note feel closer and more alive, without becoming cheesy or melodramatic.',
    },
    preferences: { intensity: 'medium' },
  },
  {
    id: 'redraw',
    labels: { zh: '重新画插图', en: 'Redraw' },
    instructions: {
      zh: '尽量保留这杯的设定，但重新构思插图提示词，让画面更稳定、更像饮品主视觉。',
      en: 'Keep the drink concept mostly intact, but rethink the illustration prompt for a stronger drink hero image.',
    },
    preferences: { realism: 'visual' },
  },
];

function noteNameToFrequency(note = 'A4') {
  const match = String(note || '').trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return 440;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  let semitone = NOTE_TO_SEMITONE[letter];
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  const midi = (octave + 1) * 12 + semitone;
  return 440 * (2 ** ((midi - 69) / 12));
}

function createNoiseBuffer(audioContext) {
  const durationSeconds = 0.18;
  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * durationSeconds), audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - (i / data.length));
  }
  return buffer;
}

function getSynthPreset(instrument = 'piano') {
  switch (instrument) {
    case 'electric_piano':
      return { waveform: 'triangle', attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.18, gain: 0.14 };
    case 'warm_pad':
      return { waveform: 'sawtooth', attack: 0.08, decay: 0.25, sustain: 0.5, release: 0.35, gain: 0.11 };
    case 'strings':
      return { waveform: 'sawtooth', attack: 0.05, decay: 0.22, sustain: 0.52, release: 0.28, gain: 0.12 };
    case 'bass':
      return { waveform: 'square', attack: 0.01, decay: 0.12, sustain: 0.35, release: 0.12, gain: 0.11 };
    case 'pluck':
      return { waveform: 'triangle', attack: 0.005, decay: 0.08, sustain: 0.15, release: 0.12, gain: 0.12 };
    case 'bell':
      return { waveform: 'sine', attack: 0.002, decay: 0.22, sustain: 0.08, release: 0.22, gain: 0.13 };
    default:
      return { waveform: 'triangle', attack: 0.01, decay: 0.16, sustain: 0.28, release: 0.16, gain: 0.12 };
  }
}

function scheduleSynthNote(audioContext, destination, instrument, pitches = [], startTime, durationSeconds, velocity = 0.7, volume = 0.7) {
  const preset = getSynthPreset(instrument);
  const safeDuration = Math.max(0.08, Number(durationSeconds) || 0.2);
  const releaseTime = preset.release;
  const stopTime = startTime + safeDuration + releaseTime;
  const cleanups = [];
  const safePitches = Array.isArray(pitches) ? pitches : [];

  safePitches.forEach((pitch, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const peak = Math.max(0.0001, Math.min(0.18, preset.gain * (Number(velocity) || 0.7) * (Number(volume) || 0.7) / Math.max(safePitches.length, 1)));
    const sustainValue = Math.max(0.0001, peak * preset.sustain);

    oscillator.type = preset.waveform;
    oscillator.frequency.setValueAtTime(noteNameToFrequency(pitch), startTime);
    if (instrument === 'bell') {
      oscillator.frequency.setValueAtTime(noteNameToFrequency(pitch) * (index % 2 === 0 ? 1 : 2), startTime);
    }

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(peak, startTime + preset.attack);
    gainNode.gain.exponentialRampToValueAtTime(sustainValue, startTime + preset.attack + preset.decay);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(stopTime);

    cleanups.push(() => {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
      try { gainNode.disconnect(); } catch {}
    });
  });

  return cleanups;
}

function scheduleDrumHit(audioContext, destination, pitch = 'C2', startTime, velocity = 0.8, noiseBuffer) {
  const safeVelocity = Math.max(0.2, Math.min(1, Number(velocity) || 0.8));
  const cleanups = [];

  if (pitch === 'C2') {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(140, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(45, startTime + 0.18);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.22 * safeVelocity, startTime + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.22);
    cleanups.push(() => {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
      try { gainNode.disconnect(); } catch {}
    });
    return cleanups;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gainNode = audioContext.createGain();
  source.buffer = noiseBuffer;
  let stopTime = startTime + 0.07;

  if (pitch === 'D2') {
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.14 * safeVelocity, startTime + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);
    stopTime = startTime + 0.16;
  } else {
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(pitch === 'A#2' ? 6200 : 4800, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime((pitch === 'A#2' ? 0.08 : 0.05) * safeVelocity, startTime + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + (pitch === 'A#2' ? 0.12 : 0.06));
    stopTime = startTime + (pitch === 'A#2' ? 0.13 : 0.07);
  }

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(destination);
  source.start(startTime);
  source.stop(stopTime);
  cleanups.push(() => {
    try { source.stop(); } catch {}
    try { source.disconnect(); } catch {}
    try { filter.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
  });
  return cleanups;
}

const countTextLines = (text = '') => {
  const normalized = String(text ?? '');
  if (!normalized) return 0;
  return normalized.split(/\r?\n/).length;
};

const getDiffStats = (fileMetadata) => {
  const oldText = typeof fileMetadata?.before === 'string' ? fileMetadata.before : '';
  const newText = typeof fileMetadata?.after === 'string' ? fileMetadata.after : '';

  let added = 0;
  let removed = 0;

  diffLines(oldText, newText).forEach((part) => {
    const lines = part.value.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    const lineCount = lines.length;
    if (part.added) added += lineCount;
    if (part.removed) removed += lineCount;
  });

  return { added, removed };
};

const getDrawingProviderLabel = (provider = '') => {
  switch (provider) {
    case 'stable-diffusion':
      return 'Stable Diffusion';
    case 'ollama':
      return 'Ollama API';
    case 'copilot':
    case 'github':
      return 'GitHub Copilot API';
    case 'custom':
      return '自定义 API';
    case 'none':
      return '未启用';
    default:
      return provider || '绘图 API';
  }
};

const isTodoClosed = (todo) => {
  const status = String(todo?.status || '').toLowerCase();
  return Boolean(todo?.closed) || ['done', 'completed', 'complete', 'closed', 'finished'].includes(status);
};

const getActiveTaskTodo = (messages = [], isGenerating = false, currentPendingRequest = null) => {
  if (!isGenerating && !currentPendingRequest) return null;

  const pendingAssistantId = currentPendingRequest?.assistantMsgId;
  const candidates = pendingAssistantId
    ? messages.filter(message => String(message.id) === String(pendingAssistantId))
    : [...messages].reverse();

  for (const message of candidates) {
    const todo = message?.todoList;
    if (!todo || isTodoClosed(todo)) continue;
    if (Array.isArray(todo.items) && todo.items.length > 0) {
      return todo;
    }
  }

  return null;
};

function getStoryGlassArchiveStatus(data = {}, getLocalText) {
  const status = String(data.status || '').toLowerCase();
  const stage = String(data.currentStage || data.stage || '').toLowerCase();
  if (status === 'error' || stage === 'error' || data.error) {
    return getLocalText('调酒失败', 'Failed');
  }
  if (status === 'completed' || stage === 'completed') {
    return getLocalText('已上杯', 'Served');
  }
  return getLocalText('调酒中', 'Mixing');
}

function StoryGlassArchiveCard({ message = {}, onOpen, getLocalText }) {
  const data = message.storyGlassData || {};
  const title = String(data.cocktailName || getLocalText('故事杯记录', 'Story Glass Record')).trim();
  const status = getStoryGlassArchiveStatus(data, getLocalText);
  const note = String(data.sakiComment || data.storySummary || data.flavorDescription || '').trim();
  const progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
  const isRunning = !['completed', 'error'].includes(String(data.status || '').toLowerCase())
    && String(data.currentStage || '').toLowerCase() !== 'completed';

  return (
    <div className="relative max-w-[42rem] overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(244,114,182,0.10),rgba(125,211,252,0.10))]" />
      <div className="relative z-10 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 shadow-sm">
          <Sparkles size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-rose-100 bg-white/85 px-2.5 py-1 text-[11px] font-bold text-rose-600">
              {getLocalText('故事杯', 'Story Glass')}
            </span>
            <span className="rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              {status}
            </span>
          </div>
          <div className="mt-2 truncate text-lg font-black text-slate-900">
            {title}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
            {note || getLocalText('完整调酒内容已收在故事杯页面。', 'The full drink card is kept on the Story Glass page.')}
          </p>
          {isRunning ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#fda4af,#fde68a,#7dd3fc)] transition-all duration-500"
                style={{ width: `${progress || 14}%` }}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
          >
            <Sparkles size={13} />
            {getLocalText('打开故事杯页面', 'Open Story Glass')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Chat({
  messages,
  onSend,
  isGenerating,
  onStop,
  onSkipAction,
  backendUrl,
  containerRef,
  config,
  setConfig,
  onDeepDataUpdate,
  activeDeepReadingData,
  contextStatus,
  onRedo,
  onDeleteMessage,
  onDeleteStoryGlassRecord,
  onEditMessage,
  onUpdateMessageText,
  onOpenFileManager,
  onOpenSettings,
  externalFile,
  onExternalFileClear,
  composerPreset,
  onComposerPresetConsumed,
  currentPendingRequest,
  onStoryGlassModeChange,
  storyGlassOverlayOpen,
  onStoryGlassOverlayOpenChange,
  onAppendStoryGlassConversation,
  onEnsureChat
}) {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage || i18n.language || 'en-US';
  const getLocalText = (zhText, enText) => (
    String(uiLanguage || '').toLowerCase().startsWith('zh') ? zhText : enText
  );
  const permissionMode = config?.agentPermissionMode === AGENT_PERMISSION_MODE_FULL
    ? AGENT_PERMISSION_MODE_FULL
    : AGENT_PERMISSION_MODE_DEFAULT;
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [readingIdx, setReadingIdx] = useState(null);
  const [editingMsgIdx, setEditingMsgIdx] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [diagnosticsMsg, setDiagnosticsMsg] = useState(null);
  const [files, setFiles] = useState([]);
  const [useWeb, setUseWeb] = useState(false);
  const [useMcp, setUseMcp] = useState(false);
  const [useSd, setUseSd] = useState(false);
  const [useMemory, setUseMemory] = useState(false);
  const [usePpt, setUsePpt] = useState(false);
  const [useTruthCheck, setUseTruthCheck] = useState(false);
  const [useStoryGlass, setUseStoryGlass] = useState(false);
  const [storyGlassPreferences, setStoryGlassPreferences] = useState(DEFAULT_STORY_GLASS_PREFERENCES);
  const [localStoryGlassOverlayOpen, setLocalStoryGlassOverlayOpen] = useState(false);
  const [storyGlassReviewMessageId, setStoryGlassReviewMessageId] = useState(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const plusMenuRef = useRef(null);
  const dragDepthRef = useRef(0);
  const textareaRef = useRef(null);
  const storyGlassModeChangeRef = useRef(onStoryGlassModeChange);
  const previousStoryGlassModeRef = useRef(useStoryGlass);
  const trimmedInput = input.trimStart();
  const slashToken = trimmedInput.startsWith('/') ? (trimmedInput.split(/\s+/)[0] || '').toLowerCase() : '';
  const slashSuggestions = slashToken && !trimmedInput.includes(' ')
    ? SLASH_COMMANDS.filter(command => {
        const allTokens = [command.trigger, ...(command.aliases || [])];
        return allTokens.some(token => token.startsWith(slashToken))
          || command.id.includes(slashToken.replace('/', ''));
      })
    : [];
  const contextPercent = Math.min(100, Math.max(0, Number(contextStatus?.percent || 0)));
  const contextUsedTokens = Number(contextStatus?.usedTokens || 0);
  const contextBudgetTokens = Number(contextStatus?.budgetTokens || 0);
  const contextCompressed = Boolean(contextStatus?.compressed);
  const contextEstimated = Boolean(contextStatus?.estimated);
  const contextNearCompression = contextStatus?.state === 'near-compression';
  const contextTone = contextPercent >= 90
    ? 'text-rose-600 border-rose-200 bg-rose-50'
    : contextPercent >= 75
      ? 'text-amber-600 border-amber-200 bg-amber-50'
      : (contextCompressed || contextNearCompression)
        ? 'text-violet-600 border-violet-200 bg-violet-50'
        : 'text-sky-600 border-sky-200 bg-sky-50';
  const contextTooltip = contextStatus
    ? getLocalText(
        `背景信息已${contextEstimated ? '按当前聊天记录计算' : '计算'} ${contextPercent}%。${
          contextCompressed
            ? `已自动压缩较早背景，保留最近 ${contextStatus.keptRecentMessages || 0} 条消息和当前任务。`
            : (contextNearCompression ? '接近自动压缩阈值，发送时可能会压缩较早背景。' : '尚未压缩。')
        } 约 ${contextUsedTokens}/${contextBudgetTokens} tokens。`,
        `Background context ${contextPercent}% ${contextEstimated ? 'calculated from the current chat history' : 'used'}. ${
          contextCompressed
            ? `Earlier background compressed; kept ${contextStatus.keptRecentMessages || 0} recent messages and the current task.`
            : (contextNearCompression ? 'Near the auto-compression threshold; older background may be compressed on send.' : 'Not compressed yet.')
        } About ${contextUsedTokens}/${contextBudgetTokens} tokens.`
      )
    : getLocalText('当前聊天记录还没有可计算的背景信息。', 'No chat history is available for background context yet.');

  const isStoryGlassOverlayControlled = storyGlassOverlayOpen !== undefined;
  const isStoryGlassOverlayOpen = isStoryGlassOverlayControlled
    ? Boolean(storyGlassOverlayOpen)
    : localStoryGlassOverlayOpen;
  const setIsStoryGlassOverlayOpen = useCallback((nextValue) => {
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(isStoryGlassOverlayOpen)
      : nextValue;
    const nextOpen = Boolean(resolvedValue);
    if (!isStoryGlassOverlayControlled) {
      setLocalStoryGlassOverlayOpen(nextOpen);
    }
    onStoryGlassOverlayOpenChange?.(nextOpen);
  }, [isStoryGlassOverlayControlled, isStoryGlassOverlayOpen, onStoryGlassOverlayOpenChange]);

  const handleModeBarWheel = (event) => {
    const bar = event.currentTarget;
    const maxScrollLeft = bar.scrollWidth - bar.clientWidth;
    if (maxScrollLeft <= 0) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;

    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, bar.scrollLeft + delta));
    if (nextScrollLeft !== bar.scrollLeft) {
      event.preventDefault();
      bar.scrollLeft = nextScrollLeft;
    }
  };

  const updateStoryGlassPreference = (key, value) => {
    setStoryGlassPreferences(prev => ({
      ...DEFAULT_STORY_GLASS_PREFERENCES,
      ...(prev || {}),
      [key]: value,
    }));
  };

  // Handle external file selection (e.g. from Workspace)
  useEffect(() => {
    if (externalFile) {
      setFiles(prev => [...prev, externalFile]);
      onExternalFileClear?.();
    }
  }, [externalFile, onExternalFileClear]);

  useEffect(() => {
    if (!composerPreset?.timestamp) return;
    setInput(composerPreset.text || '');
    setFiles(Array.isArray(composerPreset.files) ? composerPreset.files : []);
    onComposerPresetConsumed?.();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [composerPreset, onComposerPresetConsumed]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashToken]);

  // 当深度阅读开启时，关闭其他开关，并打开联网搜索
  useEffect(() => {
    if (useWeb) {
      if (!config.searchEnabled) {
        setConfig(prev => ({ ...prev, searchEnabled: true }));
      }
      setUseMcp(false);
      setUseSd(false);
      setUseTruthCheck(false);
    }
  }, [useWeb]);

  useEffect(() => {
    if (useTruthCheck) {
      if (!config.searchEnabled) {
        setConfig(prev => ({ ...prev, searchEnabled: true }));
      }
      setUseWeb(false);
      setUseMcp(false);
      setUseSd(false);
      setUsePpt(false);
    }
  }, [useTruthCheck]);

  useEffect(() => {
    if (useStoryGlass) {
      setUseWeb(false);
      setUseMcp(false);
      setUseSd(false);
      setUsePpt(false);
      setUseTruthCheck(false);
    }
  }, [useStoryGlass]);

  useEffect(() => {
    storyGlassModeChangeRef.current = onStoryGlassModeChange;
  }, [onStoryGlassModeChange]);

  useEffect(() => {
    if (previousStoryGlassModeRef.current === useStoryGlass) {
      return;
    }

    previousStoryGlassModeRef.current = useStoryGlass;
    storyGlassModeChangeRef.current?.(useStoryGlass);
  }, [useStoryGlass]);

  useEffect(() => {
    if (useWeb || useMcp || useSd || usePpt || useTruthCheck) {
      setUseStoryGlass(false);
    }
  }, [useWeb, useMcp, useSd, usePpt, useTruthCheck]);

  const [mcpStatus, setMcpStatus] = useState(null);
  const [sdStatus, setSdStatus] = useState(null);
  const [drawingApiStatus, setDrawingApiStatus] = useState(null);
  const [sovitsStatus, setSovitsStatus] = useState(null);
  const [showMcpStatus, setShowMcpStatus] = useState(false);
  const [showSdStatus, setShowSdStatus] = useState(false);
  const [showSovitsStatus, setShowSovitsStatus] = useState(false);
  const [diffModalFile, setDiffModalFile] = useState(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isAiCustomizationOpen, setIsAiCustomizationOpen] = useState(false);
  const [isTodoCollapsed, setIsTodoCollapsed] = useState(false);
  const prevMessageCountRef = useRef(0);
  const activeTodo = getActiveTaskTodo(messages, isGenerating, currentPendingRequest);
  const activeTodoId = activeTodo?.id || '';

  useEffect(() => {
    if (activeTodoId) {
      setIsTodoCollapsed(false);
    }
  }, [activeTodoId]);

  const handleRollback = async (fileMetadata) => {
    if (!window.confirm(t('file_rollback_confirm', { filename: fileMetadata.filePath.split(/[\\\/]/).pop() }))) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: fileMetadata.filePath,
          before: fileMetadata.before,
          operation: fileMetadata.operation,
          isDeletion: fileMetadata.operation === 'create',
          afterHash: fileMetadata.afterHash,
          expectedCurrentHash: fileMetadata.afterHash,
          encoding: fileMetadata.encoding,
          textFormat: fileMetadata.textFormat
        })
      });
      if (res.ok) {
        alert(t('file_rollback_success'));
        setIsDiffModalOpen(false);
      } else {
        const err = await res.json();
        alert(`${t('rollback_fail')}: ${err.error || 'Unknown Error'}`);
      }
    } catch (e) {
      alert(`${t('network_error')}: ${e.message}`);
    }
  };

  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const isStableDiffusionDrawing = config.drawingProvider === 'stable-diffusion';
  const activeDrawingStatus = isStableDiffusionDrawing ? sdStatus : drawingApiStatus;

  useEffect(() => {
    let interval;
    if (useSd || showSdStatus) {
      const fetchDrawingStatus = async () => {
        try {
          if (config.drawingProvider === 'stable-diffusion') {
            const sdUrl = config.sdUrl || 'http://127.0.0.1:7860';
            const res = await fetch(`${backendUrl}/api/sd/status?url=${encodeURIComponent(sdUrl)}`);
            const data = await res.json();
            setSdStatus(data);
            setDrawingApiStatus(null);
            return;
          }

          const res = await fetch(`${backendUrl}/api/drawing/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: config.drawingProvider || '',
              model: config.drawingModel || '',
              ollamaUrl: config.ollamaUrl || '',
              copilotToken: config.copilotToken || '',
              customDrawingUrl: config.customDrawingUrl || '',
              customDrawingKey: config.customDrawingKey || '',
              customDrawingModel: config.customDrawingModel || ''
            })
          });
          const data = await res.json();
          setDrawingApiStatus(data);
          setSdStatus(null);
        } catch (e) {
          console.error("Failed to fetch drawing status", e);
        }
      };
      fetchDrawingStatus();
      interval = setInterval(fetchDrawingStatus, 5000);
    }
    return () => interval && clearInterval(interval);
  }, [useSd, showSdStatus, backendUrl, config.sdUrl, config.drawingProvider, config.drawingModel, config.ollamaUrl, config.copilotToken, config.customDrawingUrl, config.customDrawingKey, config.customDrawingModel]);

  useEffect(() => {
    let interval;
    if (useMcp || showMcpStatus) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/mcp/status`);
          const data = await res.json();
          setMcpStatus(data);
        } catch (e) {
          console.error("Failed to fetch MCP status", e);
        }
      };
      fetchStatus();
      interval = setInterval(fetchStatus, 3000);
    }
    return () => interval && clearInterval(interval);
  }, [useMcp, showMcpStatus, backendUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevMessageCountRef.current;
    const isAssistantReplying = isGenerating && messages.length > 0 && messages[messages.length - 1].role === 'assistant';
    
    // Check if user is near bottom (within 150px)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    // Only auto-scroll if it's a new message or if user is already browsing at the bottom
    if (isNewMessage || (isAssistantReplying && isAtBottom)) {
      endRef.current?.scrollIntoView({ behavior: isNewMessage ? 'auto' : 'smooth' });
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, isGenerating]);

  const handleSend = () => {
    if (isGenerating) {
      onStop();
      return;
    }
    const payload = buildSendPayload();
    if (!payload) return;
    onSend(payload.text, files, payload.options);
    setInput('');
    setFiles([]);
    if (isRecording) stopRecording();
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('browser_not_support_speech'));
      return;
    }

    const recognition = new SpeechRecognition();
    
    // Set language based on current i18n language
    const langMap = {
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'en-US': 'en-US',
      'en-GB': 'en-GB',
      'ja': 'ja-JP',
      'fr': 'fr-FR'
    };
    recognition.lang = langMap[i18n.language] || 'zh-CN';
    
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          setInput(prev => prev + event.results[i][0].transcript);
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    let interval;
    if (config.ttsProvider === 'gpt-sovits') {
      const fetchSovitsStatus = async () => {
        try {
          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
          const res = await fetch(`${backendUrl}/api/sovits/status?url=${encodeURIComponent(url)}`);
          const data = await res.json();
          setSovitsStatus(data);
        } catch (e) {
          setSovitsStatus({ connected: false });
        }
      };
      fetchSovitsStatus();
      interval = setInterval(fetchSovitsStatus, 5000);
    } else {
      setSovitsStatus(null);
    }
    return () => interval && clearInterval(interval);
  }, [config.ttsProvider, config.sovitsUrl, backendUrl]);

  const uploadFiles = async (selectedFiles = []) => {
    if (!selectedFiles.length) return;

    for (const [index, rawFile] of selectedFiles.entries()) {
      const file = rawFile?.name
        ? rawFile
        : new File([rawFile], `pasted-image-${Date.now()}-${index + 1}.png`, {
            type: rawFile?.type || 'image/png',
          });
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.filename) {
          setFiles((prev) => [
            ...prev,
            {
              name: data.filename,
              path: data.path,
              content: data.content,
              isImage: data.isImage,
            },
          ]);
        }
      } catch (err) {
        console.error('File upload failed:', err);
      }
    }
  };

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    await uploadFiles(selectedFiles);
    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type?.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (imageFiles.length === 0) return;

    e.preventDefault();
    await uploadFiles(imageFiles);
  };

  const applyCommandOptions = (baseOptions, commandId) => {
    const nextOptions = { ...baseOptions };

    if (commandId === 'image') {
      nextOptions.useSd = true;
      nextOptions.useWeb = false;
      nextOptions.usePpt = false;
      nextOptions.useTruthCheck = false;
      nextOptions.useStoryGlass = false;
      return nextOptions;
    }

    if (commandId === 'ppt') {
      nextOptions.usePpt = true;
      nextOptions.useWeb = false;
      nextOptions.useSd = false;
      nextOptions.useTruthCheck = false;
      nextOptions.useStoryGlass = false;
      return nextOptions;
    }

    if (commandId === 'glass') {
      nextOptions.useStoryGlass = true;
      nextOptions.usePpt = false;
      nextOptions.useWeb = false;
      nextOptions.useSd = false;
      nextOptions.useTruthCheck = false;
      nextOptions.useMcp = false;
      return nextOptions;
    }

    if (commandId === 'deep') {
      nextOptions.useWeb = true;
      nextOptions.usePpt = false;
      nextOptions.useSd = false;
      nextOptions.useTruthCheck = false;
      nextOptions.useStoryGlass = false;
      nextOptions.useSearch = true;
      return nextOptions;
    }

    if (commandId === 'truth') {
      nextOptions.useTruthCheck = true;
      nextOptions.usePpt = false;
      nextOptions.useWeb = false;
      nextOptions.useSd = false;
      nextOptions.useStoryGlass = false;
      nextOptions.useSearch = true;
      return nextOptions;
    }

    return nextOptions;
  };

  const activateSlashCommand = (command) => {
    if (!command) return;

    if (command.id === 'image') {
      setUseSd(true);
      setUsePpt(false);
      setUseWeb(false);
      setUseTruthCheck(false);
      setUseStoryGlass(false);
    }

    if (command.id === 'ppt') {
      setUsePpt(true);
      setUseWeb(false);
      setUseSd(false);
      setUseTruthCheck(false);
      setUseStoryGlass(false);
    }

    if (command.id === 'glass') {
      setUseStoryGlass(true);
      setUsePpt(false);
      setUseWeb(false);
      setUseSd(false);
      setUseTruthCheck(false);
      setUseMcp(false);
    }

    if (command.id === 'deep') {
      setUseWeb(true);
      setUsePpt(false);
      setUseSd(false);
      setUseTruthCheck(false);
      setUseStoryGlass(false);
    }

    if (command.id === 'truth') {
      setUseTruthCheck(true);
      setUseWeb(false);
      setUsePpt(false);
      setUseSd(false);
      setUseStoryGlass(false);
    }

    const allTriggers = [command.trigger, ...(command.aliases || [])];
    const matchedTrigger = allTriggers.find(trigger => trimmedInput.toLowerCase().startsWith(trigger)) || command.trigger;
    const remainingText = trimmedInput.toLowerCase().startsWith(matchedTrigger)
      ? trimmedInput.slice(matchedTrigger.length).trimStart()
      : trimmedInput.replace(/^\/\S+/, '').trimStart();

    setInput(remainingText);
    setSlashIndex(0);

    if (command.id === 'file') {
      requestAnimationFrame(() => {
        fileInputRef.current?.click();
      });
      return;
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const buildSendPayload = () => {
    const baseOptions = {
      useSearch: config.searchEnabled,
      useWeb,
      useMcp,
      useSd,
      useMemory,
      usePpt,
      useTruthCheck,
      useStoryGlass,
      storyGlassPreferences
    };

    if (!trimmedInput && files.length === 0) return null;

    let nextText = input;
    let nextOptions = { ...baseOptions };

    if (slashToken) {
      const command = SLASH_COMMANDS.find(item => [item.trigger, ...(item.aliases || [])].includes(slashToken));
      if (command) {
        nextOptions = applyCommandOptions(nextOptions, command.id);
        if (command.id !== 'file') {
          activateSlashCommand(command);
        }

        nextText = trimmedInput.slice(slashToken.length).trimStart();

        if (command.id === 'file' && !nextText && files.length === 0) {
          activateSlashCommand(command);
          return null;
        }

        if (!nextText.trim() && files.length === 0) {
          setInput('');
          return null;
        }
      }
    }

    if (!nextText.trim() && files.length === 0) return null;

    return {
      text: nextText.trim(),
      options: nextOptions
    };
  };

  useEffect(() => {
    const hasFilePayload = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

    const handleDragEnter = (event) => {
      if (!hasFilePayload(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragOverlayVisible(true);
    };

    const handleDragOver = (event) => {
      if (!hasFilePayload(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (event) => {
      if (!hasFilePayload(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragOverlayVisible(false);
      }
    };

    const handleDrop = async (event) => {
      if (!hasFilePayload(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverlayVisible(false);

      const droppedFiles = Array.from(event.dataTransfer?.files || []);
      if (droppedFiles.length > 0) {
        await uploadFiles(droppedFiles);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [backendUrl]);

  const getCleanText = (parts) => {
    if (!parts) return "";
    return parts
      .filter(p => p.type === 'text')
      .map(p => p.content.replace(/\[expression:.*?\.png\]/g, '').replace(/```[\s\S]*?```/g, '').trim())
      .filter(t => t.length > 0)
      .join('\n\n')
      .trim();
  };

  const getMessagePlainText = (message) => {
    if (!message) return '';
    if (message.role === 'assistant') {
      return getCleanText(message.parts);
    }
    return String(message.content || '').trim();
  };

  const copyToClipboard = (idx, message) => {
    const text = getMessagePlainText(message);
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const stopPlainSpeech = () => {
    window.__sakiTtsToken = null;
    window.__sakiTtsPending = false;
    if (config.ttsProvider === 'gpt-sovits') {
      if (window.currentSovitsAudio) {
        window.currentSovitsAudio.pause();
        window.currentSovitsAudio = null;
      }
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setReadingIdx(null);
  };

  const speakPlainText = async (speechId, text, showErrors = true) => {
    if (readingIdx === speechId) {
      stopPlainSpeech();
      return;
    }

    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    const speechToken = `${speechId}-${Date.now()}`;
    window.__sakiTtsToken = speechToken;
    window.__sakiTtsPending = true;
    const finishPlainSpeech = () => {
      if (window.__sakiTtsToken === speechToken) {
        window.__sakiTtsToken = null;
        window.__sakiTtsPending = false;
        setReadingIdx(null);
      }
    };

    if (config.ttsProvider === 'gpt-sovits') {
      setReadingIdx(speechId);
      try {
        const langMap = { 'zh-CN': 'zh', 'en-US': 'en', 'ja': 'ja', 'fr': 'fr' };
        const lang = langMap[i18n.language] || 'zh';

        const payload = {
          text: cleanText,
          text_lang: lang,
          ref_audio_path: config.sovitsRefAudio,
          prompt_text: config.sovitsRefText || '',
          prompt_lang: lang,
          media_type: 'wav',
          streaming_mode: false,
          sovits_url: config.sovitsUrl || 'http://127.0.0.1:9880'
        };

        const response = await fetch(`${backendUrl}/api/sovits/proxy/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || errData.message || 'TTS request failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        if (window.currentSovitsAudio) {
          window.currentSovitsAudio.pause();
        }
        window.currentSovitsAudio = audio;

        await new Promise((resolve) => {
          let settled = false;
          const finishAudio = () => {
            if (settled) return;
            settled = true;
            finishPlainSpeech();
            URL.revokeObjectURL(url);
            if (window.currentSovitsAudio === audio) {
              window.currentSovitsAudio = null;
            }
            resolve();
          };

          audio.onended = finishAudio;
          audio.onpause = finishAudio;
          audio.onerror = (e) => {
            console.error("Audio playback error", e);
            finishAudio();
          };

          audio.play().catch((error) => {
            console.error("Audio playback error", error);
            finishAudio();
          });
        });
      } catch (err) {
        console.error('SoVITS TTS Error:', err);
        finishPlainSpeech();
        if (showErrors) {
          if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            alert('无法连接到 GPT-SoVITS 服务。请确保已通过 start.bat 或手动启动服务，并检查设置中的 API 地址是否正确（默认 http://127.0.0.1:9880）。');
          } else {
            alert('GPT-SoVITS 错误: ' + err.message);
          }
        }
      }
    } else {
      if (!window.speechSynthesis) {
        finishPlainSpeech();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      setReadingIdx(speechId);
      await new Promise((resolve) => {
        let settled = false;
        const finishUtterance = () => {
          if (settled) return;
          settled = true;
          finishPlainSpeech();
          resolve();
        };
        utterance.onend = finishUtterance;
        utterance.onerror = finishUtterance;
        window.speechSynthesis.speak(utterance);
      });
    }
  };

  const speakText = async (idx, message) => {
    if (readingIdx === idx) {
      if (config.ttsProvider === 'gpt-sovits') {
        if (window.currentSovitsAudio) {
          window.currentSovitsAudio.pause();
          window.currentSovitsAudio = null;
        }
      } else {
        window.speechSynthesis.cancel();
      }
      setReadingIdx(null);
      return;
    }

    const text = getMessagePlainText(message);
    if (!text) return;

    await speakPlainText(idx, text, true);
  };

  const handleRedoAction = async (idx) => {
    if (onRedo) {
      await onRedo(idx);
    }
  };

  const handleStoryGlassRemix = (storyGlassData = {}, action = {}) => {
    if (isGenerating || !onSend) return;

    const name = String(storyGlassData.cocktailName || getLocalText('这杯故事杯', 'this Story Glass')).trim();
    const originalStory = String(storyGlassData.request || storyGlassData.storySummary || '').trim();
    const actionLabel = getLocalText(action.labels?.zh || '', action.labels?.en || '');
    const instruction = getLocalText(action.instructions?.zh || actionLabel, action.instructions?.en || actionLabel);
    const nextPreferences = {
      ...DEFAULT_STORY_GLASS_PREFERENCES,
      ...(storyGlassPreferences || {}),
      ...(action.preferences || {}),
      remixAction: action.id || actionLabel,
      remixInstruction: instruction,
      previousCocktailName: name,
    };
    const remixText = getLocalText(
      [
        `请基于上一杯「${name}」再调一下：${actionLabel}。`,
        instruction,
        originalStory ? `原故事：${originalStory}` : '',
      ].filter(Boolean).join('\n'),
      [
        `Please remix the previous glass "${name}": ${actionLabel}.`,
        instruction,
        originalStory ? `Original story: ${originalStory}` : '',
      ].filter(Boolean).join('\n')
    );

    onSend(remixText, [], {
      useSearch: config.searchEnabled,
      useStoryGlass: true,
      storyGlassOverlay: isStoryGlassOverlayOpen,
      storyGlassPreferences: nextPreferences,
    });
  };

  const closeStoryGlassOverlay = () => {
    setIsStoryGlassOverlayOpen(false);
    setStoryGlassReviewMessageId(null);
    stopPlainSpeech();
  };

  const openStoryGlassArchive = (messageId) => {
    setStoryGlassReviewMessageId(String(messageId || ''));
    setIsStoryGlassOverlayOpen(true);
  };

  const handleStoryGlassOverlaySubmit = (storyText, nextPreferences = {}) => {
    if (isGenerating || !onSend) return;

    setStoryGlassReviewMessageId(null);
    setUseStoryGlass(false);
    setUseWeb(false);
    setUseMcp(false);
    setUseSd(false);
    setUsePpt(false);
    setUseTruthCheck(false);

    onSend(storyText, [], {
      useSearch: config.searchEnabled,
      useStoryGlass: true,
      storyGlassOverlay: true,
      storyGlassPreferences: {
        ...DEFAULT_STORY_GLASS_PREFERENCES,
        ...(storyGlassPreferences || {}),
        ...(nextPreferences || {}),
      },
    });
  };

  const handleGeneratedFileDownload = (file) => {
    const href = getChatDownloadUrl(backendUrl, file);
    if (!href) return;

    const link = document.createElement('a');
    link.href = href;
    link.download = file.name || '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent relative">
      {isDragOverlayVisible && (
        <div className="pointer-events-none fixed inset-0 z-[140] flex items-center justify-center bg-sky-950/35 backdrop-blur-md">
          <div className="rounded-[2rem] border border-white/30 bg-white/16 px-8 py-7 text-center text-white shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
              <Paperclip size={28} />
            </div>
            <div className="text-xl font-semibold tracking-wide">
              {getLocalText('释放以上传文件', 'Drop to upload files')}
            </div>
            <div className="mt-2 text-sm text-white/80">
              {getLocalText('支持直接拖入图片、文档和代码文件', 'Images, documents, and code files are all supported')}
            </div>
          </div>
        </div>
      )}
      <StoryGlassOverlay
        isOpen={isStoryGlassOverlayOpen}
        onClose={closeStoryGlassOverlay}
        onSubmitStory={handleStoryGlassOverlaySubmit}
        isGenerating={isGenerating}
        messages={messages}
        preferences={storyGlassPreferences}
        preferenceGroups={STORY_GLASS_PREFERENCE_GROUPS}
        onPreferenceChange={updateStoryGlassPreference}
        remixActions={STORY_GLASS_REMIX_ACTIONS}
        onRemix={handleStoryGlassRemix}
        onSpeak={(text, speechId) => speakPlainText(speechId || 'story-glass', text, false)}
        onStopSpeech={stopPlainSpeech}
        backendUrl={backendUrl}
        config={config}
        reviewMessageId={storyGlassReviewMessageId}
        onReviewMessageChange={setStoryGlassReviewMessageId}
        onDeleteRecord={onDeleteStoryGlassRecord}
        onArchiveConversation={onAppendStoryGlassConversation}
      />
      <div
        id="chat-messages-container"
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 relative custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div 
                onClick={() => setIsAiCustomizationOpen(true)}
                className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border border-gray-100 cursor-pointer hover:opacity-80 transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center bg-white"
                title={t('edit_ai_settings', '编辑 AI 设定')}
              >
                <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{t('welcome_title')}</h2>
              <p className="text-gray-500 mt-2">{t('welcome_desc')}</p>
            </div>
          </div>
        )}
        {messages.map((m, idx) => {
          const isAssistant = m.role === 'assistant';
          const previousMessage = idx > 0 ? messages[idx - 1] : null;
          const isStoryGlassOverlayMessage = Boolean(m.requestOptions?.storyGlassOverlay);
          const isStoryGlassOverlayUser = m.role === 'user' && isStoryGlassOverlayMessage;
          const isStoryGlassOverlayAssistant = Boolean(
            isAssistant
            && (
              isStoryGlassOverlayMessage
              || (
                previousMessage?.requestOptions?.storyGlassOverlay
                && (m.placeholderMode === 'story-glass' || m.storyGlassData)
              )
            )
          );
          if (isStoryGlassOverlayUser) {
            return null;
          }
          if (isStoryGlassOverlayAssistant) {
            return (
              <div key={m.id || idx} className="flex gap-4">
                <div 
                  onClick={() => setIsAiCustomizationOpen(true)}
                  className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200 cursor-pointer hover:opacity-80 transition-all hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center bg-white"
                  title={t('edit_ai_settings', '编辑 AI 设定')}
                >
                  <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
                </div>
                <StoryGlassArchiveCard
                  message={m}
                  getLocalText={getLocalText}
                  onOpen={() => openStoryGlassArchive(m.id)}
                />
              </div>
            );
          }
          const visibleGeneratedFiles = Array.isArray(m.generatedFiles)
            ? m.generatedFiles.filter((file) => !(file?.kind === 'story-glass-illustration' && m.storyGlassData?.coverImageUrl))
            : [];
          const hasAssistantText = Array.isArray(m.parts) && m.parts.some(
            part => part.type === 'text' && part.content.replace(/\[expression:.*?\.png\]/g, '').trim()
          );
          const hasAssistantContent = hasAssistantText
            || (Array.isArray(m.parts) && m.parts.some(part => part.type === 'action'))
            || Boolean(m.deepReadingData)
            || Boolean(m.pptData)
            || Boolean(m.credibilityCheckData)
            || Boolean(m.storyGlassData)
            || visibleGeneratedFiles.length > 0;
          const showPendingState = isAssistant && !hasAssistantContent;
          const hideToolbar = isAssistant && isGenerating && idx === messages.length - 1 && showPendingState;

          return (
            <div key={m.id || idx} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {isAssistant && (
                <div 
                  onClick={() => setIsAiCustomizationOpen(true)}
                  className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200 cursor-pointer hover:opacity-80 transition-all hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center bg-white"
                  title={t('edit_ai_settings', '编辑 AI 设定')}
                >
                  <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
                </div>
              )}
              <div className={`relative ${editingMsgIdx === idx ? 'w-[550px] max-w-full' : 'max-w-[85%]'} group/message ${m.role === 'user' ? 'order-1' : ''}`}>
                {!(hideToolbar || editingMsgIdx === idx) && (
                  <MessageBubbleToolbar
                    align={m.role === 'user' ? 'end' : 'start'}
                    isAssistant={isAssistant}
                    message={m}
                    canRedo={isAssistant}
                    canEdit={true}
                    copied={copiedIdx === idx}
                    speaking={readingIdx === idx}
                    onCopy={() => copyToClipboard(idx, m)}
                    onSpeak={() => speakText(idx, m)}
                    onRedo={() => handleRedoAction(idx)}
                    onEdit={() => {
                      if (m.role === 'user') {
                        onEditMessage?.(idx);
                      } else {
                        setEditingMsgIdx(idx);
                        const getMessageEditText = (msg) => {
                          if (msg.content) return msg.content;
                          if (Array.isArray(msg.parts)) {
                            return msg.parts
                              .filter(p => p.type === 'text')
                              .map(p => p.content)
                              .join('\n');
                          }
                          return '';
                        };
                        setEditingMsgText(getMessageEditText(m));
                      }
                    }}
                    onDelete={() => onDeleteMessage?.(idx)}
                    onOpenDiagnostics={() => setDiagnosticsMsg(m)}
                    labels={{
                      copy: copiedIdx === idx ? t('copied') : t('copy'),
                      read: readingIdx === idx ? t('listening') : t('listen'),
                      redo: t('redo'),
                      edit: getLocalText('编辑', 'Edit'),
                      delete: t('delete'),
                      diagnostics: getLocalText('查看诊断详情', 'View Diagnostics')
                    }}
                  />
                )}

                <div className={`rounded-2xl p-4 transition-all ${editingMsgIdx === idx ? 'shadow-xl w-full' : 'hover:translate-y-[-1px] hover:shadow-lg'} ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md rounded-tr-none rounded-2xl p-4'
                    : showPendingState
                      ? ''
                      : 'bg-white/95 border border-gray-100 shadow-sm backdrop-blur-md rounded-tl-none rounded-2xl p-4'
                }`}>
                  {editingMsgIdx === idx ? (
                    <div className="flex flex-col gap-4 pointer-events-auto w-full animate-in fade-in duration-200">
                      <div className="relative rounded-2xl border border-slate-200/80 bg-slate-50/50 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] backdrop-blur-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <textarea
                          value={editingMsgText}
                          onChange={(e) => setEditingMsgText(e.target.value)}
                          className="w-full min-h-[160px] resize-y rounded-xl bg-transparent px-4 py-3 pb-8 text-sm font-normal leading-relaxed text-slate-700 placeholder-slate-400 focus:outline-none"
                          placeholder={getLocalText("编辑消息内容...", "Edit message content...")}
                          autoFocus
                        />
                        <div className="absolute bottom-2.5 right-4 text-[9px] font-semibold text-slate-400 font-mono pointer-events-none select-none">
                          {estimateMessageTokens({ content: editingMsgText })} tokens
                        </div>
                      </div>
                      <div className="flex justify-end items-center gap-2.5">
                        <button
                          onClick={() => setEditingMsgIdx(null)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 active:scale-98 transition-all shadow-sm"
                        >
                          {getLocalText("取消", "Cancel")}
                        </button>
                        <button
                          onClick={() => {
                            onUpdateMessageText?.(idx, editingMsgText);
                            setEditingMsgIdx(null);
                          }}
                          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:from-blue-600 hover:to-indigo-700 active:scale-98 transition-all shadow-md shadow-blue-500/10"
                        >
                          {getLocalText("保存修改", "Save Changes")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isAssistant && (
                        <div className="flex flex-col">
                          {showPendingState ? (
                            <AssistantPendingCard
                              mode={m.placeholderMode}
                              status={m.status}
                              isGenerating={isGenerating && idx === messages.length - 1}
                              getLocalText={getLocalText}
                            />
                          ) : (
                            <>
                              {(m.parts || []).map((part, i) => (
                                <React.Fragment key={i}>
                                  {part.type === 'action' && (
                                    <TerminalBlock
                                      action={part.data}
                                      observation={part.observation}
                                      fileMetadata={part.fileMetadata}
                                      onViewChanges={(data) => {
                                        setDiffModalFile(data);
                                        setIsDiffModalOpen(true);
                                      }}
                                      onRollback={handleRollback}
                                      onSkipAction={onSkipAction}
                                    />
                                  )}
                                  {part.type === 'text' && (
                                    <MessageContent
                                      content={part.content}
                                      isGenerating={isGenerating}
                                      onOpenSettings={onOpenSettings}
                                    />
                                  )}
                                </React.Fragment>
                              ))}
                              {m.deepReadingData && (
                                <div className="mt-4 w-full">
                                  <DeepReadingView data={m.deepReadingData} isEmbedded={true} />
                                </div>
                              )}
                              {m.pptData && (
                                <div className="mt-4 w-full">
                                  <PPTView data={m.pptData} isEmbedded={true} />
                                </div>
                              )}
                              {m.credibilityCheckData && (
                                <div className="mt-4 w-full">
                                  <CredibilityCheckView data={m.credibilityCheckData} isEmbedded={true} />
                                </div>
                              )}
                              {m.storyGlassData && (
                                <div className="mt-4 w-full">
                                  <StoryGlassView
                                    data={m.storyGlassData}
                                    isEmbedded={true}
                                    onRemix={(action) => handleStoryGlassRemix(m.storyGlassData, action)}
                                    remixActions={STORY_GLASS_REMIX_ACTIONS}
                                  />
                                </div>
                              )}
                              {visibleGeneratedFiles.length > 0 && (
                                <div className="mt-4 flex flex-col gap-2">
                                  {visibleGeneratedFiles.map((file, fileIdx) => (
                                    file.kind === 'music-composition' ? (
                                      <MusicFileCard
                                        key={`${file.filePath || file.name || 'generated'}-${fileIdx}`}
                                        file={file}
                                        onDownload={handleGeneratedFileDownload}
                                      />
                                    ) : (
                                      <button
                                        key={`${file.filePath || file.name || 'generated'}-${fileIdx}`}
                                        onClick={() => handleGeneratedFileDownload(file)}
                                        className="w-full flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-3 text-left transition-all hover:bg-blue-100/80 hover:border-blue-200"
                                        title={file.filePath || file.relativePath || file.name}
                                      >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm shrink-0">
                                          <FileText size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-sm font-semibold text-gray-800">
                                            {file.name || file.relativePath || file.filePath}
                                          </div>
                                          <div className="truncate text-[11px] text-gray-500">
                                            {file.relativePath || file.filePath}
                                          </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2 text-blue-600">
                                          {file.sizeLabel && (
                                            <span className="text-[11px] font-semibold text-blue-500">{file.sizeLabel}</span>
                                          )}
                                          <Download size={16} />
                                        </div>
                                      </button>
                                    )
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {m.role === 'user' && <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>}
                    </>
                  )}
                  {m.files && m.files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-black/10 px-2 py-1 rounded text-xs">
                          <Paperclip size={12} />
                          {f}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0 order-2">
                  <img src={config.userAvatar || '/assets/head_user.png'} alt="User" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-white/10 bg-transparent">
        <div className="max-w-4xl mx-auto">
          {files.length > 0 && (
            <div className="flex gap-2 mb-2 px-1">
              {files.map((f, i) => (
                <div key={i} className="text-xs bg-white/20 backdrop-blur-md border border-white/20 px-2 py-1 rounded-full flex items-center gap-1.5 text-white">
                  <Paperclip size={12} className="text-white/60" />
                  <span>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-300">×</button>
                </div>
              ))}
            </div>
          )}
          {activeTodo && (
            <TaskTodoPanel
              todo={activeTodo}
              collapsed={isTodoCollapsed}
              onToggle={() => setIsTodoCollapsed(prev => !prev)}
              getLocalText={getLocalText}
            />
          )}
          <div
            className="relative flex items-end gap-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl focus-within:border-blue-400 transition-colors p-2 flex-wrap shadow-lg"
            data-onboarding-id="chat-composer"
          >
            {slashSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-3 rounded-[1.5rem] border border-gray-200 bg-white/95 p-2 shadow-2xl backdrop-blur-xl z-[120]">
                <div className="mb-2 flex items-center gap-2 px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  <Sparkles size={12} />
                  {getLocalText('斜杠命令', 'Slash Commands')}
                </div>
                <div className="space-y-1">
                  {slashSuggestions.map((command, index) => {
                    const isActive = index === slashIndex;
                    return (
                      <button
                        key={command.id}
                        onClick={() => activateSlashCommand(command)}
                        onMouseEnter={() => setSlashIndex(index)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                          isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className={`rounded-xl px-2 py-1 text-[11px] font-bold ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {command.trigger}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {String(uiLanguage || '').toLowerCase().startsWith('zh') ? command.labels.zh : command.labels.en}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {String(uiLanguage || '').toLowerCase().startsWith('zh') ? command.descriptions.zh : command.descriptions.en}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {useStoryGlass && (
              <div className="w-full rounded-2xl border border-rose-100/80 bg-white/65 px-3 py-3 shadow-sm backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500">
                  <Sparkles size={12} />
                  {getLocalText('故事杯偏好', 'Story Glass')}
                </div>
                <div className="grid gap-2 lg:grid-cols-3">
                  {STORY_GLASS_PREFERENCE_GROUPS.map((group) => (
                    <div key={group.id} className="min-w-0">
                      <div className="mb-1 text-[10px] font-semibold text-slate-500">
                        {getLocalText(group.labels.zh, group.labels.en)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.options.map((option) => {
                          const active = storyGlassPreferences[group.id] === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => updateStoryGlassPreference(group.id, option.value)}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                                active
                                  ? 'border-rose-300 bg-rose-500 text-white shadow-sm'
                                  : 'border-white/70 bg-white/75 text-slate-600 hover:bg-white'
                              }`}
                            >
                              {active ? <Check size={11} /> : null}
                              {getLocalText(option.labels.zh, option.labels.en)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div
              className="flex w-full flex-nowrap items-center gap-2 mb-1 px-1 shrink-0 overflow-x-auto overflow-y-visible pb-2 no-scrollbar overscroll-x-contain scroll-smooth [&>*]:shrink-0 [&_button]:whitespace-nowrap"
              data-onboarding-id="chat-mode-bar"
              onWheel={handleModeBarWheel}
            >
              <div className="relative group shrink-0">
                <FloatingPopover
                  width={256}
                  align="start"
                  content={({ arrowLeft }) => (
                    <>
                      <div className="rounded-xl border border-white/30 bg-white/95 p-3 text-xs text-gray-700 shadow-xl backdrop-blur-xl">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-bold">{getLocalText('背景信息', 'Background')}</span>
                          <span className={`font-bold ${contextPercent >= 90 ? 'text-rose-600' : contextPercent >= 75 ? 'text-amber-600' : 'text-sky-600'}`}>
                            {contextStatus ? `${contextPercent}%` : '--'}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${contextPercent >= 90 ? 'bg-rose-500' : contextPercent >= 75 ? 'bg-amber-500' : contextCompressed ? 'bg-violet-500' : 'bg-sky-500'}`}
                            style={{ width: `${contextStatus ? contextPercent : 0}%` }}
                          />
                        </div>
                        <div className="mt-2 leading-relaxed text-gray-500">
                          {contextTooltip}
                        </div>
                      </div>
                      <div
                        className="absolute top-full h-3 w-3 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[3px] bg-white/95 shadow-[0_10px_25px_rgba(15,23,42,0.12)]"
                        style={{ left: arrowLeft }}
                      />
                    </>
                  )}
                >
                <button
                  type="button"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-bold transition-all ${contextTone}`}
                  title={contextTooltip}
                >
                  <Activity size={14} />
                </button>
                </FloatingPopover>
                <div className="hidden">
                  <div className="w-64 rounded-xl border border-white/30 bg-white/95 p-3 text-xs text-gray-700 shadow-xl backdrop-blur-xl">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-bold">{getLocalText('背景信息', 'Background')}</span>
                      <span className={`font-bold ${contextPercent >= 90 ? 'text-rose-600' : contextPercent >= 75 ? 'text-amber-600' : 'text-sky-600'}`}>
                        {contextStatus ? `${contextPercent}%` : '--'}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${contextPercent >= 90 ? 'bg-rose-500' : contextPercent >= 75 ? 'bg-amber-500' : contextCompressed ? 'bg-violet-500' : 'bg-sky-500'}`}
                        style={{ width: `${contextStatus ? contextPercent : 0}%` }}
                      />
                    </div>
                    <div className="mt-2 leading-relaxed text-gray-500">
                      {contextTooltip}
                    </div>
                  </div>
                </div>
              </div>
              <FeatureTooltip
                type="webSearch"
                title={t('web_search')}
                description={getLocalText('搜索网页资料并快速返回可用结果', 'Search the web and return useful results quickly')}
              >
                <button
                  onClick={() => setConfig({ ...config, searchEnabled: !config.searchEnabled })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all shrink-0 ${config.searchEnabled ? 'bg-blue-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                >
                  <Search size={14} className={config.searchEnabled ? 'text-white' : 'text-blue-600'} />
                  {t('web_search')}
                </button>
              </FeatureTooltip>
              <FeatureTooltip
                type="deepResearch"
                title={t('deep_research')}
                description={getLocalText('联网搜索多篇资料，进行深度研究分析，生成综合报告', 'Search multiple sources, conduct deep research analysis, and generate comprehensive reports')}
              >
                <button
                  onClick={() => {
                    const nextState = !useWeb;
                    setUseWeb(nextState);
                    if (nextState) {
                      setUseTruthCheck(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all shrink-0 ${useWeb ? 'bg-green-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                >
                  <Globe size={14} className={useWeb ? 'text-white' : 'text-green-600'} />
                  {t('deep_research')}
                </button>
              </FeatureTooltip>
              <div
                className="relative shrink-0"
                onMouseEnter={() => setShowMcpStatus(true)}
                onMouseLeave={() => setShowMcpStatus(false)}
              >
                <FloatingPopover
                  width={192}
                  align="start"
                  onOpenChange={setShowMcpStatus}
                  content={({ arrowLeft }) => (
                    <>
                      <div className="bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('service_status')}</div>
                        <div className="space-y-2">
                          {mcpStatus && Object.entries(mcpStatus).length > 0 ? (
                            Object.entries(mcpStatus).map(([name, info]) => (
                              <div key={name} className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="truncate flex-1 pr-2 font-medium">{name}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`w-1.5 h-1.5 rounded-full ${info.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                                    <span className="text-gray-400">{info.connected ? t('tools_count', { count: info.toolCount }) : t('connect_fail')}</span>
                                  </div>
                                </div>
                                {info.error && !info.connected && (
                                  <div className="text-[9px] text-red-400 truncate opacity-80" title={info.error}>
                                    {info.error}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-[11px] text-gray-400 italic">{t('connecting_server')}</div>
                          )}
                        </div>
                      </div>
                      <div
                        className="absolute top-full h-3 w-3 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[3px] bg-white/90 shadow-[0_10px_25px_rgba(15,23,42,0.12)]"
                        style={{ left: arrowLeft }}
                      />
                    </>
                  )}
                >
                <button
                  onClick={async () => {
                    const hasConfig = config?.mcpConfig?.mcpServers && Object.keys(config.mcpConfig.mcpServers).length > 0;
                    if (!hasConfig) {
                      alert(t('configure_mcp_first'));
                      return;
                    }

                    const nextState = !useMcp;
                    setUseMcp(nextState);
                    if (nextState) {
                      setUseTruthCheck(false);
                    }

                    if (nextState) {
                      // 开启时立即触发后端初始化
                      try {
                        await fetch(`${backendUrl}/api/mcp/init`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mcpServers: config.mcpConfig.mcpServers })
                        });
                      } catch (e) {
                        console.error("Failed to init MCP", e);
                      }
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${useMcp ? 'bg-purple-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                  title={t('mcp_service')}
                >
                  <Server size={14} className={useMcp ? 'text-white' : 'text-purple-600'} />
                  {t('mcp_service')}
                </button>
                </FloatingPopover>

              </div>

              <div
                className="relative shrink-0"
                onMouseEnter={() => setShowSdStatus(true)}
                onMouseLeave={() => setShowSdStatus(false)}
              >
                <FloatingPopover
                  width={224}
                  align="start"
                  interactive
                  onOpenChange={setShowSdStatus}
                  content={({ arrowLeft }) => (
                    <>
                      <div className="bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                          {isStableDiffusionDrawing ? t('sd_status') : 'API Status'}
                          {activeDrawingStatus && (
                            <span className={`w-1.5 h-1.5 rounded-full ${activeDrawingStatus.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                          )}
                        </div>

                        {!activeDrawingStatus ? (
                          <div className="text-[11px] text-gray-400 italic">{t('connecting_server')}</div>
                        ) : isStableDiffusionDrawing ? (activeDrawingStatus.connected ? (
                          <div className="space-y-2">
                            <label className="block text-[10px] text-gray-400 mb-1">{t('select_model')}</label>
                            <select
                              className="w-full border border-white/20 rounded-md px-2 py-1 text-[11px] bg-white/50 outline-none focus:ring-1 focus:ring-pink-500"
                              value={config.sdModel || ''}
                              onChange={(e) => setConfig({ ...config, sdModel: e.target.value })}
                            >
                              <option value="">{t('default_model')}</option>
                              {activeDrawingStatus.models.map(m => (
                                <option key={m} value={m}>{m.split(' [')[0]}</option>
                              ))}
                            </select>
                            <div className="text-[9px] text-pink-500 font-medium">{t('drawing_model_change_tip')}</div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-red-400 bg-red-50 p-2 rounded-lg break-all">
                            {activeDrawingStatus.error || 'Stable Diffusion API is unavailable.'}
                          </div>
                        )) : (
                          <div className="space-y-2">
                            <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
                              <div className="font-semibold text-gray-700">{getDrawingProviderLabel(activeDrawingStatus.provider || config.drawingProvider)}</div>
                              <div className="mt-1 break-all text-[10px] text-gray-500">
                                Model: {activeDrawingStatus.model || config.customDrawingModel || config.drawingModel || 'not configured'}
                              </div>
                              {activeDrawingStatus.endpoint && (
                                <div className="mt-1 break-all text-[10px] text-gray-500">
                                  Endpoint: {activeDrawingStatus.endpoint}
                                </div>
                              )}
                              {typeof activeDrawingStatus.modelCount === 'number' && activeDrawingStatus.connected && (
                                <div className="mt-1 text-[10px] text-emerald-600">
                                  Available models: {activeDrawingStatus.modelCount}
                                </div>
                              )}
                            </div>
                            {activeDrawingStatus.connected ? (
                              <div className="text-[10px] text-emerald-600 font-medium">
                                API is connected and ready for drawing.
                              </div>
                            ) : (
                              <div className="text-[11px] text-red-400 bg-red-50 p-2 rounded-lg break-all">
                                {activeDrawingStatus.error || 'Drawing API is unavailable.'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div
                        className="absolute top-full h-3 w-3 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[3px] bg-white/90 shadow-[0_10px_25px_rgba(15,23,42,0.12)]"
                        style={{ left: arrowLeft }}
                      />
                    </>
                  )}
                >
                <button
                  onClick={() => {
                    const nextState = !useSd;
                    setUseSd(nextState);
                    if (nextState) {
                      setUseTruthCheck(false);
                    }
                  }}
                  disabled={config.drawingProvider === 'none'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${config.drawingProvider === 'none' ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : useSd ? 'bg-pink-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                  title={t('intelligent_drawing')}
                >
                  <Palette size={14} className={config.drawingProvider === 'none' ? 'text-gray-400' : useSd ? 'text-white' : 'text-pink-600'} />
                  {t('intelligent_drawing')}
                </button>
                </FloatingPopover>

                {false && showSdStatus && activeDrawingStatus && (
                  <div className="absolute bottom-full left-0 pb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-56 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                        {isStableDiffusionDrawing ? t('sd_status') : 'API 状态'}
                        <span className={`w-1.5 h-1.5 rounded-full ${activeDrawingStatus.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                      </div>

                      {isStableDiffusionDrawing ? (activeDrawingStatus.connected ? (
                        <div className="space-y-2">
                          <label className="block text-[10px] text-gray-400 mb-1">{t('select_model')}</label>
                          <select
                            className="w-full border border-white/20 rounded-md px-2 py-1 text-[11px] bg-white/50 outline-none focus:ring-1 focus:ring-pink-500"
                            value={config.sdModel || ''}
                            onChange={(e) => setConfig({ ...config, sdModel: e.target.value })}
                          >
                            <option value="">{t('default_model')}</option>
                            {activeDrawingStatus.models.map(m => (
                              <option key={m} value={m}>{m.split(' [')[0]}</option>
                            ))}
                          </select>
                          <div className="text-[9px] text-pink-500 font-medium">{t('drawing_model_change_tip')}</div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-red-400 bg-red-50 p-2 rounded-lg break-all">
                          {activeDrawingStatus.error || '无法连接到 SD API，请检查地址是否正确并开启了 --api'}
                        </div>
                      )) : (
                        <div className="space-y-2">
                          <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
                            <div className="font-semibold text-gray-700">{getDrawingProviderLabel(activeDrawingStatus.provider || config.drawingProvider)}</div>
                            <div className="mt-1 break-all text-[10px] text-gray-500">
                              模型：{activeDrawingStatus.model || config.customDrawingModel || config.drawingModel || '未配置'}
                            </div>
                            {activeDrawingStatus.endpoint && (
                              <div className="mt-1 break-all text-[10px] text-gray-500">
                                地址：{activeDrawingStatus.endpoint}
                              </div>
                            )}
                            {typeof activeDrawingStatus.modelCount === 'number' && activeDrawingStatus.connected && (
                              <div className="mt-1 text-[10px] text-emerald-600">
                                可用模型数：{activeDrawingStatus.modelCount}
                              </div>
                            )}
                          </div>
                          {activeDrawingStatus.connected ? (
                            <div className="text-[10px] text-emerald-600 font-medium">
                              API 连接正常，可以直接用于智能绘图。
                            </div>
                          ) : (
                            <div className="text-[11px] text-red-400 bg-red-50 p-2 rounded-lg break-all">
                              {activeDrawingStatus.error || '当前绘图 API 暂时不可用，请检查配置。'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <FeatureTooltip
                type="memory"
                title={t('memory')}
                description={getLocalText('开启长期记忆，让AI记住对话上下文和个人偏好', 'Enable long-term memory so AI remembers context and preferences')}
              >
                <button
                  onClick={() => setUseMemory(!useMemory)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${useMemory ? 'bg-purple-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                >
                  <Brain size={14} className={useMemory ? 'text-white' : 'text-purple-600'} />
                  {t('memory')}
                </button>
              </FeatureTooltip>
              <FeatureTooltip
                type="ppt"
                title={t('smart_ppt')}
                description={getLocalText('自动生成精美的PPT演示文稿', 'Automatically generate beautiful PPT presentations')}
              >
                <button
                  onClick={() => {
                    const nextState = !usePpt;
                    setUsePpt(nextState);
                    if (nextState) {
                      setUseTruthCheck(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${usePpt ? 'bg-orange-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                >
                  <Presentation size={14} className={usePpt ? 'text-white' : 'text-orange-600'} />
                  <span>{t('smart_ppt')}</span>
                </button>
              </FeatureTooltip>
              <FeatureTooltip
                type="credibility"
                title={getLocalText('智链可信度核验', 'Credibility check')}
                description={getLocalText('多维度验证信息可信度，识别虚假内容', 'Verify information credibility across multiple dimensions and identify false content')}
              >
                <button
                  onClick={() => {
                    const nextState = !useTruthCheck;
                    setUseTruthCheck(nextState);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${useTruthCheck ? 'bg-teal-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                >
                  <Share2 size={14} className={useTruthCheck ? 'text-white' : 'text-teal-600'} />
                  <span>{getLocalText('智链', 'Zhilian')}</span>
                </button>
              </FeatureTooltip>
              <FeatureTooltip
                type="storyGlass"
                description={getLocalText('把你的故事调成一张更像 Saki 的情绪特调卡，生成名字、风味、配方和适饮时刻。', 'Turn your story into a Saki-style signature drink card with a name, flavor, recipe, and perfect moment.')}
              >
                <button
                  onClick={() => {
                    if (isRecording) {
                      stopRecording();
                    }
                    onEnsureChat?.();
                    setStoryGlassReviewMessageId(null);
                    setUseStoryGlass(false);
                    setIsStoryGlassOverlayOpen(true);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                    isStoryGlassOverlayOpen
                      ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-md'
                      : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'
                  }`}
                >
                  <Sparkles size={14} className={isStoryGlassOverlayOpen ? 'text-white' : 'text-rose-500'} />
                  <span>{getLocalText('故事杯', 'Story Glass')}</span>
                </button>
              </FeatureTooltip>
              <FeatureTooltip
                type="permission"
                title={permissionMode === AGENT_PERMISSION_MODE_FULL ? getLocalText('完全访问', 'Full Access') : getLocalText('默认权限', 'Default Permission')}
                description={permissionMode === AGENT_PERMISSION_MODE_FULL
                  ? getLocalText('允许更深层的读写与系统操作', 'Allow deeper read, write, and system actions')
                  : getLocalText('保持更稳妥的默认操作范围', 'Keep a safer default action scope')}
              >
                <button
                  onClick={() => setConfig(prev => ({
                  ...prev,
                  agentPermissionMode: permissionMode === AGENT_PERMISSION_MODE_FULL
                    ? AGENT_PERMISSION_MODE_DEFAULT
                    : AGENT_PERMISSION_MODE_FULL
                }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                  permissionMode === AGENT_PERMISSION_MODE_FULL
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-emerald-600 text-white shadow-md'
                }`}
                data-title={
                  permissionMode === AGENT_PERMISSION_MODE_FULL
                    ? getLocalText('点击切换为默认权限', 'Switch to default permission')
                    : getLocalText('点击切换为完全访问权限', 'Switch to full access')
                }
              >
                <Shield size={14} className="text-white" />
                <span>
                  {permissionMode === AGENT_PERMISSION_MODE_FULL
                    ? getLocalText('完全访问', 'Full Access')
                    : getLocalText('默认权限', 'Default Permission')}
                </span>
              </button>
              </FeatureTooltip>
            </div>
            <div className="relative" ref={plusMenuRef}>
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={`p-2.5 rounded-xl transition-all ${showPlusMenu ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-blue-600 hover:bg-white/20'}`}
              >
                <Plus size={20} />
              </button>

              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2 animate-in fade-in slide-in-from-bottom-2 duration-200 z-[100]">
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      onOpenFileManager?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Server size={18} className="text-gray-400 group-hover:text-blue-500" />
                    <span className="font-bold">{t('workspace')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <HardDrive size={18} className="text-gray-400 group-hover:text-blue-500" />
                    <span className="font-bold">{t('local_files')}</span>
                  </button>
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileChange}
            />
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onFocus={(e) => {
                e.target.placeholder = '';
              }}
              onBlur={(e) => {
                if (!input) e.target.placeholder = t('ask_placeholder');
              }}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (slashSuggestions.length > 0 && e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashIndex(prev => Math.min(prev + 1, slashSuggestions.length - 1));
                  return;
                }

                if (slashSuggestions.length > 0 && e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashIndex(prev => Math.max(prev - 1, 0));
                  return;
                }

                if (slashSuggestions.length > 0 && e.key === 'Tab') {
                  e.preventDefault();
                  activateSlashCommand(slashSuggestions[slashIndex] || slashSuggestions[0]);
                  return;
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const isCommandOnly = Boolean(slashToken) && trimmedInput === slashToken;
                  if (isCommandOnly && slashSuggestions.length > 0) {
                    activateSlashCommand(slashSuggestions[slashIndex] || slashSuggestions[0]);
                    return;
                  }
                  handleSend();
                }
              }}
              placeholder={t('ask_placeholder')}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-2.5 text-sm max-h-48 text-gray-900 font-medium placeholder-gray-500"
            />
            <button
              onClick={toggleRecording}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'text-gray-500 hover:text-blue-600 hover:bg-white/20'}`}
              title={isRecording ? t('voice_stop') : t('voice_input')}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              onClick={handleSend}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${isGenerating ? 'bg-red-500/80 text-white shadow-lg' : (input.trim() || files.length > 0 ? 'bg-blue-600/80 text-white shadow-lg' : 'bg-white/20 text-gray-600')}`}
            >
              {isGenerating ? <div className="w-4 h-4 bg-white rounded-sm" /> : <Send size={20} />}
            </button>
          </div>
          <p className="text-[10px] text-center text-gray-400 mt-2">{t('ai_accuracy_tip')}</p>
        </div>
      </div>

      <DiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        fileMetadata={diffModalFile}
        onRollback={handleRollback}
      />

      <AiCustomizationModal
        isOpen={isAiCustomizationOpen}
        onClose={() => setIsAiCustomizationOpen(false)}
        config={config}
        setConfig={setConfig}
        backendUrl={backendUrl}
      />

      <MessageDiagnosticsModal
        isOpen={Boolean(diagnosticsMsg)}
        onClose={() => setDiagnosticsMsg(null)}
        message={diagnosticsMsg}
        getLocalText={getLocalText}
      />
    </div>
  );
}

function AssistantPendingCard({ mode = 'chat', status = 'pending', isGenerating, getLocalText }) {
  return (
    <div className="flex items-center justify-center py-4">
      <img 
        src="/assets/Thinking.gif" 
        alt="Thinking" 
        className="h-16 w-16 object-contain"
      />
    </div>
  );
}

function TaskTodoPanel({ todo, collapsed, onToggle, getLocalText }) {
  const items = Array.isArray(todo?.items) ? todo.items : [];
  const completedCount = items.filter(item => item.status === 'completed').length;
  const totalCount = items.length;
  const activeItem = items.find(item => item.status === 'in_progress');
  const title = todo?.title || getLocalText('任务清单', 'Task Todo');

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/30 bg-white/80 shadow-lg shadow-slate-900/10 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/70"
        title={collapsed ? getLocalText('展开任务清单', 'Expand task todo') : getLocalText('折叠任务清单', 'Collapse task todo')}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <ListChecks size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-800">{title}</span>
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              {completedCount}/{totalCount}
            </span>
          </div>
          {collapsed && activeItem && (
            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
              {activeItem.text}
            </div>
          )}
        </div>
        <div className="shrink-0 text-slate-500">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-slate-200/70 bg-white/60 px-3 py-2">
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const status = item.status || 'pending';
              const isCompleted = status === 'completed';
              const isActive = status === 'in_progress';
              return (
                <div
                  key={item.id || `${item.text}-${index}`}
                  className={`flex min-h-[2rem] items-start gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors ${
                    isActive ? 'bg-blue-50/85 text-blue-900' : isCompleted ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-blue-500 bg-blue-100 text-blue-600'
                        : 'border-slate-300 bg-white text-transparent'
                  }`}>
                    {isCompleted ? (
                      <Check size={13} strokeWidth={3} />
                    ) : isActive ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    )}
                  </span>
                  <span className={`min-w-0 flex-1 break-words leading-5 ${isCompleted ? 'line-through decoration-slate-300' : ''}`}>
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function estimateMessageTokens(message) {
  if (!message) return 0;
  let text = '';
  if (Array.isArray(message.parts)) {
    message.parts.forEach(part => {
      if (part.type === 'text') {
        text += part.content || '';
      } else if (part.type === 'action') {
        text += JSON.stringify(part.data || '') + (part.observation || '');
      }
    });
  } else if (message.content) {
    text = message.content;
  }
  
  if (!text) return 0;

  const englishWords = text.match(/[a-zA-Z0-9_]+/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const otherChars = text.length - (englishWords.join('').length + chineseChars.length);

  return Math.ceil(
    (chineseChars.length * 1.2) + 
    (englishWords.length * 1.3) + 
    (otherChars * 0.5)
  ) || 1;
}

function MessageBubbleToolbar({
  align = 'start',
  isAssistant,
  message,
  canRedo,
  canEdit,
  copied,
  speaking,
  onCopy,
  onSpeak,
  onRedo,
  onEdit,
  onDelete,
  labels,
  onOpenDiagnostics
}) {
  const tokens = isAssistant ? estimateMessageTokens(message) : 0;

  return (
    <div className={`pointer-events-none absolute -top-4 z-10 flex w-max max-w-[calc(100vw-5rem)] gap-1.5 rounded-2xl border border-white/40 bg-white/90 p-1.5 shadow-xl backdrop-blur-md opacity-100 transition-all md:opacity-0 md:translate-y-1 md:group-hover/message:translate-y-0 md:group-hover/message:opacity-100 ${align === 'end' ? 'right-3' : 'left-3'}`}>
      {isAssistant && tokens > 0 && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenDiagnostics?.();
          }}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
          title={labels.diagnostics || "查看消息诊断详细日志"}
        >
          <svg width="14" height="14" className="transform -rotate-90">
            {/* Background Circle */}
            <circle cx="7" cy="7" r="5.5" fill="transparent" stroke="#e2e8f0" strokeWidth="1.5" />
            {/* Foreground Circle */}
            <circle 
              cx="7" 
              cy="7" 
              r="5.5" 
              fill="transparent" 
              stroke={tokens > 1500 ? "#f43f5e" : tokens > 500 ? "#eab308" : "#0d9488"} 
              strokeWidth="1.5" 
              strokeDasharray="34.5"
              strokeDashoffset={34.5 - (34.5 * Math.min(1, tokens / 2000))}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[10px] text-gray-500 font-mono">{tokens}</span>
        </button>
      )}
      <ToolbarButton onClick={onCopy} label={labels.copy} icon={copied ? Check : Copy} />
      <ToolbarButton onClick={onSpeak} label={labels.read} icon={Volume2} active={speaking} />
      {canRedo && <ToolbarButton onClick={onRedo} label={labels.redo} icon={RotateCcw} />}
      {canEdit && <ToolbarButton onClick={onEdit} label={labels.edit} icon={PencilLine} />}
      <ToolbarButton onClick={onDelete} label={labels.delete} icon={Trash2} destructive />
    </div>
  );
}

function MessageDiagnosticsModal({ isOpen, onClose, message, getLocalText }) {
  if (!isOpen || !message) return null;

  let timeStr = "";
  if (Number.isFinite(message.id)) {
    timeStr = new Date(message.id).toLocaleString();
  } else {
    timeStr = new Date().toLocaleString();
  }

  let text = '';
  const actionParts = [];
  if (Array.isArray(message.parts)) {
    message.parts.forEach(part => {
      if (part.type === 'text') {
        text += part.content || '';
      } else if (part.type === 'action') {
        actionParts.push(part);
      }
    });
  } else if (message.content) {
    text = message.content;
  }

  const englishWords = text.match(/[a-zA-Z0-9_]+/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const otherChars = text.length - (englishWords.join('').length + chineseChars.length);
  const estimatedTokens = Math.ceil(
    (chineseChars.length * 1.2) + 
    (englishWords.length * 1.3) + 
    (otherChars * 0.5)
  ) || 1;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
      <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Brain size={18} />
            </div>
            <div>
              <h3 className="text-slate-800 font-bold text-sm">{getLocalText('消息运行诊断', 'Message Diagnostics')}</h3>
              <p className="text-[10px] text-slate-400 font-semibold">{getLocalText('查看该条回复的执行指标与工具日志', 'Execution stats and tool logs')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6 custom-scrollbar text-left">
          {/* Diagnostic Metrics Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/30 p-4 flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{getLocalText('生成时间', 'Creation Time')}</span>
              <span className="text-xs font-bold text-slate-700">{timeStr}</span>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/30 p-4 flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{getLocalText('生成总用时', 'Generation Duration')}</span>
              <span className="text-xs font-bold text-slate-700">
                {message.generationDurationMs 
                  ? `${(message.generationDurationMs / 1000).toFixed(2)} 秒` 
                  : getLocalText('未知 (历史消息)', 'N/A (Historical)')}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/30 p-4 flex items-center gap-3">
              <div className="relative flex items-center justify-center shrink-0">
                <svg width="36" height="36" className="transform -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="transparent" stroke="#f1f5f9" strokeWidth="2.5" />
                  <circle 
                    cx="18" 
                    cy="18" 
                    r="14" 
                    fill="transparent" 
                    stroke={estimatedTokens > 1500 ? "#f43f5e" : estimatedTokens > 500 ? "#eab308" : "#0d9488"} 
                    strokeWidth="2.5" 
                    strokeDasharray="87.9"
                    strokeDashoffset={87.9 - (87.9 * Math.min(1, estimatedTokens / 2000))}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[8px] font-bold text-slate-600">{estimatedTokens}</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">{getLocalText('Token 估算', 'Est. Tokens')}</span>
                <span className="text-[9px] font-semibold text-slate-500 mt-0.5 truncate">
                  {getLocalText(`中 ${chineseChars.length} / 英 ${englishWords.length}`, `CN ${chineseChars.length} / EN ${englishWords.length}`)}
                </span>
              </div>
            </div>
          </div>

          {/* Execution Logs */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Terminal size={12} className="text-slate-400" />
              {getLocalText('运行状态与工具调用日志', 'Operation & Tool Invocation Logs')}
            </h4>

            {actionParts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/80 p-8 text-center bg-slate-50/20">
                <p className="text-xs font-semibold text-slate-400">
                  {getLocalText('纯文本回答，此阶段没有触发工具调用。', 'Pure text reply. No tools were invoked.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {actionParts.map((part, index) => {
                  const action = part.data || {};
                  const toolName = action.tool || action.action || 'unknown';
                  const args = action.args || action.params || {};
                  const hasError = String(part.observation || '').startsWith('Error:');

                  return (
                    <div key={index} className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                      {/* Log Entry Header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-400">#{index + 1}</span>
                          <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                            {toolName}
                          </span>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          hasError ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {hasError ? getLocalText('失败', 'Failed') : getLocalText('成功', 'Success')}
                        </span>
                      </div>

                      {/* Log Details */}
                      <div className="p-4 space-y-3 text-[11px] font-normal">
                        {/* Arguments */}
                        <div>
                          <div className="text-[9px] font-semibold text-slate-400 mb-1">{getLocalText('调用参数：', 'Arguments:')}</div>
                          <pre className="rounded-xl bg-slate-900 p-3 text-[10px] text-emerald-400 overflow-x-auto font-mono max-h-[100px] custom-scrollbar">
                            {JSON.stringify(args, null, 2)}
                          </pre>
                        </div>

                        {/* Observation */}
                        {part.observation && (
                          <div>
                            <div className="text-[9px] font-semibold text-slate-400 mb-1">{getLocalText('输出结果 / 日志：', 'Observation / Output:')}</div>
                            <pre className="rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300 overflow-x-auto font-mono max-h-[140px] custom-scrollbar whitespace-pre-wrap">
                              {String(part.observation).substring(0, 1500)}
                              {String(part.observation).length > 1500 ? '\n... (truncated)' : ''}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end bg-slate-50/30">
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 text-white px-5 py-1.5 text-xs font-bold hover:bg-slate-700 active:scale-98 transition-all shadow-sm"
          >
            {getLocalText('关闭', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, label, icon: Icon, active = false, destructive = false }) {
  return (
    <button
      onClick={onClick}
      className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
        destructive
          ? 'text-rose-600 hover:bg-rose-50'
          : active
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-600 hover:bg-gray-100'
      }`}
      title={label}
    >
      <Icon size={13} className={active ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function RichCodeBlock({ language, value }) {
  const { i18n } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const localeIsZh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const label = (language || 'text').toUpperCase();
  const lineCount = String(value || '').split(/\r?\n/).length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1600);
  };

  return (
    <div className="my-5 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/95 to-slate-100/90 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/70">
      <div className="relative flex items-center justify-between border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] px-4 py-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90 shadow-[0_0_0_3px_rgba(251,113,133,0.12)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
            <FileText size={12} className="text-sky-500" />
            <span className="tracking-[0.18em] text-slate-500">{label}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>{localeIsZh ? '代码块' : 'Code Block'}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="text-slate-400">{localeIsZh ? `${lineCount} 行` : `${lineCount} lines`}</span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 ${
            isCopied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200/80 bg-white/90 text-slate-600 hover:border-sky-200 hover:bg-sky-50/80 hover:text-sky-700'
          }`}
        >
          {isCopied ? <Check size={12} /> : <Copy size={12} />}
          {isCopied ? (localeIsZh ? '已复制' : 'Copied') : (localeIsZh ? '复制' : 'Copy')}
        </button>
      </div>
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,rgba(248,250,252,0.82),rgba(241,245,249,0.94))] p-1.5">
        <div className="overflow-hidden rounded-[1.15rem] border border-white/80 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <SyntaxHighlighter
            language={language || 'text'}
            style={CHAT_CODE_THEME}
            customStyle={{
              margin: 0,
              padding: '1.1rem 1.15rem 1.2rem',
              background: 'transparent',
              fontSize: '0.82rem',
              lineHeight: 1.72
            }}
            wrapLongLines
          >
            {value}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}

function isInlineMarkdownCode({ inline, node, className, children }) {
  if (inline === true) return true;
  if (inline === false) return false;
  if (className) return false;

  const rawText = String(children || '');
  if (rawText.includes('\n')) return false;

  const startLine = node?.position?.start?.line;
  const endLine = node?.position?.end?.line;
  if (Number.isFinite(startLine) && Number.isFinite(endLine)) {
    return startLine === endLine;
  }

  return true;
}

function MessageContent({ content, isGenerating, onOpenSettings }) {
  const { t } = useTranslation();
  const [zoomImage, setZoomImage] = useState(null);
  if (!content) return null;
  let processedContent = content;

  // 1. 移除表情标记 [expression:...]，避免在聊天框显示
  processedContent = processedContent.replace(/\[expression:.*?\]/g, '');
  processedContent = processedContent
    .replace(/<\s*(?:thinking|thought|reasoning|analysis)\s*>/gi, '<think>')
    .replace(/<\s*\/\s*(?:thinking|thought|reasoning|analysis)\s*>/gi, '</think>');

  if (!processedContent.includes('<think>')) {
    const cleanThoughtMatch = processedContent.match(/(?:^|\n)\s*(?:Thought|Thinking|Reasoning|思考|思考过程)\s*[:：]\s*([\s\S]*?)(?=(?:\n\s*(?:Response|回答|Tool|Observation|结果)\s*[:：])|$)/i);
    if (cleanThoughtMatch) {
      const thoughtText = cleanThoughtMatch[1].trim();
      const rest = processedContent.replace(cleanThoughtMatch[0], '').trim();
      const cleanedRest = rest.replace(/^(?:Response|回答)\s*[:：]\s*/i, '');
      processedContent = `<think>${thoughtText}</think>${cleanedRest ? `\n${cleanedRest}` : ''}`;
    }
  }

  // 2. 增强型标识提取：处理多种思考标记并将它们统一转换为标准 <think> 标签
  if (!processedContent.includes('<think>')) {
      // 2a. 处理 Thinking.. ... ...done thinking.
      const dotsRegex = /Thinking\.\.([\s\S]*?)\.\.\.done thinking\./i;
      const dotsMatch = processedContent.match(dotsRegex);
      if (dotsMatch) {
          processedContent = processedContent.replace(dotsMatch[0], `<think>${dotsMatch[1].trim()}</think>`);
      }

      // 2b. 处理 Thought: ... Response: 结构
      const thoughtRegex = /(?:[`*]*)(?:Thought|思考|思考过程)[:：](?:[`*]*)\s*([\s\S]*?)(?=(?:\n\s*(?:[`*]*)(?:Response|回答|Tool|工具|Observation)[:：])|$)/i;
      const tMatch = processedContent.match(thoughtRegex);
      if (tMatch) {
          const thoughtText = tMatch[1].trim();
          const rest = processedContent.replace(tMatch[0], '').trim();
          const cleanedRest = rest.replace(/^(?:[`*]*)(?:Response|回答)[:：](?:[`*]*)\s*/i, '');
          if (thoughtText.includes('<think>')) {
              processedContent = `${thoughtText}\n${cleanedRest}`;
          } else {
              processedContent = `<think>${thoughtText}</think>\n${cleanedRest}`;
          }
      }
  }

  // 3. 处理流式传输中的标签不完整问题
  // 3a. 有开头无结尾：补齐结尾
  if (processedContent.includes('<think>') && !processedContent.includes('</think>')) {
    processedContent += '</think>';
  }
  // 3b. 有结尾无开头：可能来自上一个 Part 被截断，补齐开头以便解析
  if (processedContent.includes('</think>') && !processedContent.includes('<think>')) {
    processedContent = '<think>' + processedContent;
  }

  // 4. 分割内容
  const parts = processedContent.split(/(<think>[\s\S]*?<\/think>)/g);

  return (
    <div className="prose prose-sm max-w-none">
      {parts.map((part, i) => {
        const trimmedPart = part.trim();
        if (trimmedPart.startsWith('<think>')) {
          const thinkText = trimmedPart
            .replace(/^<think>/i, '')
            .replace(/<\/think>$/i, '')
            .trim();
          return <ThinkingBlock key={i} text={thinkText} />;
        }
        if (!trimmedPart) return null;

        // 5. 彻底清洗：移除残余标识
        const cleanedPart = part
          .replace(/^(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*/gmi, '')
          .replace(/\n(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*/gmi, '\n')
          .replace(/(?:[`*]*)(?:Tool|工具)[:：\s]?\w+\([\s\S]*?\)/gmi, '')
          // 移除残留的标签
          .replace(/<\/?think>/gi, '')
          .replace(/(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*$/i, '')
          .trim();

        if (!cleanedPart) return null;

        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={markdownPlugins}
            urlTransform={urlTransform}
            components={{
              p: ({ children }) => <div className="mb-4 last:mb-0 leading-relaxed">{children}</div>,
              pre: ({ children }) => <>{children}</>,
              code: ({ node, inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInlineCode = isInlineMarkdownCode({ inline, node, className, children });
                if (!isInlineCode && match && match[1] === 'mermaid') {
                  const chartCode = String(children).replace(/\n$/, '');
                  // 如果正在生成中，且代码块末尾没有明显的闭合迹象，或者长度还在剧烈变化，可以考虑暂不渲染
                  // 但 Mermaid 组件内部已经有了语法检查和延迟渲染
                  return <Mermaid chart={chartCode} />;
                }
                if (!isInlineCode) {
                  return <RichCodeBlock language={match?.[1] || ''} value={String(children).replace(/\n$/, '')} />;
                }
                return <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-sky-700" {...props}>{children}</code>;
              },
              a: ({ href, children, ...props }) => {
                if (typeof href === 'string' && href.startsWith(INTERNAL_SETTINGS_LINK_PREFIX)) {
                  return (
                    <button
                      type="button"
                      onClick={() => onOpenSettings?.()}
                      className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-200"
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-600 underline decoration-sky-300 underline-offset-4 transition-colors hover:text-sky-700"
                  >
                    {children}
                  </a>
                );
              },
              img: ({ node, ...props }) => {
                const [hover, setHover] = useState(false);
                if (!props.src) return null;
                return (
                  <div
                    className="relative group inline-block my-2 w-full"
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                  >
                    <img
                      {...props}
                      className="rounded-xl border shadow-md max-w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity bg-white"
                      style={{ minHeight: '100px', display: 'block' }}
                      onClick={() => setZoomImage(props.src)}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYjVjNWMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxsaW5lIHgxPSIzIiB5MT0iOSIgeDI9IjIxIiB5Mj0iOSIvPjxsbmUgeDE9IjkiIHkxPSIzIiB4Mj0iOSIgeTI9IjIxIi8+PC9zdmc+';
                        e.target.className = 'w-12 h-12 opacity-20 mx-auto py-8';
                      }}
                    />
                    {hover && !props.src?.includes('svg+xml') && (
                      <div className="absolute top-3 right-3 flex gap-2 animate-in fade-in zoom-in duration-200">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(props.src);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `agent-draw-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error('Download failed:', err);
                              const link = document.createElement('a');
                              link.href = props.src;
                              link.download = `agent-draw-${Date.now()}.png`;
                              link.click();
                            }
                          }}
                          className="bg-black/70 hover:bg-black/90 text-white p-2.5 rounded-full backdrop-blur-md shadow-xl transition-all"
                          title={t('download_image')}
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            }}
          >
            {cleanedPart}
          </ReactMarkdown>
        );
      })}
      {zoomImage && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
          onClick={() => setZoomImage(null)}
        >
          <button className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
            <X size={32} />
          </button>
          <img
            src={zoomImage}
            alt="Zoom"
            className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

function ThinkingBlock({ text }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  if (!text) return null;

  // 移除可能在思考块内部出现的 Response: 标记（容错）
  const cleanedText = text.replace(/(?:[`*]*)(?:Response|回答)[:：](?:[`*]*)\s*[\s\S]*$/i, '').trim();
  if (!cleanedText) return null;

  return (
    <div className="my-3 border-l-2 border-amber-200 pl-3 bg-amber-50/20 rounded-r-xl transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-amber-600/70 text-[11px] py-1.5 hover:text-amber-700 font-medium transition-colors"
      >
        <div className={`p-0.5 rounded-full bg-amber-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={12} />
        </div>
        <span>{isOpen ? t('hide_thoughts') : t('show_thoughts')}</span>
      </button>
      {isOpen && (
        <div className="text-gray-500 text-[11px] pb-3 pr-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
          <ReactMarkdown remarkPlugins={markdownPlugins}>
            {cleanedText}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function MusicFileCard({ file, onDownload }) {
  const { i18n } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const cleanupsRef = useRef([]);
  const stopTimerRef = useRef(null);
  const noiseBufferRef = useRef(null);
  const spec = file?.musicSpec;
  const summary = file?.summary || {};
  const getLocalText = (zhText, enText) => (
    String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh') ? zhText : enText
  );

  const stopPlayback = () => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    cleanupsRef.current.forEach(cleanup => {
      try {
        cleanup?.();
      } catch (error) {
        console.warn('Music preview cleanup failed', error);
      }
    });
    cleanupsRef.current = [];
    setIsPlaying(false);
  };

  useEffect(() => () => stopPlayback(), []);

  const handlePreview = async (event) => {
    event.stopPropagation();
    if (!spec?.tracks?.length) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      window.alert(getLocalText('当前浏览器不支持试听。', 'Your browser does not support preview playback.'));
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    stopPlayback();

    const secondsPerBeat = 60 / (spec.tempo || 92);
    const startAt = audioContext.currentTime + 0.05;
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioContext.destination);
    const cleanups = [() => { try { masterGain.disconnect(); } catch {} }];

    if (!noiseBufferRef.current) {
      noiseBufferRef.current = createNoiseBuffer(audioContext);
    }

    (spec.tracks || []).forEach((track) => {
      const volume = track.volume || 0.7;
      (track.notes || []).forEach((note) => {
        const noteStart = startAt + (note.startBeat || 0) * secondsPerBeat;
        const noteDuration = Math.max(0.08, (note.durationBeats || 0.25) * secondsPerBeat);

        if (track.instrument === 'drums') {
          const pitch = Array.isArray(note.pitches) ? note.pitches[0] : '';
          cleanups.push(
            ...scheduleDrumHit(
              audioContext,
              masterGain,
              pitch,
              noteStart,
              note.velocity || 0.75,
              noiseBufferRef.current
            )
          );
        } else {
          cleanups.push(
            ...scheduleSynthNote(
              audioContext,
              masterGain,
              track.instrument,
              note.pitches,
              noteStart,
              noteDuration,
              note.velocity || 0.7,
              volume
            )
          );
        }
      });
    });

    cleanupsRef.current = cleanups;
    setIsPlaying(true);
    stopTimerRef.current = window.setTimeout(() => {
      stopPlayback();
    }, Math.max(1200, ((spec.durationSeconds || 0) * 1000) + 400));
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm shrink-0">
          <Music2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-800">
            {file.name || summary.title || 'instrumental-loop.mid'}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-emerald-700">
            <span className="rounded-full bg-white/80 px-2 py-0.5">{summary.tempo || spec?.tempo || 92} BPM</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5">{summary.bars || spec?.bars || 8} bars</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5">{summary.key || spec?.key || 'Unknown key'}</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
            {(spec?.tracks || []).map(track => track.name).join(' / ')}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handlePreview}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${isPlaying ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? getLocalText('停止试听', 'Stop Preview') : getLocalText('试听', 'Preview')}
        </button>
        <button
          onClick={() => onDownload(file)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200 transition-all hover:bg-emerald-100"
        >
          <Download size={14} />
          {getLocalText('下载 MIDI', 'Download MIDI')}
        </button>
        {file.sizeLabel && (
          <span className="ml-auto text-[11px] font-semibold text-emerald-600">{file.sizeLabel}</span>
        )}
      </div>
    </div>
  );
}

function TerminalBlock({ action = {}, observation, fileMetadata, onViewChanges, onRollback, onSkipAction }) {
  const { t, i18n } = useTranslation();
  const actionType = action.type;
  const actionKind = String(actionType || '').toLowerCase();
  const actionId = action.id;
  const actionArgs = Array.isArray(action.args) ? action.args : [];
  const [skipRequested, setSkipRequested] = useState(false);
  const getLocalText = (zhText, enText) => (
    String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh') ? zhText : enText
  );
  const getFileNameFromPath = (filePath = '') => {
    const raw = String(filePath || '').trim();
    if (!raw) return getLocalText('目标', 'target');
    return raw.split(/[\\/]/).filter(Boolean).pop() || raw;
  };
  const [isExpanded, setIsExpanded] = useState(actionKind === 'draw' || actionKind === 'diagram' || actionKind === 'composemusic');
  const [isCodeExpanded, setIsCodeExpanded] = useState(() => {
    if (actionKind === 'writefile') return countTextLines(actionArgs[1] || '') <= AUTO_COLLAPSE_CODE_LINE_LIMIT;
    if (actionKind === 'editfile') return countTextLines(actionArgs[3] || '') <= AUTO_COLLAPSE_CODE_LINE_LIMIT;
    if (actionKind === 'replaceinfile') return countTextLines(actionArgs[2] || '') <= AUTO_COLLAPSE_CODE_LINE_LIMIT;
    return true;
  });
  const getLabel = () => {
    switch (actionKind) {
      case 'search': return t('search_action');
      case 'draw': return t('draw_action');
      case 'composemusic': return 'Music Composition';
      case 'terminal': return t('terminal_action');
      case 'writefile': return t('writeFile_action');
      case 'editfile': return t('editFile_action');
      case 'replaceinfile': return t('editFile_action');
      case 'readfile': return t('readFile_action');
      case 'deletefile': return t('deleteFile_action');
      case 'diagram': return t('diagram_action');
      default: return t('default_action');
    }
  };

  const getContent = () => {
    if (actionKind === 'writefile') {
      return {
        isCode: true,
        summary: `${t('path_label')}: ${actionArgs[0] || ''}`,
        content: String(actionArgs[1] || ''),
      };
    }
    if (actionKind === 'editfile') {
      const [filePath, startLine, endLine, content] = actionArgs;
      return {
        isCode: true,
        summary: `${t('path_label')}: ${filePath || ''}${startLine !== undefined && endLine !== undefined ? ` · L${startLine}-${endLine}` : ''}`,
        content: String(content || ''),
      };
    }
    if (actionKind === 'replaceinfile') {
      const [filePath, oldText, newText] = actionArgs;
      return {
        isCode: true,
        summary: `${t('path_label')}: ${filePath || ''}`,
        content: `--- oldText ---\n${String(oldText || '')}\n\n--- newText ---\n${String(newText || '')}`,
      };
    }
    if (actionKind === 'diagram') {
      return {
        isCode: false,
        summary: '',
        content: t('diagram_rendering'),
      };
    }
    return {
      isCode: false,
      summary: '',
      content: actionArgs.join(' '),
    };
  };

  const contentData = getContent();
  if (actionKind === 'editfile') {
    contentData.summary = `${t('path_label')}: ${actionArgs[0] || ''}${actionArgs[1] !== undefined && actionArgs[2] !== undefined ? ` | L${actionArgs[1]}-${actionArgs[2]}` : ''}`;
  }
  const codeLineCount = countTextLines(contentData.content);
  const shouldAutoCollapseCode = contentData.isCode && codeLineCount > AUTO_COLLAPSE_CODE_LINE_LIMIT;
  const isPending = !observation && !fileMetadata;
  const pendingLabel = (actionKind === 'editfile' || actionKind === 'replaceinfile')
    ? getLocalText(`正在编辑 ${getFileNameFromPath(actionArgs[0])} 文件...`, `Editing ${getFileNameFromPath(actionArgs[0])}...`)
    : (actionKind === 'terminal'
      ? getLocalText('正在执行终端指令...', 'Running terminal command...')
      : '');
  const canSkipAction = isPending && actionKind === 'terminal' && actionId && typeof onSkipAction === 'function';
  const handleSkip = async () => {
    if (!canSkipAction || skipRequested) return;
    setSkipRequested(true);
    const ok = await onSkipAction(actionId);
    if (!ok) {
      setSkipRequested(false);
    }
  };
  const diffStats = fileMetadata ? getDiffStats(fileMetadata) : null;
  const changeSummary = diffStats && (diffStats.added > 0 || diffStats.removed > 0)
    ? `+${diffStats.added} -${diffStats.removed}`
    : null;

  // 如果是图表，使用更简洁的样式
  if (actionKind === 'diagram' && observation) {
    return <Mermaid chart={observation} />;
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm font-mono text-sm max-w-full">
      <div className="bg-gray-50 px-4 py-2 flex items-center relative border-b">
        <div className="flex gap-1.5 cursor-pointer z-10" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-gray-500 text-xs font-sans font-medium">{getLabel()}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 z-10">
          {fileMetadata && (
            <div className="flex items-center gap-2 mr-2">
              {changeSummary && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[10px] font-semibold font-sans text-emerald-700 whitespace-nowrap">
                  {changeSummary}
                </span>
              )}
              <button
                onClick={() => onViewChanges?.(fileMetadata)}
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded text-[10px] font-sans transition-colors pointer-events-auto"
                title="查看代码差异"
              >
                <FileDiff size={12} />
                <span>{t('view_changes_action')}</span>
              </button>
              <button
                onClick={() => onRollback?.(fileMetadata)}
                className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded text-[10px] font-sans transition-colors pointer-events-auto"
                title={actionKind === 'deletefile' ? t('restore_action') : t('rollback_action')}
              >
                <Undo2 size={12} />
                <span>{actionKind === 'deletefile' ? t('restore_action_label') : t('rollback_action')}</span>
              </button>
            </div>
          )}
          <Terminal size={14} className="text-gray-400" />
        </div>
      </div>
      {isPending && pendingLabel && (
        <div className="border-b border-blue-100 bg-blue-50/80 px-4 py-2.5 font-sans text-xs text-blue-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
              {actionKind === 'terminal' ? <Terminal size={12} /> : <PencilLine size={12} />}
            </span>
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
            <span className="font-medium">{skipRequested ? getLocalText('正在请求跳过这条指令...', 'Requesting skip...') : pendingLabel}</span>
            {canSkipAction && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={skipRequested}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
              >
                <X size={12} />
                <span>{getLocalText('跳过这条指令', 'Skip command')}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="p-3 text-gray-700 whitespace-pre-wrap break-all leading-relaxed bg-gray-50/30">
        {contentData.isCode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="text-blue-500">$</span>
              <span className="break-all">{contentData.summary}</span>
              {shouldAutoCollapseCode && (
                <button
                  onClick={() => setIsCodeExpanded(!isCodeExpanded)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-sans font-medium text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600"
                >
                  <span>{isCodeExpanded ? t('collapse_code') : t('expand_code')}</span>
                  {isCodeExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  <span className="text-gray-400">{codeLineCount}</span>
                </button>
              )}
            </div>
            <div className={`relative overflow-hidden rounded-lg border border-gray-200 bg-white ${!isCodeExpanded && shouldAutoCollapseCode ? 'max-h-64' : ''}`}>
              <pre className="overflow-x-auto p-3 text-xs text-gray-700 whitespace-pre-wrap break-all leading-relaxed">{contentData.content || ''}</pre>
              {!isCodeExpanded && shouldAutoCollapseCode && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/95 to-transparent" />
              )}
            </div>
          </div>
        ) : (
          <>
            <span className="text-blue-500 mr-2">$</span>
            {contentData.content}
          </>
        )}
      </div>
      {observation && (
        <div className="border-t bg-white">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 hover:bg-gray-50 transition-colors border-b border-dashed"
          >
            <span className="flex items-center gap-1.5">
              {actionKind === 'search' ? t('view_search_results') : t('view_execution_output')}
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>
          {isExpanded && (
            <div className={`p-4 text-xs text-gray-600 bg-gray-50/50 ${actionKind === 'draw' || actionKind === 'diagram' ? 'max-h-none' : 'max-h-60'} overflow-y-auto font-sans leading-relaxed`}>
              <div className="prose prose-sm max-w-none">
                {actionKind === 'diagram' ? (
                  <Mermaid chart={observation} />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={markdownPlugins}
                    urlTransform={urlTransform}
                    components={{
                      p: ({ children }) => <div className="mb-2 last:mb-0 leading-relaxed">{children}</div>,
                      pre: ({ children }) => <>{children}</>,
                      code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInlineCode = isInlineMarkdownCode({ inline, node, className, children });
                        if (!isInlineCode && match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        if (!isInlineCode) {
                          return <RichCodeBlock language={match?.[1] || ''} value={String(children).replace(/\n$/, '')} />;
                        }
                        return <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-sky-700" {...props}>{children}</code>;
                      },
                      img: ({ node, ...props }) => {
                        const [hover, setHover] = useState(false);
                        const [localZoom, setLocalZoom] = useState(null);
                        if (!props.src) return null;
                        return (
                          <>
                            <div
                              className="relative group inline-block my-2 w-full"
                              onMouseEnter={() => setHover(true)}
                              onMouseLeave={() => setHover(false)}
                            >
                              <img
                                {...props}
                                className="rounded-xl border shadow-md max-w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity bg-white"
                                style={{ minHeight: '100px', display: 'block' }}
                                onClick={() => setLocalZoom(props.src)}
                                onError={(e) => {
                                  console.error('Image render failed. Logic observation length:', props.src?.length);
                                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYjVjNWMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxsaW5lIHgxPSIzIiB5MT0iOSIgeDI9IjIxIiB5Mj0iOSIvPjxsbmUgeDE9IjkiIHkxPSIzIiB4Mj0iOSIgeTI9IjIxIi8+PC9zdmc+';
                                  e.target.className = 'w-12 h-12 opacity-20 mx-auto py-8';
                                }}
                              />
                              {hover && !props.src?.includes('svg+xml') && (
                                <div className="absolute top-3 right-3 flex gap-2 animate-in fade-in zoom-in duration-200">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const response = await fetch(props.src);
                                        const blob = await response.blob();
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `agent-draw-${Date.now()}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        URL.revokeObjectURL(url);
                                      } catch (err) {
                                        console.error('Download failed:', err);
                                        const link = document.createElement('a');
                                        link.href = props.src;
                                        link.download = `agent-draw-${Date.now()}.png`;
                                        link.click();
                                      }
                                    }}
                                    className="bg-black/70 hover:bg-black/90 text-white p-2.5 rounded-full backdrop-blur-md shadow-xl transition-all"
                                    title={t('download_image')}
                                  >
                                    <Download size={18} />
                                  </button>
                                </div>
                              )}
                            </div>
                            {localZoom && ReactDOM.createPortal(
                              <div
                                className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
                                onClick={() => setLocalZoom(null)}
                              >
                                <button className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
                                  <X size={32} />
                                </button>
                                <img
                                  src={localZoom}
                                  alt="Zoom"
                                  className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-300"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>,
                              document.body
                            )}
                          </>
                        );
                      }
                    }}
                  >
                    {observation}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



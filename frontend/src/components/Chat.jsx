import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { diffLines } from 'diff';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Send, Plus, Paperclip, ChevronDown, ChevronUp, Bot, User, Terminal, Square, Search, Globe, Server, Palette, Download, Activity, Share2, Copy, Volume2, RotateCcw, Check, X, FileDiff, Undo2, HardDrive, Brain, Presentation, Mic, MicOff, FileText, Shield, Music2, Play, Pause, Trash2, PencilLine, Sparkles } from 'lucide-react';
import CredibilityCheckView from './CredibilityCheckView';
import DeepReadingView from './DeepReadingView';
import PPTView from './PPTView';
import Mermaid from './Mermaid';
import DiffModal from './DiffModal';
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
    case 'permission':
      return <PermissionTooltipScene />;
    default:
      return null;
  }
}

const FeatureTooltip = ({ children, description, type = 'default' }) => {
  const theme = FEATURE_TOOLTIP_THEMES[type] || FEATURE_TOOLTIP_THEMES.default;
  const hasScene = type === 'webSearch' || type === 'deepResearch' || type === 'memory' || type === 'ppt' || type === 'credibility' || type === 'permission';
  const scene = <TooltipScene type={type} />;

  if (!hasScene) {
    return children;
  }

  return (
    <div className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-4 w-[18rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 translate-y-2 scale-95 opacity-0 invisible transition-all duration-300 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
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
        <div className={`absolute left-1/2 top-full h-4 w-4 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[4px] shadow-[0_10px_25px_rgba(15,23,42,0.24)] ${theme.arrow}`} />
      </div>
    </div>
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
    background: '#f8fafc',
    margin: 0,
    padding: 0,
    borderRadius: '1rem'
  },
  'code[class*="language-"]': {
    ...(oneLight['code[class*="language-"]'] || {}),
    fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", monospace'
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

export default function Chat({
  messages,
  onSend,
  isGenerating,
  onStop,
  backendUrl,
  containerRef,
  config,
  setConfig,
  onDeepDataUpdate,
  activeDeepReadingData,
  onRedo,
  onDeleteMessage,
  onEditMessage,
  onOpenFileManager,
  onOpenSettings,
  externalFile,
  onExternalFileClear,
  composerPreset,
  onComposerPresetConsumed
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
  const [files, setFiles] = useState([]);
  const [useWeb, setUseWeb] = useState(false);
  const [useMcp, setUseMcp] = useState(false);
  const [useSd, setUseSd] = useState(false);
  const [useMemory, setUseMemory] = useState(false);
  const [usePpt, setUsePpt] = useState(false);
  const [useTruthCheck, setUseTruthCheck] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const plusMenuRef = useRef(null);
  const dragDepthRef = useRef(0);
  const textareaRef = useRef(null);
  const trimmedInput = input.trimStart();
  const slashToken = trimmedInput.startsWith('/') ? (trimmedInput.split(/\s+/)[0] || '').toLowerCase() : '';
  const slashSuggestions = slashToken && !trimmedInput.includes(' ')
    ? SLASH_COMMANDS.filter(command => {
        const allTokens = [command.trigger, ...(command.aliases || [])];
        return allTokens.some(token => token.startsWith(slashToken))
          || command.id.includes(slashToken.replace('/', ''));
      })
    : [];

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

  const [mcpStatus, setMcpStatus] = useState(null);
  const [sdStatus, setSdStatus] = useState(null);
  const [drawingApiStatus, setDrawingApiStatus] = useState(null);
  const [sovitsStatus, setSovitsStatus] = useState(null);
  const [showMcpStatus, setShowMcpStatus] = useState(false);
  const [showSdStatus, setShowSdStatus] = useState(false);
  const [showSovitsStatus, setShowSovitsStatus] = useState(false);
  const [diffModalFile, setDiffModalFile] = useState(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const prevMessageCountRef = useRef(0);

  const handleRollback = async (fileMetadata) => {
    if (!window.confirm(t('file_rollback_confirm', { filename: fileMetadata.filePath.split(/[\\\/]/).pop() }))) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: fileMetadata.filePath,
          before: fileMetadata.before
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
      return nextOptions;
    }

    if (commandId === 'ppt') {
      nextOptions.usePpt = true;
      nextOptions.useWeb = false;
      nextOptions.useSd = false;
      nextOptions.useTruthCheck = false;
      return nextOptions;
    }

    if (commandId === 'deep') {
      nextOptions.useWeb = true;
      nextOptions.usePpt = false;
      nextOptions.useSd = false;
      nextOptions.useTruthCheck = false;
      nextOptions.useSearch = true;
      return nextOptions;
    }

    if (commandId === 'truth') {
      nextOptions.useTruthCheck = true;
      nextOptions.usePpt = false;
      nextOptions.useWeb = false;
      nextOptions.useSd = false;
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
    }

    if (command.id === 'ppt') {
      setUsePpt(true);
      setUseWeb(false);
      setUseSd(false);
      setUseTruthCheck(false);
    }

    if (command.id === 'deep') {
      setUseWeb(true);
      setUsePpt(false);
      setUseSd(false);
      setUseTruthCheck(false);
    }

    if (command.id === 'truth') {
      setUseTruthCheck(true);
      setUseWeb(false);
      setUsePpt(false);
      setUseSd(false);
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
      useTruthCheck
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

    if (config.ttsProvider === 'gpt-sovits') {
      setReadingIdx(idx);
      try {
        const langMap = { 'zh-CN': 'zh', 'en-US': 'en', 'ja': 'ja', 'fr': 'fr' };
        const lang = langMap[i18n.language] || 'zh';

        const payload = {
          text: text,
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
        
        audio.onended = () => {
          setReadingIdx(null);
          URL.revokeObjectURL(url);
          window.currentSovitsAudio = null;
        };
        audio.onerror = (e) => {
          console.error("Audio playback error", e);
          setReadingIdx(null);
        };
        await audio.play();

      } catch (err) {
        console.error('SoVITS TTS Error:', err);
        setReadingIdx(null);
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          alert('无法连接到 GPT-SoVITS 服务。请确保已通过 start.bat 或手动启动服务，并检查设置中的 API 地址是否正确（默认 http://127.0.0.1:9880）。');
        } else {
          alert('GPT-SoVITS 错误: ' + err.message);
        }
      }
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setReadingIdx(null);
      setReadingIdx(idx);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleRedoAction = async (idx) => {
    if (onRedo) {
      await onRedo(idx);
    }
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
      <div
        id="chat-messages-container"
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 relative custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border border-gray-100">
                <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{t('welcome_title')}</h2>
              <p className="text-gray-500 mt-2">{t('welcome_desc')}</p>
            </div>
          </div>
        )}
        {messages.map((m, idx) => {
          const isAssistant = m.role === 'assistant';
          const hasAssistantText = Array.isArray(m.parts) && m.parts.some(
            part => part.type === 'text' && part.content.replace(/\[expression:.*?\.png\]/g, '').trim()
          );
          const hasAssistantContent = hasAssistantText
            || (Array.isArray(m.parts) && m.parts.some(part => part.type === 'action'))
            || Boolean(m.deepReadingData)
            || Boolean(m.pptData)
            || Boolean(m.credibilityCheckData)
            || (Array.isArray(m.generatedFiles) && m.generatedFiles.length > 0);
          const showPendingState = isAssistant && !hasAssistantContent;
          const hideToolbar = isAssistant && isGenerating && idx === messages.length - 1 && showPendingState;

          return (
            <div key={m.id || idx} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {isAssistant && (
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200">
                  <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
                </div>
              )}
              <div className={`relative max-w-[85%] group/message ${m.role === 'user' ? 'order-1' : ''}`}>
                {!hideToolbar && (
                  <MessageBubbleToolbar
                    align={m.role === 'user' ? 'end' : 'start'}
                    canRedo={isAssistant}
                    canEdit={m.role === 'user'}
                    copied={copiedIdx === idx}
                    speaking={readingIdx === idx}
                    onCopy={() => copyToClipboard(idx, m)}
                    onSpeak={() => speakText(idx, m)}
                    onRedo={() => handleRedoAction(idx)}
                    onEdit={() => onEditMessage?.(idx)}
                    onDelete={() => onDeleteMessage?.(idx)}
                    labels={{
                      copy: copiedIdx === idx ? t('copied') : t('copy'),
                      read: readingIdx === idx ? t('listening') : t('listen'),
                      redo: t('redo'),
                      edit: getLocalText('编辑', 'Edit'),
                      delete: t('delete')
                    }}
                  />
                )}

                <div className={`rounded-2xl p-4 transition-all hover:translate-y-[-1px] hover:shadow-lg ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md rounded-tr-none rounded-2xl p-4'
                    : showPendingState
                      ? ''
                      : 'bg-white/95 border border-gray-100 shadow-sm backdrop-blur-md rounded-tl-none rounded-2xl p-4'
                }`}>
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
                          {Array.isArray(m.generatedFiles) && m.generatedFiles.length > 0 && (
                            <div className="mt-4 flex flex-col gap-2">
                              {m.generatedFiles.map((file, fileIdx) => (
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
            <div className="flex w-full flex-wrap gap-2 mb-1 px-1 shrink-0 pb-1" data-onboarding-id="chat-mode-bar">
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

                {showMcpStatus && mcpStatus && (
                  <div className="absolute bottom-full left-0 pb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-48 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('service_status')}</div>
                      <div className="space-y-2">
                        {Object.entries(mcpStatus).length > 0 ? (
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
                  </div>
                )}
              </div>

              <div
                className="relative shrink-0"
                onMouseEnter={() => setShowSdStatus(true)}
                onMouseLeave={() => setShowSdStatus(false)}
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

                {showSdStatus && activeDrawingStatus && (
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

function MessageBubbleToolbar({
  align = 'start',
  canRedo,
  canEdit,
  copied,
  speaking,
  onCopy,
  onSpeak,
  onRedo,
  onEdit,
  onDelete,
  labels
}) {
  return (
    <div className={`pointer-events-none absolute -top-4 z-10 flex w-max max-w-[calc(100vw-5rem)] gap-1.5 rounded-2xl border border-white/40 bg-white/90 p-1.5 shadow-xl backdrop-blur-md opacity-100 transition-all md:opacity-0 md:translate-y-1 md:group-hover/message:translate-y-0 md:group-hover/message:opacity-100 ${align === 'end' ? 'right-3' : 'left-3'}`}>
      <ToolbarButton onClick={onCopy} label={labels.copy} icon={copied ? Check : Copy} />
      <ToolbarButton onClick={onSpeak} label={labels.read} icon={Volume2} active={speaking} />
      {canRedo && <ToolbarButton onClick={onRedo} label={labels.redo} icon={RotateCcw} />}
      {canEdit && <ToolbarButton onClick={onEdit} label={labels.edit} icon={PencilLine} />}
      <ToolbarButton onClick={onDelete} label={labels.delete} icon={Trash2} destructive />
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1600);
  };

  return (
    <div className="my-4 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/95 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-slate-300">
            {label}
          </span>
          <span className="text-[11px] text-slate-400">
            {localeIsZh ? '代码块' : 'Code Block'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
        >
          {isCopied ? <Check size={12} /> : <Copy size={12} />}
          {isCopied ? (localeIsZh ? '已复制' : 'Copied') : (localeIsZh ? '复制' : 'Copy')}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={CHAT_CODE_THEME}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.82rem',
          lineHeight: 1.7
        }}
        wrapLongLines
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageContent({ content, isGenerating, onOpenSettings }) {
  const { t } = useTranslation();
  const [zoomImage, setZoomImage] = useState(null);
  if (!content) return null;
  let processedContent = content;

  // 1. 移除表情标记 [expression:...]，避免在聊天框显示
  processedContent = processedContent.replace(/\[expression:.*?\]/g, '');

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
              code: ({ node, inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                if (!inline && match && match[1] === 'mermaid') {
                  const chartCode = String(children).replace(/\n$/, '');
                  // 如果正在生成中，且代码块末尾没有明显的闭合迹象，或者长度还在剧烈变化，可以考虑暂不渲染
                  // 但 Mermaid 组件内部已经有了语法检查和延迟渲染
                  return <Mermaid chart={chartCode} />;
                }
                if (!inline) {
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

function TerminalBlock({ action, observation, fileMetadata, onViewChanges, onRollback }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(action.type === 'draw' || action.type === 'diagram' || action.type === 'composeMusic');
  const [isCodeExpanded, setIsCodeExpanded] = useState(() => {
    const args = Array.isArray(action.args) ? action.args : [];
    if (action.type === 'writeFile') return countTextLines(args[1] || '') <= AUTO_COLLAPSE_CODE_LINE_LIMIT;
    if (action.type === 'editFile') return countTextLines(args[3] || '') <= AUTO_COLLAPSE_CODE_LINE_LIMIT;
    return true;
  });
  const getLabel = () => {
    switch (action.type) {
      case 'search': return t('search_action');
      case 'draw': return t('draw_action');
      case 'composeMusic': return 'Music Composition';
      case 'terminal': return t('terminal_action');
      case 'writeFile': return t('writeFile_action');
      case 'editFile': return t('editFile_action');
      case 'readFile': return t('readFile_action');
      case 'deleteFile': return t('deleteFile_action');
      case 'diagram': return t('diagram_action');
      default: return t('default_action');
    }
  };

  const getContent = () => {
    const args = Array.isArray(action.args) ? action.args : [];
    if (action.type === 'writeFile') {
      return {
        isCode: true,
        summary: `${t('path_label')}: ${args[0] || ''}`,
        content: String(args[1] || ''),
      };
    }
    if (action.type === 'editFile') {
      const [filePath, startLine, endLine, content] = args;
      return {
        isCode: true,
        summary: `${t('path_label')}: ${filePath || ''}${startLine !== undefined && endLine !== undefined ? ` · L${startLine}-${endLine}` : ''}`,
        content: String(content || ''),
      };
    }
    if (action.type === 'diagram') {
      return {
        isCode: false,
        summary: '',
        content: t('diagram_rendering'),
      };
    }
    return {
      isCode: false,
      summary: '',
      content: args.join(' '),
    };
  };

  const contentData = getContent();
  if (action.type === 'editFile') {
    contentData.summary = `${t('path_label')}: ${actionArgs[0] || ''}${actionArgs[1] !== undefined && actionArgs[2] !== undefined ? ` | L${actionArgs[1]}-${actionArgs[2]}` : ''}`;
  }
  const codeLineCount = countTextLines(contentData.content);
  const shouldAutoCollapseCode = contentData.isCode && codeLineCount > AUTO_COLLAPSE_CODE_LINE_LIMIT;
  const diffStats = fileMetadata ? getDiffStats(fileMetadata) : null;
  const changeSummary = diffStats && (diffStats.added > 0 || diffStats.removed > 0)
    ? `+${diffStats.added} -${diffStats.removed}`
    : null;

  // 如果是图表，使用更简洁的样式
  if (action.type === 'diagram' && observation) {
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
                title={action.type === 'deleteFile' ? t('restore_action') : t('rollback_action')}
              >
                <Undo2 size={12} />
                <span>{action.type === 'deleteFile' ? t('restore_action_label') : t('rollback_action')}</span>
              </button>
            </div>
          )}
          <Terminal size={14} className="text-gray-400" />
        </div>
      </div>
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
              {action.type === 'search' ? t('view_search_results') : t('view_execution_output')}
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>
          {isExpanded && (
            <div className={`p-4 text-xs text-gray-600 bg-gray-50/50 ${action.type === 'draw' || action.type === 'diagram' ? 'max-h-none' : 'max-h-60'} overflow-y-auto font-sans leading-relaxed`}>
              <div className="prose prose-sm max-w-none">
                {action.type === 'diagram' ? (
                  <Mermaid chart={observation} />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={markdownPlugins}
                    urlTransform={urlTransform}
                    components={{
                      p: ({ children }) => <div className="mb-2 last:mb-0 leading-relaxed">{children}</div>,
                      code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        if (!inline) {
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

import React, { useEffect, useState } from 'react';
import { findCapabilityMention, insertCapabilityMention } from '../utils/capabilityMentions';

export default function CapabilityMentions({ input, setInput, backendUrl, config, textareaRef, getLocalText }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const match = findCapabilityMention(input, cursor);
  const open = Boolean(match) && !dismissed;
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const update = () => { setCursor(textarea.selectionStart); setDismissed(false); setIndex(0); };
    textarea.addEventListener('select', update);
    textarea.addEventListener('click', update);
    textarea.addEventListener('input', update);
    return () => {
      textarea.removeEventListener('select', update);
      textarea.removeEventListener('click', update);
      textarea.removeEventListener('input', update);
    };
  }, [textareaRef]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`${backendUrl}/api/capabilities`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const names = new Set([...data.mcp, ...Object.keys(config?.mcpConfig?.mcpServers || {})]);
        setItems([
          ...[...names].map(name => ({ token: `@mcp:${encodeURIComponent(name)}`, label: `MCP · ${name}` })),
          ...data.skills.map(skill => ({ token: `@skill:${encodeURIComponent(skill.id)}`, label: `Skill · ${skill.name}` })),
        ]);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, backendUrl, config?.mcpConfig]);
  const query = (match?.[1] || '').toLowerCase();
  const suggestions = items.filter(item => `${item.label} ${item.token}`.toLowerCase().includes(query));
  const choose = item => {
    const replacement = insertCapabilityMention(input, cursor, item.token);
    if (!replacement) return;
    setInput(replacement.text);
    setDismissed(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(replacement.cursor, replacement.cursor);
    });
  };
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!open || !textarea) return;
    const keydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') setDismissed(true);
      else if (event.key === 'ArrowDown') setIndex(value => Math.min(value + 1, suggestions.length - 1));
      else if (event.key === 'ArrowUp') setIndex(value => Math.max(0, value - 1));
      else if (suggestions.length) choose(suggestions[index] || suggestions[0]);
    };
    textarea.addEventListener('keydown', keydown);
    return () => textarea.removeEventListener('keydown', keydown);
  });
  if (!open) return null;
  return <div className="saki-popup absolute bottom-full left-0 right-0 sm:left-3 sm:right-3 mb-3 max-h-[min(45dvh,16rem)] overflow-y-auto rounded-2xl border border-[var(--control-border)] bg-[var(--popup-bg)] p-2 z-[120]" role="listbox" aria-label="MCP / Skills">
    <p className="p-2 text-xs">{getLocalText('选择本条消息使用的 MCP / Skills（可多选）', 'Select MCP / Skills for this message (multiple allowed)')}</p>
    {loading && <p role="status">{getLocalText('加载中…', 'Loading…')}</p>}
    {error && <p role="alert">{getLocalText('加载失败：', 'Loading failed: ')}{error}</p>}
    {!loading && !error && !suggestions.length && <p>{getLocalText('没有匹配项，请先在扩展中心配置 MCP 或启用 Skill。', 'No matches. Configure MCP or enable a Skill in Extensions.')}</p>}
    {suggestions.map((item, i) => <button type="button" role="option" aria-selected={i === index} key={item.token} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)} className={`block w-full rounded-xl p-2 text-left ${i === index ? 'bg-pink-500/15' : ''}`}>{item.label}</button>)}
  </div>;
}

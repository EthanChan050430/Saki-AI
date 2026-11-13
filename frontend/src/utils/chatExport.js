import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function chatMarkdown(messages, baseUrl) {
  const sections = messages.filter(m => ['user', 'assistant'].includes(m.role)).map((m, index) => {
    const text = (m.parts?.filter(p => p.type === 'text').map(p => p.content).join('\n\n') || m.content || '')
      .replace(/\[expression[:=][^\]]+\]/g, '').trim();
    const drawings = (m.parts || []).filter(p => p.type === 'action' && p.data?.type === 'draw')
      .map(p => p.observation || '').filter(value => /!\[/.test(value));
    const files = (m.attachedFiles || []).map(file => {
      const url = new URL(`/uploads/${encodeURIComponent(file.name)}`, baseUrl).href;
      const label = String(file.name).replace(/[\[\]\\]/g, '\\$&');
      return `${file.isImage ? '!' : ''}[${label}](${url})`;
    });
    const report = m.deepReadingData?.reportMarkdown || m.credibilityCheckData?.reportMarkdown || '';
    const generated = (m.generatedFiles || []).filter(f => f.downloadUrl).map(f => {
      const url = new URL(f.downloadUrl, baseUrl).href;
      const image = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(f.name || url) || /illustration/.test(f.kind || '');
      return `${image ? '!' : ''}[${String(f.name || 'Attachment').replace(/[\[\]\\]/g, '\\$&')}](${url})`;
    });
    const story = m.storyGlassData;
    const storyContent = story ? [story.cocktailName, story.storySummary, story.flavorDescription,
      story.coverImageUrl ? `![Illustration](${new URL(story.coverImageUrl, baseUrl).href})` : ''].filter(Boolean).join('\n\n') : '';
    return `## ${index + 1}. ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${[text, ...drawings, report, storyContent, ...files, ...generated].filter(Boolean).join('\n\n')}`;
  });
  return `# Conversation\n\n${sections.join('\n\n---\n\n')}\n`;
}

export async function exportConversation(messages, format, backendUrl) {
  const baseUrl = new URL(backendUrl || '/', window.location.href).href;
  const markdown = chatMarkdown(messages, baseUrl);
  let blob;
  if (format === 'md') {
    blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  } else {
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      urlTransform: url => /^data:image\/(png|jpeg|webp|gif);base64,/i.test(url) ? url : defaultUrlTransform(url),
    }, markdown));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const image of doc.images) {
      const source = new URL(image.getAttribute('src'), baseUrl);
      if (!['http:', 'https:', 'data:'].includes(source.protocol)) throw new Error('Unsupported image URL');
      const response = await fetch(source.href, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Image download failed (${response.status}): ${image.alt}`);
      const imageBlob = await response.blob();
      if (!/^image\/(png|jpeg|webp|gif)$/.test(imageBlob.type)) throw new Error(`Unsupported image format: ${imageBlob.type}`);
      image.src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(imageBlob);
      });
    }
    const response = await fetch(`${backendUrl}/api/chat/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, html: doc.body.innerHTML }),
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Export failed');
    blob = await response.blob();
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `conversation-${Date.now()}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

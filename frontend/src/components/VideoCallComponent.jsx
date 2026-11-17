import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { localize as l } from '../utils/localize'
import { callContentUrl, callImageUrl } from '../utils/videoCallPanels'

const markdownPlugins = [remarkGfm]
const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ node, ...props }) => props.src ? <img {...props} loading="lazy" referrerPolicy="no-referrer" /> : null,
}

function Artifact({ file, backendUrl }) {
  const [preview, setPreview] = useState(null)
  const query = `?path=${encodeURIComponent(file.filePath)}`
  useEffect(() => {
    if (/\.(png|jpe?g|webp|gif)$/i.test(file.filePath)) return
    const controller = new AbortController()
    fetch(`${backendUrl}/api/video-call/artifact${query}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data && !controller.signal.aborted) setPreview({ filePath: file.filePath, backendUrl, text: data.preview }) })
      .catch(() => {})
    return () => controller.abort()
  }, [backendUrl, file.filePath, query])
  return <>
    {/\.(png|jpe?g|webp|gif)$/i.test(file.filePath) && <img src={`${backendUrl}/api/video-call/artifact${query}`} alt={file.filename || l('Saki 展示的图片', 'Image shared by Saki', 'Saki が共有した画像')} />}
    {preview?.filePath === file.filePath && preview.backendUrl === backendUrl && preview.text && <p className="call-panel-body">{preview.text}</p>}
    <a className="call-panel-chip" href={`${backendUrl}/api/files/download${query}`}><Download size={16} />{l('下载文件', 'Download file', 'ファイルをダウンロード')}</a>
  </>
}

export default function VideoCallComponent(props) {
  // Providers may replace a component while retaining its id. Remount the
  // content for a new payload so slides, form values and previews start fresh.
  return <ComponentPanel key={JSON.stringify(props.component)} {...props} />
}

function ComponentPanel({ component, side, visible, hidden, backendUrl, onClose, onReply }) {
  return <section className={`call-panel call-panel-${side > 0 ? 'left' : 'right'} ${visible ? 'is-visible' : ''}`}
    aria-label={component.title} hidden={hidden} inert={visible && !hidden ? undefined : ''}>
    {onClose && <button type="button" className="call-panel-close" onClick={onClose} aria-label={l('关闭组件', 'Close shared content', '共有内容を閉じる')}><X size={18} /></button>}
    <div className="call-panel-content">
      <ContentBody component={component} backendUrl={backendUrl} onReply={onReply} />
    </div>
  </section>
}

function ContentBody({ component, backendUrl, onReply }) {
  const [slide, setSlide] = useState(0)
  const imageUrl = component.type === 'image' ? callImageUrl(component.url) : ''
  return <>
      {component.body && (component.type === 'markdown'
        ? <div className="call-panel-markdown"><ReactMarkdown remarkPlugins={markdownPlugins} skipHtml urlTransform={callContentUrl} components={markdownComponents}>{component.body}</ReactMarkdown></div>
        : <p className="call-panel-body">{component.body}</p>)}
      {component.type === 'content' && component.blocks?.map((block, index) => <div className="call-panel-block" key={index}>
        {block.title && block.title !== '分享内容' && <h4 className="call-panel-block-title">{block.title}</h4>}
        <ContentBody component={block} backendUrl={backendUrl} onReply={onReply} />
      </div>)}
      {component.type === 'choice' && <div className="call-panel-options">
        {component.options.map((label, index) => <button key={index} type="button" className="call-panel-chip" onClick={() => onReply(label)}>{label}</button>)}
      </div>}
      {component.type === 'question' && <form className="call-panel-form" onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        onReply(component.fields.map((field, index) => `${field}：${values.get(String(index))}`).join('\n'))
      }}>
        {component.fields.map((label, index) => <label key={index}>{label}<input name={String(index)} required maxLength={600} /></label>)}
        <button type="submit" className="call-panel-chip">{l('回答', 'Reply', '回答する')}</button>
      </form>}
      {component.type === 'table' && <div className="call-panel-table"><table>
        <thead><tr>{component.columns.map((cell, i) => <th key={i} scope="col">{cell}</th>)}</tr></thead>
        <tbody>{component.rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
      </table></div>}
      {imageUrl && <img src={imageUrl} referrerPolicy="no-referrer" alt={component.title} />}
      {component.type === 'slides' && <>
        <div className="call-panel-slide">
          <h4>{component.slides[slide].title}</h4>
          <ul>{component.slides[slide].bullets.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </div>
        <nav aria-label={l('幻灯片翻页', 'Slide navigation', 'スライド操作')}>
          <button type="button" disabled={!slide} onClick={() => setSlide(slide - 1)} aria-label={l('上一页', 'Previous slide', '前のスライド')}><ChevronLeft size={20} /></button>
          <span>{slide + 1} / {component.slides.length}</span>
          <button type="button" disabled={slide + 1 === component.slides.length} onClick={() => setSlide(slide + 1)} aria-label={l('下一页', 'Next slide', '次のスライド')}><ChevronRight size={20} /></button>
        </nav>
      </>}
      {component.type === 'artifact' && <Artifact file={component.file} backendUrl={backendUrl} />}
  </>
}

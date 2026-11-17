import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ArrowDown } from 'lucide-react'
import { captionTail } from '../utils/videoCallSpeech'
import { localize as l } from '../utils/localize'
import botAvatar from '../head.png'

const defaultUserAvatar = `${import.meta.env.BASE_URL}assets/head_user.png`

function DialogueMessage({ entry, interim = false, aiAvatar, userAvatar }) {
  if (!entry.content && !entry.attachedFiles?.length && !entry.generatedFiles?.length) return null
  const user = entry.role === 'user'
  const fallbackAvatar = user ? defaultUserAvatar : botAvatar
  const avatar = (user ? userAvatar : aiAvatar) || fallbackAvatar
  return <article className={`call-dialogue-message is-${user ? 'user' : 'assistant'}${interim ? ' is-interim' : ''}`} aria-label={user ? l('你', 'You', 'あなた') : 'Saki'}>
    <span className="call-dialogue-avatar" aria-hidden="true">
      <img src={avatar} alt="" onError={event => {
        if (event.currentTarget.getAttribute('src') !== fallbackAvatar) event.currentTarget.src = fallbackAvatar
      }} />
    </span>
    <div className="call-dialogue-bubble">
      {entry.content && <p>{entry.content}</p>}
      {entry.attachedFiles?.length > 0 && <span className="call-dialogue-files">{entry.attachedFiles.map(file => file.name).join(' · ')}</span>}
      {entry.generatedFiles?.length > 0 && <span className="call-dialogue-files">{entry.generatedFiles.map(file => file.name || file.filename || l('生成文件', 'Generated file', '生成ファイル')).join(' · ')}</span>}
    </div>
  </article>
}

export default function VideoCallCaptions({ caption, interim, turns, liveReply, aiAvatar, userAvatar }) {
  const [expanded, setExpanded] = useState(false)
  const [following, setFollowing] = useState(true)
  const scroll = useRef(null), follow = useRef(true), toggle = useRef(null)
  const regionId = useId()
  const latest = turns.at(-1)
  const isUser = Boolean(interim) || (caption?.speaker ? caption.speaker === 'user' : latest?.role === 'user')
  const speaker = isUser ? l('你', 'You', 'あなた') : caption?.speaker || 'Saki'
  const preview = interim || captionTail(caption?.text, 180) || latest?.content || ''
  const entries = [...turns, ...(liveReply ? [{ role: 'assistant', content: liveReply }] : [])]

  useLayoutEffect(() => {
    if (expanded && follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [expanded, turns, liveReply, interim])
  useEffect(() => {
    if (!expanded || !scroll.current) return
    const observer = new ResizeObserver(() => {
      if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
    })
    observer.observe(scroll.current)
    return () => observer.disconnect()
  }, [expanded])

  const changeExpanded = () => {
    follow.current = true
    setFollowing(true)
    setExpanded(value => !value)
  }
  const jumpToLatest = () => {
    follow.current = true
    setFollowing(true)
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }
  if (!preview && !entries.length) return null
  return <div className={`call-caption${expanded ? ' is-expanded' : ''}`}>
    <button ref={toggle} type="button" className="call-caption-toggle" aria-expanded={expanded} aria-controls={regionId}
      aria-label={expanded ? l('收起通话对话', 'Collapse call transcript', '通話履歴を閉じる') : l('展开全部通话对话', 'Expand call transcript', '通話履歴を開く')} onClick={changeExpanded}>
      {expanded ? <ChevronDown size={17} /> : <>
        <span className="call-caption-summary"><b>{speaker}</b><span className="call-caption-preview" aria-live="polite">{preview}</span></span>
        <ChevronUp size={15} />
      </>}
    </button>
    {expanded && <>
      <div ref={scroll} id={regionId} className="call-caption-history" role="region" aria-label={l('完整通话对话', 'Call transcript', '通話履歴')} tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); setExpanded(false); toggle.current?.focus()
          }
        }}
        onScroll={event => {
          const node = event.currentTarget
          follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32
          setFollowing(follow.current)
        }}>
        {entries.map((entry, index) => <DialogueMessage key={index} entry={entry} aiAvatar={aiAvatar} userAvatar={userAvatar} />)}
        {interim && <DialogueMessage entry={{ role: 'user', content: interim }} userAvatar={userAvatar} interim />}
      </div>
      {!following && <button type="button" className="call-caption-latest" onClick={jumpToLatest}><ArrowDown size={13} />{l('回到最新', 'Jump to latest', '最新の発言へ')}</button>}
    </>}
  </div>
}

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Bot, CameraOff, Check, Globe, Keyboard, Maximize, Maximize2, Minimize, Minimize2, MessageSquare, Mic, MicOff, Moon, Paperclip, PhoneOff, Square, Sun, Video, X } from 'lucide-react'
import VideoCallComponent from './VideoCallComponent'
import VideoCallCaptions from './VideoCallCaptions'
import { createVideoCallMotion } from '../utils/videoCallMotion'
import { createVideoCallQuality } from '../utils/videoCallQuality'
import { callPointerPosition, callTouchRegion } from '../utils/videoCallPointer'
import { createVideoCallVoice } from '../utils/videoCallVoice'
import { createSpeechPipeline, createSpeechSegmenter, toSpokenText } from '../utils/videoCallSpeech'
import { startCallMic } from '../utils/videoCallMic'
import { monitorCallMicLevel } from '../utils/videoCallMicLevel'
import { showCallPanels, closeCallPanels, callPanelPosition } from '../utils/videoCallPanels'
import { callContextHistory, restoredComponentHistory, boundedComponentHistory, componentChanges, applyCallActivity, appendCallText, settleCallActivities } from '../utils/videoCallContext'
import { isChatProviderEnabled } from '../utils/chatProviderConfig'
import { normalizeCopilotModelName } from '../utils/modelRefresh'
import { readSSEStream } from '../utils/sseStream'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../utils/useMediaQuery'
import { localizeWith } from '../utils/localize'
import { activeUiLanguage, uiLanguages } from '../utils/uiLanguageOptions'
import botAvatar from '../head.png'
import { startCallRingtone } from '../utils/videoCallRingtone'
import { changeSakiLang } from '../i18n'
import '../styles/videoCall.css'

const base = import.meta.env.BASE_URL
const callRooms = { light: `${base}assets/video-call/room-day.webp`, dark: `${base}assets/video-call/room.webp` }
const languageTag = code => code?.startsWith('ja') ? 'ja-JP' : code?.startsWith('en') ? 'en-US' : 'zh-CN'
const plainText = value => String(value || '').replace(/\[expression\s*:[^\]]*\]/gi, '')
const dialogueText = value => plainText(value).replace(/[*#`_~]/g, '').trim()
const fileLimit = 8 * 1024 * 1024
const modelKey = (provider, name) => JSON.stringify([provider, name])
const normalizedModel = (provider, name) => provider === 'copilot' ? normalizeCopilotModelName(name) : name
const compactCallQuery = `${MOBILE_BREAKPOINT_QUERY}, (max-width: 1024px) and (pointer: coarse)`
const panelSides = ['left', 'right']
const micPermission = ['请允许浏览器使用麦克风。', 'Allow microphone access in your browser.', 'ブラウザーでマイクへのアクセスを許可してください。']
const callMicErrors = {
  'not-allowed': micPermission,
  'audio-capture': ['无法读取麦克风，请检查设备连接或使用键盘。', 'Could not read the microphone. Check the device or use the keyboard.', 'マイクを使用できません。接続を確認するか、キーボードを使ってください。'],
  unsupported: ['当前浏览器不支持语音识别。可使用键盘，或在设置中选择服务器识别。', 'This browser does not support speech recognition. Use the keyboard or select Server recognition in Settings.', 'このブラウザーは音声認識に対応していません。キーボードを使うか、設定でサーバー音声認識を選んでください。'],
  'server-unavailable': ['服务器语音识别不可用。可在设置中切换到浏览器识别。', 'Server speech recognition is unavailable. You can switch to browser recognition in Settings.', 'サーバー音声認識を利用できません。設定でブラウザー音声認識に切り替えられます。'],
}
const browserMicUnavailable = ['浏览器语音识别暂不可用。可重新开启麦克风重试，或使用键盘。', 'Browser speech recognition is unavailable. Turn the microphone back on to retry or use the keyboard.', 'ブラウザー音声認識を利用できません。マイクをオンにして再試行するか、キーボードを使ってください。']

function CallButton({ label, icon: Icon, art, disabled, pressed, kind, off, onClick, micMeter = false }) {
  return <button type="button" className={`call-action ${kind || ''}`} title={label} aria-label={label}
    aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    <span className={`call-action-icon ${off ? 'is-off' : ''}`}>
      {micMeter && !off ? <span className="call-mic-glyph" aria-hidden="true">
        <span className="call-mic-capsule"><span className="call-mic-fill" /></span>
        <Mic size={22} strokeWidth={1.65} />
      </span> : <Icon size={22} strokeWidth={1.65} />}
      {art && <img alt="" src={`${base}assets/video-call/${art}.webp`} onError={event => { event.currentTarget.hidden = true }} />}
    </span>
    <span>{label}</span>
  </button>
}

export default function VideoCall({ config, micMode, modelLabel, models, backendUrl, language, theme, messages, sessionId, onTurn, onClose, onToggleTheme }) {
  const { t } = useTranslation()
  const l = (zh, en, ja) => localizeWith(language, zh, en, ja)
  const lang = languageTag(language)
  const activeLanguage = activeUiLanguage(language)
  // Turns are written to the chat as they complete, so every message needs an id
  // that survives re-renders and the final hang-up replay.
  const call = useRef(sessionId || `call-${Date.now()}`)
  const order = useRef(0)
  const [selected, setSelected] = useState(() => ({
    provider: config.provider || 'ollama', model: config.model || 'llama3',
  }))
  const [panels, setPanels] = useState({ left: null, right: null })
  const [panelReady, setPanelReady] = useState(false)
  const [sheetSide, setSheetSide] = useState('left')
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const compact = useMediaQuery(compactCallQuery)
  const [quality] = useState(() => createVideoCallQuality({
    compact,
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    saveData: navigator.connection?.saveData,
    downlink: navigator.connection?.downlink,
    rtt: navigator.connection?.rtt,
    startBalanced: true,
  }))
  const panelTarget = callPanelPosition(panels, compact)
  const activeSide = panels[sheetSide] ? sheetSide : sheetSide === 'left' ? 'right' : 'left'
  const activePanel = panels[activeSide]
  const dualPanels = Boolean(panels.left && panels.right)
  const [additionalModels, setAdditionalModels] = useState([])
  const [requestedModels, setRequestedModels] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [mic, setMic] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [camera, setCamera] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [phase, setPhase] = useState('listening')
  const [caption, setCaption] = useState(null)
  const [callTurns, setCallTurns] = useState([])
  const [liveReply, setLiveReply] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [avatarReady, setAvatarReady] = useState(false)
  const ringtoneRef = useRef(null)
  const dialog = useRef(null), stage = useRef(null), avatar = useRef(null), cameraVideo = useRef(null), picker = useRef(null), composer = useRef(null)
  const fullscreenExitAt = useRef(-Infinity)
  const updateMicLevel = level => dialog.current?.style.setProperty('--call-mic-level', `${Math.round(level * 100)}%`)
  const runtime = useRef(null)
  runtime.current ??= { phase: 'listening', turn: null, mic: true, camera: null, requestingCamera: false, heard: -Infinity, alive: true, uploads: null,
    panels: { left: null, right: null }, panelReady: false, compact, panelTarget: 0,
    // Component events outlive a single turn: restoring them from chat records
    // keeps an earlier table or slide deck retrievable after a refresh.
    componentHistory: restoredComponentHistory(messages), eventSequence: 0 }
  const history = useRef(null), transcript = useRef([])
  // The whole supplied conversation stays available for retrieval; the backend
  // decides how much of it enters the prompt.
  history.current ??= callContextHistory(messages)
  const sendRef = useRef(null), interruptRef = useRef(null)
  const motion = useMemo(() => createVideoCallMotion(), [])
  const scenePointer = useRef(null)
  const voice = useMemo(() => createVideoCallVoice({ config, backendUrl }), [config, backendUrl])
  useLayoutEffect(() => {
    const state = runtime.current
    quality.setCompact(compact)
    state.compact = compact
    state.theme = theme
    if (panelTarget === state.panelTarget) return
    state.panelTarget = panelTarget
    state.panelReady = false
    setPanelReady(false)
    motion.present(panelTarget)
  }, [compact, motion, panelTarget, quality, theme])

  useEffect(() => {
    const viewport = window.visualViewport
    const callDialog = dialog.current
    if (!compact || !viewport || !callDialog) return
    const sync = () => {
      if (viewport.scale !== 1) return
      callDialog.style.setProperty('--call-viewport-height', `${viewport.height}px`)
      callDialog.style.setProperty('--call-viewport-top', `${viewport.offsetTop}px`)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      callDialog.style.removeProperty('--call-viewport-height')
      callDialog.style.removeProperty('--call-viewport-top')
    }
  }, [compact])
  const busy = phase !== 'listening'
  const setCallPhase = next => { runtime.current.phase = next; setPhase(next) }
  const options = [...new Map([...(models || []), ...additionalModels].filter(model => isChatProviderEnabled(config, model.provider))
    .map(model => [modelKey(model.provider, model.name), model])).values()]
  const selectedKey = modelKey(selected.provider, normalizedModel(selected.provider, selected.model))
  if (!options.some(model => modelKey(model.provider, model.name) === selectedKey)) {
    options.unshift({ provider: selected.provider, name: normalizedModel(selected.provider, selected.model), label: selected.model === config.model ? modelLabel : selected.model })
  }
  const currentOption = options.find(model => modelKey(model.provider, model.name) === selectedKey)
  const currentModelLabel = currentOption?.label?.replace(/\s+\(current\)$/i, '') || currentOption?.name || selected.model
  const [openMenu, setOpenMenu] = useState(null)
  const modelDropdownOpen = openMenu === 'model'
  const languageMenuOpen = openMenu === 'language'
  const modelMenuRef = useRef(null)
  const languageMenuRef = useRef(null)
  const languageMenuId = useId()
  const activeMenuRef = languageMenuOpen ? languageMenuRef : modelMenuRef

  function closeMenu() {
    activeMenuRef.current?.querySelector('button')?.focus()
    setOpenMenu(null)
  }

  useEffect(() => {
    if (!openMenu) return
    const handleClickOutside = event => {
      if (!activeMenuRef.current?.contains(event.target)) setOpenMenu(null)
    }
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      activeMenuRef.current?.querySelector('button')?.focus()
      setOpenMenu(null)
    }
    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu, activeMenuRef])

  const [previewPos, setPreviewPos] = useState(null)
  const [previewZoomed, setPreviewZoomed] = useState(false)
  const previewRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!camera) {
      setPreviewZoomed(false)
    }
  }, [camera])

  const handlePreviewPointerDown = event => {
    if (event.target.closest('button')) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const el = previewRef.current
    const stageEl = stage.current
    if (!el || !stageEl) return

    const rect = el.getBoundingClientRect()
    const stageRect = stageEl.getBoundingClientRect()
    const currentX = rect.left - stageRect.left
    const currentY = rect.top - stageRect.top

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentX,
      originY: currentY,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      previewWidth: rect.width,
      previewHeight: rect.height,
    }
    try { el.setPointerCapture(event.pointerId) } catch { /* ignore */ }
  }

  const handlePreviewPointerMove = event => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    const minX = 8
    const maxX = Math.max(minX, drag.stageWidth - drag.previewWidth - 8)
    const minY = 8
    const maxY = Math.max(minY, drag.stageHeight - drag.previewHeight - 8)

    const nextX = Math.min(Math.max(minX, drag.originX + dx), maxX)
    const nextY = Math.min(Math.max(minY, drag.originY + dy), maxY)

    setPreviewPos({ x: nextX, y: nextY })
  }

  const handlePreviewPointerUp = event => {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      try { previewRef.current?.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
      dragRef.current = null
    }
  }

  useEffect(() => {
    if (!previewPos || !stage.current || !previewRef.current) return
    const clampPos = () => {
      const stageEl = stage.current
      const el = previewRef.current
      if (!stageEl || !el) return
      const sRect = stageEl.getBoundingClientRect()
      const pRect = el.getBoundingClientRect()
      const maxX = Math.max(8, sRect.width - pRect.width - 8)
      const maxY = Math.max(8, sRect.height - pRect.height - 8)
      setPreviewPos(pos => {
        if (!pos) return pos
        const clampedX = Math.min(Math.max(8, pos.x), maxX)
        const clampedY = Math.min(Math.max(8, pos.y), maxY)
        if (clampedX === pos.x && clampedY === pos.y) return pos
        return { x: clampedX, y: clampedY }
      })
    }
    const raf = requestAnimationFrame(clampPos)
    window.addEventListener('resize', clampPos)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', clampPos)
    }
  }, [previewPos, previewZoomed])

  useEffect(() => {
    if (!requestedModels) return
    const controller = new AbortController()
    fetch(`${backendUrl}/api/video-call/models`, {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
    }).then(response => response.ok ? response.json() : [])
      .then(items => {
        if (!controller.signal.aborted && Array.isArray(items)) setAdditionalModels(items.filter(item => item?.id && item?.provider)
          .map(item => ({ ...item, name: normalizedModel(item.provider, item.id) })))
      }).catch(() => {})
    return () => controller.abort()
  }, [backendUrl, config, requestedModels])

  function recordPanelChange(before, after, source) {
    const state = runtime.current
    const changes = componentChanges(before, after, { id: `panel-${++state.eventSequence}`, at: Date.now(), source })
    if (!changes.length) return
    state.componentHistory = boundedComponentHistory([...state.componentHistory, ...changes])
    const turn = state.turn
    if (turn && !turn.finished && typeof turn.snapshot === 'function') {
      turn.pendingEvents = boundedComponentHistory([...turn.pendingEvents, ...changes])
      turn.snapshot()
    }
  }

  function updatePanels(next, source = 'agent') {
    const state = runtime.current
    const previous = state.panels
    const added = panelSides.find(side => next[side] && next[side] !== previous[side])
    if (added) setSheetSide(added)
    if (!next.left && !next.right) setSheetExpanded(false)
    state.panels = next
    setPanels(next)
    recordPanelChange(previous, next, source)
  }

  function showComponent(component, source = 'agent') {
    updatePanels(showCallPanels(runtime.current.panels, component), source)
  }

  function closeComponent(side = 'all', source = 'agent') {
    updatePanels(closeCallPanels(runtime.current.panels, side), source)
  }

  function finishTurn(turn, answer = turn.reply, status = 'done') {
    if (turn.finished) return
    turn.finished = true
    const content = dialogueText(answer)
    const text = content || turn.parts.filter(part => part.type === 'text').map(part => part.content).join('')
    const hasPayload = Boolean(text.trim() || turn.generatedFiles.size || turn.parts.some(part => part.type === 'action'))
    if (status === 'cancelled' && !hasPayload) {
      setLiveReply('')
      return
    }
    const assistant = {
      role: 'assistant', id: turn.assistantId, content: text,
      parts: turn.parts, status, revision: ++turn.revision, videoCall: true,
      generatedFiles: [...turn.generatedFiles.values()],
      ...(turn.pendingEvents.length ? { videoCallContext: { componentHistory: boundedComponentHistory(turn.pendingEvents) } } : {}),
    }
    transcript.current.push(assistant)
    setCallTurns([...transcript.current])
    setLiveReply('')
    // The call keeps the full conversation for later retrieval; the backend
    // bounds what actually reaches the model.
    history.current = [...history.current,
      { id: turn.user.id, role: 'user', content: turn.user.content },
      { id: assistant.id, role: 'assistant', content: text,
        ...(turn.parts.some(part => part.type === 'action') && { summary: turn.parts.filter(part => part.type === 'action')
          .map(part => `${part.data?.type || 'tool'}: ${String(part.observation || '').slice(0, 8000)}`).join('\n') }) },
    ].slice(-500)
    // Hand the turn to the chat that opened the call instead of buffering it
    // until hang-up, so the messages also survive a refresh or a crash.
    onTurn?.([turn.user, assistant])
  }

  function cancelTurn() {
    const state = runtime.current
    const turn = state.turn
    if (!turn) return
    state.turn = null
    turn.parts = settleCallActivities(turn.parts, 'cancelled')
    turn.controller.abort()
    finishTurn(turn, turn.reply, 'cancelled')
    setCaption(null)
    setCallPhase('listening')
  }
  interruptRef.current = cancelTurn

  function hangUp() {
    const state = runtime.current
    cancelTurn()
    state.alive = false
    state.uploads?.abort()
    onClose(transcript.current)
  }

  useEffect(() => {
    if (avatarReady) return undefined
    const ringtone = startCallRingtone()
    ringtoneRef.current = ringtone
    return () => {
      ringtone.stop()
      if (ringtoneRef.current === ringtone) ringtoneRef.current = null
    }
  }, [avatarReady])

  useEffect(() => {
    const state = runtime.current
    state.alive = true
    const node = dialog.current
    if (!node.open) node.showModal()
    void voice.prime()
    let connectedAt = null
    let raf, warmVoice, nextPose = -Infinity, lastStatus = -Infinity, isAvatarReady = false
    const markAvatarReady = () => {
      if (isAvatarReady || !state.alive) return
      isAvatarReady = true
      ringtoneRef.current?.playConnected()
      ringtoneRef.current = null
      connectedAt = Date.now()
      setElapsed(0)
      setAvatarReady(true)
      warmVoice = setTimeout(() => { void voice.warm() }, 1500)
    }
    const clock = setInterval(() => {
      if (connectedAt !== null) setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    }, 1000)
    const readyFallback = setTimeout(markAvatarReady, 8000)
    const message = event => {
      if (event.origin !== location.origin || event.source !== avatar.current?.contentWindow) return
      if (event.data?.type === 'saki-call-ready') markAvatarReady()
      if (event.data?.type === 'saki-call-walk-ready') motion.loadWalkProfiles(event.data.profiles)
      if (event.data?.type === 'saki-call-reactions-ready') motion.loadReactionClips(event.data.durations)
    }
    window.addEventListener('message', message)
    const resetFrames = () => { quality.reset(); nextPose = -Infinity }
    document.addEventListener('visibilitychange', resetFrames)
    const animate = now => {
      const level = quality.sample(now)
      if (node.dataset.callQuality !== level) node.dataset.callQuality = level
      if (now + 1 >= nextPose && avatar.current?.contentWindow) {
        const speech = state.phase === 'speaking' ? voice.level(now) : null
        const pose = motion.tick(now, {
          phase: state.phase, turnId: state.turn?.assistantId, ...speech, heard: now - state.heard < 550,
        })
        if ((state.panels.left || state.panels.right) && pose.presented && !state.panelReady) {
          state.panelReady = true
          setPanelReady(true)
        }
        avatar.current.contentWindow.postMessage({
          type: 'saki-call-motion', pose, compact: state.compact, theme: state.theme,
          quality: level, compactAssets: quality.compactAssets, thinking: state.phase === 'thinking',
        }, location.origin)
        nextPose = Math.max(now + quality.interval / 2, nextPose + quality.interval)
      }
      if (!isAvatarReady && now - lastStatus >= 450 && avatar.current?.contentWindow) {
        avatar.current.contentWindow.postMessage({ type: 'saki-call-status' }, location.origin)
        lastStatus = now
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => {
      state.alive = false
      clearInterval(clock)
      clearTimeout(readyFallback)
      clearTimeout(warmVoice)
      cancelAnimationFrame(raf)
      window.removeEventListener('message', message)
      document.removeEventListener('visibilitychange', resetFrames)
      state.turn?.controller.abort()
      state.uploads?.abort()
      state.camera?.getTracks().forEach(track => track.stop())
      voice.close()
      if (document.fullscreenElement && node.contains(document.fullscreenElement)) void document.exitFullscreen().catch(() => {})
      if (node.open) node.close()
    }
  }, [motion, quality, voice])

  useEffect(() => {
    let wasFullscreen = false
    const sync = () => {
      const active = document.fullscreenElement === stage.current
      if (wasFullscreen && !active) fullscreenExitAt.current = performance.now()
      wasFullscreen = active
      setFullscreen(active)
    }
    document.addEventListener('fullscreenchange', sync)
    sync()
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        if (!stage.current?.requestFullscreen) throw new Error('unsupported')
        await stage.current.requestFullscreen()
      }
    } catch {
      if (runtime.current.alive) setError(['无法进入全屏，请检查浏览器的全屏权限。', 'Full screen is unavailable. Check your browser permissions.', '全画面表示を利用できません。ブラウザーの権限を確認してください。'])
    }
  }

  async function upload(selection) {
    const state = runtime.current
    if (state.uploads) return
    const available = Array.from(selection).slice(0, 4 - files.length)
    if (!available.length) return
    if (available.some(file => file.size > fileLimit)) {
      setError(['单个文件最多 8 MB。', 'Files must be 8 MB or smaller.', 'ファイルの上限は 1 件あたり 8 MB です。'])
      return
    }
    const controller = new AbortController()
    state.uploads = controller
    setUploading(true)
    setError('')
    try {
      const results = []
      for (const file of available) {
        const form = new FormData()
        const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
        form.append('file', file, `${id}-${file.name}`)
        const response = await fetch(`${backendUrl}/api/upload`, { method: 'POST', body: form, signal: controller.signal })
        if (!response.ok) throw new Error(l('文件上传失败。', 'Could not upload the file.', 'ファイルをアップロードできませんでした。'))
        const data = await response.json()
        results.push({ id, name: file.name, path: data.path, isImage: data.isImage, content: String(data.content || '').slice(0, 12000) })
      }
      if (state.alive) setFiles(current => [...current, ...results].slice(0, 4))
    } catch (problem) {
      if (state.alive && !controller.signal.aborted) setError(problem.message)
    } finally {
      if (state.uploads === controller) state.uploads = null
      if (state.alive) setUploading(false)
    }
  }

  async function toggleCamera() {
    const state = runtime.current
    if (state.camera) {
      state.camera.getTracks().forEach(track => track.stop())
      state.camera = null
      if (cameraVideo.current) cameraVideo.current.srcObject = null
      setCamera(false)
      return
    }
    if (state.requestingCamera) return
    state.requestingCamera = true
    let stream = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          throw new Error('当前不是安全上下文（HTTPS 或 localhost），浏览器已禁用摄像头 API。请使用 HTTPS 或在本地通过 localhost 访问。')
        }
        throw new Error('当前浏览器不支持或未启用摄像头媒体接口（navigator.mediaDevices.getUserMedia）。')
      }
      try {
        const constrained = quality.level !== 'full'
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: constrained ? 480 : 640 },
            frameRate: { ideal: constrained ? 18 : 24, max: constrained ? 20 : 30 },
          },
        })
      } catch (constraintErr) {
        if (constraintErr?.name === 'OverconstrainedError' || constraintErr?.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        } else {
          throw constraintErr
        }
      }
      if (!state.alive) { stream.getTracks().forEach(track => track.stop()); return }
      state.camera = stream
      if (cameraVideo.current) {
        cameraVideo.current.srcObject = stream
        cameraVideo.current.play?.().catch(() => {})
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (state.alive && state.camera === stream) { state.camera = null; setCamera(false) }
      }, { once: true })
      setCamera(true)
      setError('')
    } catch (err) {
      console.error('Camera toggle error:', err)
      if (stream) {
        try { stream.getTracks().forEach(track => track.stop()) } catch {}
      }
      state.camera = null
      if (state.alive) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          setError(['当前连接不是安全上下文（HTTPS 或 localhost），浏览器已禁用摄像头。请使用 https:// 或在本地通过 localhost 访问。', 'Use HTTPS or localhost to enable the camera.', 'カメラを使うには HTTPS または localhost で開いてください。'])
        } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setError(['无法打开摄像头：未授予摄像头权限，请在浏览器地址栏左侧网站设置中允许摄像头访问后重试。', 'Allow camera access in your browser’s site settings, then try again.', 'ブラウザーのサイト設定でカメラを許可してから、もう一度お試しください。'])
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          setError(['无法打开摄像头：未检测到摄像头设备，请检查硬件是否正常连接。', 'No camera found. Check that it is connected.', 'カメラが見つかりません。接続を確認してください。'])
        } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
          setError(['无法打开摄像头：设备可能已被其他应用程序（如微信、OBS、Zoom 等）占用，请先关闭其他程序后重试。', 'The camera may be in use by another app. Close it and try again.', '別のアプリがカメラを使用している可能性があります。閉じてからお試しください。'])
        } else if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
          setError(['无法打开摄像头：摄像头不支持当前分辨率或参数，请重试。', 'The camera does not support the requested settings. Try again.', 'カメラが要求された設定に対応していません。もう一度お試しください。'])
        } else {
          setError(err?.message || ['无法打开摄像头，请检查浏览器权限。', 'Could not open the camera. Check your browser permissions.', 'カメラを開けませんでした。ブラウザーの権限を確認してください。'])
        }
      }
    } finally {
      state.requestingCamera = false
    }
  }

  function captureFrame() {
    const video = cameraVideo.current
    if (!runtime.current.camera || !video?.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(640, video.videoWidth)
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  function shareFrame() {
    if (files.length >= 4) return
    const canvas = captureFrame()
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob && runtime.current.alive) void upload([new File([blob], l('通话画面.jpg', 'Call frame.jpg', '通話画像.jpg'), { type: 'image/jpeg' })])
    }, 'image/jpeg', .85)
  }

  async function send(value, fromMic = false) {
    const state = runtime.current
    const message = String(value || '').trim()
    if ((!message && !files.length) || (state.uploads && !message)) return
    cancelTurn()
    void voice.prime()
    setCallPhase('thinking')
    setInterim('')
    setError('')
    if (!fromMic) setText('')
    const sentFiles = files
    setFiles([])
    const user = { role: 'user', id: `${call.current}-${order.current}-u`, content: message || l('请看看我分享的附件。', 'Please look at the files I shared.', '共有したファイルを見てください。'), attachedFiles: sentFiles, videoCall: true, revision: 1 }
    const controller = new AbortController()
    const turn = { controller, user, order: order.current++, spoken: [], reply: '', generatedFiles: new Map(),
      parts: [], pendingEvents: [], revision: 0, status: 'streaming', finished: false, assistantId: `${call.current}-${order.current}-a` }
    state.turn = turn
    // Mirrored chat activity: every action and observation is written the same way
    // an ordinary Agent turn writes them, so the chat renders its normal tool UI.
    let snapshotAt = 0, snapshotTimer = null
    turn.snapshot = (status = turn.status, { force = false } = {}) => {
      turn.status = status
      const now = performance.now()
      if (!force && now - snapshotAt < 350) {
        if (!snapshotTimer) snapshotTimer = setTimeout(() => { snapshotTimer = null; turn.snapshot(turn.status, { force: true }) }, 360)
        return
      }
      snapshotAt = now
      const content = turn.parts.filter(part => part.type === 'text').map(part => part.content).join('')
      onTurn?.([{ role: 'assistant', id: turn.assistantId, content, parts: turn.parts.map(part => ({ ...part })),
        status: turn.status, revision: ++turn.revision, videoCall: true,
        generatedFiles: [...turn.generatedFiles.values()],
        ...(turn.pendingEvents.length ? { videoCallContext: { componentHistory: boundedComponentHistory(turn.pendingEvents) } } : {}) }])
    }
    turn.snapshot('streaming', { force: true })
    setCallPhase('thinking')
    setCaption({ speaker: 'user', text: user.content })
    transcript.current.push(user)
    setCallTurns([...transcript.current])
    setLiveReply('')
    // The user's line reaches the chat immediately so the streaming tool activity
    // appears under the message that caused it.
    onTurn?.([user])
    motion.command(message)
    let reply = '', streamError = ''
    const active = () => state.alive && !controller.signal.aborted && state.turn === turn
    let lastPreview = -Infinity, previewTimer = null
    const publishPreview = () => {
      previewTimer = null
      if (!active()) return
      lastPreview = performance.now()
      setLiveReply(dialogueText(reply))
    }
    const onToolEvent = event => {
      turn.parts = applyCallActivity(turn.parts, event)
      turn.snapshot('streaming')
    }
    // Synthesis runs ahead of playback, so a sentence is being prepared while the
    // previous one is still being heard. The caption accumulates instead of being
    // replaced, so the sentence currently being read never disappears.
    let spokenCaption = ''
    const pipeline = createSpeechPipeline({
      synthesize: fragment => voice.synthesize(fragment, controller.signal, lang),
      play: async (buffer, fragment) => {
        if (!active()) return
        setCallPhase('speaking')
        spokenCaption = spokenCaption ? `${spokenCaption}${fragment}` : fragment
        setCaption({ speaker: 'Saki', text: spokenCaption })
        motion.react(fragment)
        const played = await voice.playPrepared(buffer, fragment, controller.signal, lang)
        if (!active()) return
        turn.spoken.push(fragment)
        if (!played) {
          setError(['语音播放不可用，仍可使用字幕。', 'Voice playback is unavailable. Captions are still available.', '音声を再生できません。字幕で確認できます。'])
        }
      },
    })
    // Speak each segment as soon as it is complete, rather than waiting for the
    // whole answer: the first clause is enough to start talking. Emoji and
    // kaomoji stay in the chat record but never reach the speech engine.
    const segmenter = createSpeechSegmenter({
      onSegment: fragment => {
        const speech = toSpokenText(fragment)
        if (speech) pipeline.push(speech)
      },
    })
    try {
      const response = await fetch(`${backendUrl}/api/video-call/reply`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, files: sentFiles,
          history: history.current,
          componentState: state.panels,
          componentHistory: boundedComponentHistory(state.componentHistory),
          cameraEnabled: Boolean(state.camera),
          language: lang,
          config: { ...config, ...selected },
        }),
      })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || l('Saki 暂时连不上。', 'Could not connect to Saki.', 'Saki に接続できませんでした。'))
      await readSSEStream(response, async event => {
        if (!active()) return true
        if (event.error) { streamError = event.error; return true }
        if (event.cameraRequest) {
          const image = captureFrame()?.toDataURL('image/jpeg', .78) || null
          await fetch(`${backendUrl}/api/video-call/camera`, {
            method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: event.cameraRequest, image }),
          }).catch(() => {})
        }
        if (event.action || Object.hasOwn(event, 'observation') || event.fileMetadata) onToolEvent(event)
        if (event.closeComponent) closeComponent(event.closeComponent)
        if (event.component) showComponent(event.component)
        if (event.generatedFile?.filePath) {
          const file = event.generatedFile
          turn.generatedFiles.set(file.filePath, file)
          showComponent({ id: `file-${file.filePath}`, type: 'artifact', title: file.name || file.filename || file.filePath.split(/[\\/]/).at(-1), file })
        }
        if (typeof event.text === 'string') {
          reply += event.text
          turn.reply = reply
          turn.parts = appendCallText(turn.parts, event.text)
          const remaining = (quality.level === 'full' ? 65 : 120) - (performance.now() - lastPreview)
          if (remaining <= 0) {
            clearTimeout(previewTimer)
            publishPreview()
          } else if (previewTimer === null) previewTimer = setTimeout(publishPreview, remaining)
          turn.snapshot('streaming')
          segmenter.push(event.text)
        }
        return false
      })
      if (streamError) throw new Error(streamError)
      if (!reply.trim() && active()) throw new Error(l('模型没有返回对白，请重试。', 'The model did not reply. Try again.', '応答がありませんでした。もう一度お試しください。'))
      clearTimeout(previewTimer)
      publishPreview()
      segmenter.flush()
      await pipeline.done
      if (active()) finishTurn(turn, reply, 'done')
    } catch (problem) {
      if (active()) {
        setError(problem.message)
        const interrupted = controller.signal.aborted
        turn.parts = settleCallActivities(turn.parts, interrupted ? 'cancelled' : 'error')
        if (!reply.trim() && !turn.generatedFiles.size && !turn.parts.some(part => part.type === 'action')) {
          // Nothing was said or done: withdraw the user line from the chat and put
          // it back in the composer so it can be sent again.
          turn.finished = true
          clearTimeout(snapshotTimer)
          onTurn?.([{ ...turn.user, removed: true, revision: (turn.user.revision || 1) + 1 }])
          setText(message)
          if (state.compact && !fromMic) setComposerOpen(true)
          setFiles(current => [...sentFiles, ...current].slice(0, 4))
          if (transcript.current.at(-1) === user) transcript.current.pop()
          setCallTurns([...transcript.current])
          setLiveReply('')
        } else finishTurn(turn, reply, interrupted ? 'cancelled' : 'error')
        controller.abort()
      }
    } finally {
      clearTimeout(snapshotTimer)
      clearTimeout(previewTimer)
      if (state.turn === turn) {
        state.turn = null
        if (state.alive) setCallPhase('listening')
      }
    }
  }
  sendRef.current = send

  useEffect(() => {
    if (!mic) return
    const state = runtime.current
    const controller = new AbortController()
    const { signal } = controller
    let stream, stopMeter
    const isListening = () => !signal.aborted && state.alive && state.mic
    const disable = reason => {
      if (!isListening()) return
      state.mic = false
      controller.abort()
      setMic(false)
      setError(callMicErrors[reason] || browserMicUnavailable)
    }
    async function openMic() {
      try {
        stream = await navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      } catch (error) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          disable('not-allowed')
          return
        }
      }
      if (!isListening()) {
        stream?.getTracks().forEach(track => track.stop())
        return
      }
      startCallMic({
        mode: micMode, stream, backendUrl, base, lang, signal,
        speakerLevel: () => state.phase === 'speaking' ? Math.max(.15, voice.level(performance.now()).voice) : 0,
        isEcho: value => voice.isEcho(value),
        onSpeech: (draft = '', final = false) => {
          if (!isListening()) return
          state.heard = performance.now()
          const draftLength = draft.replace(/[^\p{L}\p{N}]/gu, '').length
          if (state.turn && (final || (state.phase !== 'speaking' && draftLength >= 2))) interruptRef.current()
        },
        onDraft: value => { if (isListening()) setInterim(value) },
        onText: value => { if (isListening()) void sendRef.current(value, true) },
        onError: disable,
      })
      if (stream && isListening()) {
        stopMeter = monitorCallMicLevel(stream, level => { if (isListening()) updateMicLevel(level) })
      }
    }
    void openMic()
    return () => {
      controller.abort()
      stopMeter?.()
      updateMicLevel(0)
      stream?.getTracks().forEach(track => track.stop())
      setInterim('')
    }
  }, [mic, micMode, lang, voice, backendUrl])

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const switchMic = () => {
    if (!mic) { void voice.prime(); setError('') }
    runtime.current.mic = !mic
    setMic(!mic)
  }
  const toggleComposer = () => {
    setComposerOpen(!composerOpen)
    if (!composerOpen) requestAnimationFrame(() => composer.current?.focus())
  }
  const isSceneTarget = event => event.target === stage.current || event.target.classList.contains('call-room')
  const pointerPosition = event => callPointerPosition(avatar.current, event.clientX, event.clientY)
  const onScenePress = event => {
    if (!isSceneTarget(event) || !event.isPrimary || event.button !== 0 || scenePointer.current) return
    const position = pointerPosition(event)
    if (!position) return
    const region = callTouchRegion(position)
    scenePointer.current = { id: event.pointerId, region }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (region) motion.touch(region, position.x < 500 ? -1 : 1)
    else motion.pointerLook(position.gazeX, position.gazeY)
  }
  const onSceneMove = event => {
    const press = scenePointer.current
    if (press?.id === event.pointerId) {
      if (press.region) return
      const position = pointerPosition(event)
      if (position) motion.pointerLook(position.gazeX, position.gazeY)
    } else if (!press) {
      const hover = isSceneTarget(event) && callTouchRegion(pointerPosition(event), false)
      event.currentTarget.classList.toggle('call-over-avatar', Boolean(hover))
    }
  }
  const onSceneRelease = event => {
    if (scenePointer.current?.id !== event.pointerId) return
    scenePointer.current = null
    motion.releasePointer(event.type !== 'pointerup')
  }

  const themeAction = t(theme === 'dark' ? 'switch_to_light' : 'switch_to_dark')
  const captionAction = captions ? l('关闭字幕', 'Hide captions', '字幕を非表示') : l('开启字幕', 'Show captions', '字幕を表示')
  const fullscreenAction = fullscreen ? l('退出全屏', 'Exit full screen', '全画面表示を終了') : l('全屏', 'Full screen', '全画面表示')
  const modelAction = l('选择通话模型', 'Choose call model', '通話モデルを選択')
  const closePanelAction = l('关闭组件', 'Close shared content', '共有内容を閉じる')
  const zoomPreviewAction = previewZoomed ? l('缩小预览', 'Shrink preview', 'プレビューを縮小') : l('放大预览', 'Enlarge preview', 'プレビューを拡大')
  const sendAction = l('发送', 'Send', '送信')

  return <dialog ref={dialog} className={`video-call${compact ? ' is-compact' : ''}`}
    aria-label={l('Saki 视频通话', 'Saki video call', 'Saki ビデオ通話')} data-call-theme={theme}
    style={{ '--call-room': `url("${callRooms[theme === 'light' ? 'light' : 'dark']}")` }}
    onCancel={event => {
      event.preventDefault()
      if (openMenu) { closeMenu(); return }
      if (document.fullscreenElement === stage.current) { void toggleFullscreen(); return }
      if (performance.now() - fullscreenExitAt.current < 350) return
      hangUp()
    }}>
    <div ref={stage} className={`call-stage${avatarReady ? ' is-connected' : ''}${dualPanels ? ' call-stage-dual' : ''}${compact ? ' call-stage-compact' : ''}`}
      onPointerDown={onScenePress} onPointerMove={onSceneMove} onPointerUp={onSceneRelease}
      onPointerCancel={onSceneRelease} onLostPointerCapture={onSceneRelease}>
    <div className="call-room" />
    <div className="call-vignette" />
    <iframe className="call-avatar" ref={avatar} title={l('Saki 实时角色', 'Saki live avatar', 'Saki ライブアバター')} src={`${base}saki-avatar/Saki_Preview.html?mode=call&view=full&v=2`} />
    <div className={`call-connecting${avatarReady ? ' is-hidden' : ''}`} aria-hidden={avatarReady} role="status" aria-live="polite">
      <div className="call-connecting-backdrop" />
      <div className="call-connecting-card">
        <div className="call-connecting-orbit">
          <span className="call-connecting-halo" />
          <span className="call-connecting-ring" />
          <span className="call-connecting-ring is-delayed" />
          <span className="call-connecting-ring is-outer" />
          <div className="call-connecting-avatar">
            <img
              src={config.aiAvatar || botAvatar}
              alt="Saki"
              onError={event => {
                if (event.currentTarget.src !== botAvatar) event.currentTarget.src = botAvatar
              }}
            />
          </div>
        </div>
        <div className="call-connecting-name">Saki</div>
        <div className="call-connecting-status">
          <span className="call-connecting-wave" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span>{l('正在呼叫 Saki…', 'Calling Saki…', 'Saki に発信中…')}</span>
        </div>
        <p className="call-connecting-hint">
          {l('正在建立实时形象与语音连线', 'Connecting live avatar & voice…', 'ライブアバターと音声を接続しています…')}
        </p>
      </div>
    </div>
    <header className="call-top">
      <div className="call-model-wrap" ref={modelMenuRef}>
        <button
          type="button"
          aria-label={`${modelAction} · ${currentModelLabel}`}
          title={`${modelAction} · ${currentModelLabel}`}
          aria-haspopup="listbox"
          aria-expanded={modelDropdownOpen}
          className={`call-glass-btn call-model-pill ${modelDropdownOpen ? 'is-open' : ''}`}
          onClick={() => {
            setRequestedModels(true)
            setOpenMenu(current => current === 'model' ? null : 'model')
          }}
        >
          <span className="call-model-icon" aria-hidden="true">
            <Bot size={19} strokeWidth={1.8} />
          </span>
          <span className="call-model-label">{currentModelLabel}</span>
        </button>
        {modelDropdownOpen && (
          <div className="call-model-dropdown" role="listbox" aria-label={modelAction}>
            <div className="call-model-dropdown-header">{modelAction}</div>
            <div className="call-model-list">
              {options.map(model => {
                const isSelected = modelKey(model.provider, model.name) === selectedKey
                const label = model.label?.replace(/\s+\(current\)$/i, '') || model.name
                return (
                  <button
                    key={modelKey(model.provider, model.name)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`call-model-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      cancelTurn()
                      setSelected({ provider: model.provider, model: model.name })
                      closeMenu()
                    }}
                  >
                    <span className="call-model-item-text">
                      <span className="call-model-item-name">{label}</span>
                      <span className="call-model-item-provider">{model.provider}</span>
                    </span>
                    {isSelected && <Check size={15} strokeWidth={2.4} className="call-model-check" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <time className="call-time" aria-label={l('通话时长', 'Call duration', '通話時間')}>
        {avatarReady ? time : l('呼叫中…', 'Calling…', '発信中…')}
      </time>
      <div className="call-top-actions">
        <div className="call-language-wrap" ref={languageMenuRef}>
          <button type="button" className={`call-glass-btn call-language-btn${languageMenuOpen ? ' is-open' : ''}`}
            aria-label={t('language')} title={`${t('language')} · ${activeLanguage.label}`}
            aria-expanded={languageMenuOpen} aria-controls={languageMenuOpen ? languageMenuId : undefined}
            onClick={() => setOpenMenu(current => current === 'language' ? null : 'language')}>
            <Globe size={19} strokeWidth={1.8} />
          </button>
          {languageMenuOpen && <div id={languageMenuId} className="call-model-dropdown call-language-dropdown" role="group" aria-label={t('language')}>
            {uiLanguages.map(option => (
              <button type="button" key={option.code} lang={option.code} aria-pressed={option === activeLanguage}
                className={`call-model-item${option === activeLanguage ? ' is-selected' : ''}`} onClick={() => {
                  changeSakiLang(option.code)
                  closeMenu()
                }}>
                <span className="call-model-item-name">{option.label}</span>
                {option === activeLanguage && <Check size={15} strokeWidth={2.4} className="call-model-check" aria-hidden="true" />}
              </button>
            ))}
          </div>}
        </div>
        <button type="button" className="call-glass-btn call-theme-btn" aria-label={themeAction} title={themeAction}
          onClick={event => onToggleTheme(event, { immediate: true })}>
          {theme === 'dark' ? <Sun size={19} strokeWidth={1.8} /> : <Moon size={19} strokeWidth={1.8} />}
        </button>
        <button type="button" aria-label={captionAction} title={captionAction}
          aria-pressed={captions} className={`call-glass-btn call-captions-btn ${!captions ? 'is-off' : ''}`}
          onClick={() => setCaptions(value => !value)}>
          <MessageSquare size={19} strokeWidth={1.8} />
          <img alt="" src={`${base}assets/video-call/captions.webp`} onError={event => { event.currentTarget.hidden = true }} />
        </button>
        {(!compact || document.fullscreenEnabled) && <button type="button" aria-label={fullscreenAction} title={fullscreenAction}
          aria-pressed={fullscreen} className={`call-glass-btn call-fullscreen ${fullscreen ? 'is-active' : ''}`}
          onClick={toggleFullscreen}>
          {fullscreen ? <Minimize size={19} strokeWidth={1.8} /> : <>
            <Maximize size={19} strokeWidth={1.8} />
            <img alt="" src={`${base}assets/video-call/fullscreen.webp`} onError={event => { event.currentTarget.hidden = true }} />
          </>}
        </button>}
      </div>
    </header>
    {camera && (
      <div
        ref={previewRef}
        className={`call-preview is-camera-on ${previewZoomed ? 'is-zoomed' : ''}`}
        style={previewPos ? { left: `${previewPos.x}px`, top: `${previewPos.y}px`, right: 'auto' } : undefined}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerUp}
        onPointerCancel={handlePreviewPointerUp}
        onDoubleClick={event => {
          if (event.target.closest('button')) return
          setPreviewZoomed(z => !z)
        }}
      >
        <video
          ref={el => {
            cameraVideo.current = el
            if (el && runtime.current.camera && el.srcObject !== runtime.current.camera) {
              el.srcObject = runtime.current.camera
              el.play?.().catch(() => {})
            }
          }}
          muted
          autoPlay
          playsInline
          aria-label={l('本机摄像头预览', 'Local camera preview', '自分のカメラプレビュー')}
        />
        <div className="call-preview-controls">
          <button
            type="button"
            className="call-preview-zoom"
            title={zoomPreviewAction}
            aria-label={zoomPreviewAction}
            onClick={event => {
              event.stopPropagation()
              setPreviewZoomed(z => !z)
            }}
          >
            {previewZoomed ? <Minimize2 size={13} strokeWidth={2.2} /> : <Maximize2 size={13} strokeWidth={2.2} />}
          </button>
        </div>
        <button
          type="button"
          onClick={shareFrame}
          disabled={uploading || files.length >= 4}
          className="call-share-frame"
          title={l('Saki 可按需查看一帧，也可以手动分享', 'Share a camera frame with Saki', 'カメラの画像を Saki に共有')}
        >
          {l('分享画面', 'Share frame', '画像を共有')}
        </button>
      </div>
    )}
    <div className="call-dock">
    {activePanel && <div className={`call-panels${sheetExpanded ? ' is-expanded' : ''}`}>
      {compact && <header className="call-sheet-header">
        {dualPanels ? <div className="call-sheet-switcher" role="group" aria-label={l('切换共享内容', 'Switch shared content', '共有内容を切り替え')}>
          {panelSides.map(side => <button type="button" key={side} aria-pressed={activeSide === side}
            onClick={() => setSheetSide(side)} title={panels[side].title}>{panels[side].title}</button>)}
        </div> : <h2 className="call-sheet-title">{activePanel.title}</h2>}
        <button type="button" className="call-sheet-action" aria-label={sheetExpanded ? l('缩小共享内容', 'Collapse shared content', '共有内容を縮小') : l('展开共享内容', 'Expand shared content', '共有内容を拡大')}
          aria-expanded={sheetExpanded} onClick={() => setSheetExpanded(value => !value)}>
          {sheetExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button type="button" className="call-sheet-action" aria-label={closePanelAction} onClick={() => closeComponent(activeSide, 'user')}><X size={19} /></button>
      </header>}
      {panelSides.map(side => panels[side] && <VideoCallComponent key={`${side}-${panels[side].id}`} component={panels[side]}
        side={side === 'left' ? 1 : -1} visible={compact || panelReady} hidden={compact && activeSide !== side}
        backendUrl={backendUrl} onClose={compact ? undefined : () => closeComponent(side, 'user')}
        onReply={value => {
          const title = panels[side].title
          const direction = side === 'left' ? '左' : '右'
          void send(l(`我对${direction}侧「${title}」的回答：${value}`,
            `My answer to “${title}” on the ${side}: ${value}`, `${direction}側の「${title}」への回答：${value}`))
        }} />)}
    </div>}
    <section className="call-bottom" aria-label={l('通话控制', 'Call controls', '通話コントロール')}>
      {captions && <VideoCallCaptions caption={caption} interim={interim} turns={callTurns} liveReply={liveReply} aiAvatar={config.aiAvatar} userAvatar={config.userAvatar} />}
      {error && <div className="call-error" role="alert">{Array.isArray(error) ? l(...error) : error}</div>}
      <div className="call-console">
        {files.length > 0 && <div className="call-files">{files.map(file => <span key={file.id}>{file.name}
          <button type="button" aria-label={l(`移除 ${file.name}`, `Remove ${file.name}`, `${file.name} を削除`)} onClick={() => setFiles(current => current.filter(item => item.id !== file.id))}><X size={13} /></button>
        </span>)}</div>}
        {(composerOpen || files.length > 0) && <form className="call-text" onSubmit={event => {
          event.preventDefault()
          if (uploading || (!text.trim() && !files.length)) return
          if (compact) setComposerOpen(false)
          void send(text)
        }}>
          <input ref={composer} value={text} maxLength={6000} placeholder={l('输入文字…', 'Type a message…', 'メッセージを入力…')} aria-label={l('通话文字', 'Call message', '通話メッセージ')}
            onChange={event => setText(event.target.value)} />
          <button type="submit" aria-label={sendAction} title={sendAction} disabled={uploading || (!text.trim() && !files.length)}>
            <ArrowUp size={18} strokeWidth={2.2} />
          </button>
        </form>}
        <div className="call-controls">
          <CallButton label={mic ? l('静音', 'Mute', 'ミュート') : l('开启麦克风', 'Unmute', 'ミュート解除')} icon={mic ? Mic : MicOff} micMeter off={!mic} pressed={mic} onClick={switchMic} />
          <CallButton label={camera ? l('关闭摄像头', 'Camera off', 'カメラをオフ') : l('开启摄像头', 'Camera on', 'カメラをオン')} icon={camera ? Video : CameraOff} art="camera" off={!camera} pressed={camera} onClick={toggleCamera} />
          <CallButton label={l('挂断', 'Hang up', '通話終了')} icon={PhoneOff} art="hangup" kind="call-hangup" onClick={hangUp} />
          <CallButton label={composerOpen ? l('收起键盘', 'Hide keyboard', 'キーボードを閉じる') : l('键盘', 'Keyboard', 'キーボード')} icon={Keyboard} pressed={composerOpen} onClick={toggleComposer} />
          <CallButton label={uploading ? l('上传中', 'Uploading', 'アップロード中') : l('上传文件', 'Upload file', 'ファイルを共有')} icon={Paperclip} art="attach" disabled={uploading || files.length >= 4} onClick={() => picker.current?.click()} />
          {busy && <CallButton label={l('打断回复', 'Interrupt', '応答を中断')} icon={Square} kind="call-interrupt" onClick={cancelTurn} />}
        </div>
        <input type="file" ref={picker} hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.pdf,.docx,.json"
          onChange={event => { void upload(event.target.files); event.target.value = '' }} />
      </div>
    </section>
    </div>
    </div>
  </dialog>
}

import React from 'react'

const mib = bytes => (bytes / (1024 * 1024)).toFixed(1)

export default function VideoCallModelStatus({ model, localize: l, connected = false }) {
  const failed = model.status === 'error'
  const downloadLabel = l('正在下载 WASM 语音模型', 'Downloading WASM voice model', 'WASM 音声モデルをダウンロード中')
  const phaseLabels = {
    preparing: l('正在准备 WASM 语音模型', 'Preparing WASM voice model', 'WASM 音声モデルを準備中'),
    selecting: l('正在选择模型下载线路', 'Choosing a model download source', 'モデルのダウンロード元を選択中'),
    connecting: l('正在连接模型下载线路', 'Connecting to the model download source', 'ダウンロード元に接続中'),
    downloading: downloadLabel,
    initializing: l('正在初始化 WASM 语音模型', 'Initializing WASM voice model', 'WASM 音声モデルを初期化中'),
  }
  const label = failed
    ? l('WASM 语音模型加载失败', 'Could not load the WASM voice model', 'WASM 音声モデルを読み込めませんでした')
    : phaseLabels[model.downloadPhase]
  const source = {
    server: l('当前服务器', 'Current server', '現在のサーバー'),
    pan123: l('123 云盘', '123 Cloud', '123 クラウド'),
    onedrive: 'OneDrive',
    github: 'GitHub Releases',
    google: 'Google Drive',
  }[model.activeSource]
  const progress = !failed && model.downloadProgress

  return <div className="call-voice-model" role={connected ? 'status' : undefined}>
    <div className="call-voice-model-label">
      <span>{label}</span>
      {source && <span className="call-voice-model-source">{source}</span>}
    </div>
    {progress && <div className="call-voice-model-progress" aria-live="off">
      <progress aria-label={downloadLabel} value={progress.loaded} max={progress.total} />
      <span aria-hidden="true">{model.percent}%</span>
      <span className="call-voice-model-bytes" aria-hidden="true">{mib(progress.loaded)} / {mib(progress.total)} MiB</span>
    </div>}
  </div>
}

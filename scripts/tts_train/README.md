# Saki 本地浏览器端语音（WASM + RTX 3060 微调）流程

## 1. 现状（已立即可用）
- 前端已接入 `sherpa-onnx` WebAssembly 离线 TTS 引擎（位于 `frontend/public/tts-wasm/`），并已实现**逐句切分 + 流水线后台合成队列**（播放第 1 句时同时合成第 2 句）。
- 设置面板 → TTS 中已新增 **「本地模型 (WASM)」**，支持预加载、试听、语速调节，以及加载失败时自动回退到浏览器原生 TTS。
- 服务器只托管静态文件，**零后端 CPU/GPU 算力消耗**。

## 2. 使用 SeedAudio 素材在 RTX 3060 上微调 Saki 音色
1. 准备 22.05kHz 单声道训练集与划分文件：
   ```powershell
   python scripts/tts_train/prepare_saki_dataset.py
   ```
   输出位于 `data/saki_dataset_22k/`（包含 `wavs/`、`train.txt`、`val.txt`）。
2. 使用支持 `sherpa-onnx` 导出的中文轻量模型仓库（推荐 `icefall` 的 `matcha_tts` 或 `VITS-fast-fine-tuning`）以 `data/saki_dataset_22k/train.txt` 为训练集在本机 RTX 3060 上微调并导出 `model-steps-3.onnx`（Matcha-TTS）或 `model.onnx`（VITS）。
3. 将导出的 ONNX 模型与 `tokens.txt`、`lexicon.txt`（以及 `vocos-22khz-univ.onnx`、`phone.fst`、`date.fst`、`number.fst`）放入同一目录后，一键重新打包替换浏览器端模型：
   ```powershell
   python scripts/tts_train/pack_wasm_data.py --model-dir <你的导出目录>
   ```
   脚本会自动重打 `frontend/public/tts-wasm/sherpa-onnx-wasm-main-tts.data` 并同步更新 `sherpa-onnx-wasm-main-tts.js` 中的文件偏移元数据。

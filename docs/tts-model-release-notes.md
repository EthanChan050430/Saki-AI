# 浏览器端 TTS 模型

Saki-AI 的浏览器端语音合成模型约 132 MiB，文件名为 `sherpa-onnx-wasm-main-tts.data`。模型在浏览器里运行。

## 在 Saki 里选择下载线路

在 **设置 → 语音 → 浏览器端神经网络语音 → 下载线路** 中选择来源。

「自动（按 IP）」是默认模式。缓存未命中时，应用按访问设备的公网 IP 归属地选择来源：

- 中国大陆依次尝试 123 云盘、OneDrive、GitHub Releases、Google Drive。
- 其他地区依次尝试 GitHub Releases、Google Drive、123 云盘、OneDrive。定位超时也使用此顺序。
- 自动模式跳过只配了分享页的 123 云盘。GitHub Releases 和 OneDrive 通过 Saki 服务转发，123 云盘直链优先由浏览器尝试。各镜像均失败时尝试当前服务器上的模型。

浏览器在缓存自动下载的文件前校验 SHA-256。手动选线和导入方式如下。


- **当前服务器**：点击「预加载模型」，从当前部署下载。
- **Google Drive**：点击「预加载模型」，浏览器从 Google Drive 直接下载并校验。
- **GitHub Releases / OneDrive / 123 云盘**：点击「下载模型文件」，下载完成后点「导入模型文件」。浏览器会校验并缓存文件。
- OneDrive 可由部署者通过 `SAKI_TTS_ONEDRIVE_URL` 设置为该文件允许下载的只读共享链接。未配置时，设置中的 OneDrive 选项不可选。修改部署配置后重启服务。
- 123 云盘可通过 `SAKI_TTS_123PAN_SHARE_URL` 配置模型分享页。若有可供服务器直接下载的链接，可配置 `SAKI_TTS_123PAN_DIRECT_URL`。

## 部署时下载

在项目根目录运行下面任意一条命令。已验证的同版本模型会自动复用。

```bash
node scripts/download-tts-model.cjs github
node scripts/download-tts-model.cjs google
node scripts/download-tts-model.cjs onedrive
node scripts/download-tts-model.cjs pan123
```

脚本验证文件大小和 SHA-256 后才安装模型。源码部署默认将模型放到 `frontend/public/tts-wasm/`。从源码构建时执行 `node scripts/launch.cjs --prepare --build`，或在构建 Docker 镜像的机器上执行 `docker compose up -d --build`。

已有前端构建时，可加 `--dist` 直接装进当前构建目录。例如 `node scripts/download-tts-model.cjs google --dist`。默认构建目录为 `frontend/dist`，可通过 `SAKI_FRONTEND_DIST` 指定。独立发布包默认将模型安装到构建目录。

## 模型校验

- 文件大小为 138068830 字节。
- SHA-256 为 `2fc20c60263d89c146fa3a71336d9c6d9bd62d57caa44f10e1f1a764e4149392`。
- 线上部署可用 `curl -I https://你的域名/tts-wasm/sherpa-onnx-wasm-main-tts.data` 检查当前服务器是否提供模型。

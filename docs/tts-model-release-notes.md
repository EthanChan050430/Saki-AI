# 浏览器端 TTS 模型

此附件为 Saki-AI 浏览器端语音合成模型（约 132 MiB）。模型不包含在 Git 仓库中，需要在部署前下载。下载后仍由浏览器执行语音合成。

## 普通部署（Linux）

在 Saki-AI 项目根目录执行：

```bash
mkdir -p frontend/public/tts-wasm
curl -fL --retry 3 -o frontend/public/tts-wasm/sherpa-onnx-wasm-main-tts.data.tmp \
  https://github.com/EthanChan050430/Saki-AI/releases/download/tts-model-v1/sherpa-onnx-wasm-main-tts.data
echo '2fc20c60263d89c146fa3a71336d9c6d9bd62d57caa44f10e1f1a764e4149392  frontend/public/tts-wasm/sherpa-onnx-wasm-main-tts.data.tmp' | sha256sum -c -
mv frontend/public/tts-wasm/sherpa-onnx-wasm-main-tts.data.tmp frontend/public/tts-wasm/sherpa-onnx-wasm-main-tts.data
node scripts/launch.cjs --prepare --build
```

校验失败时不要执行 `mv`；重新下载后再次校验。构建完成后启动或重启你的 Saki-AI 服务。若配置了自定义 `SAKI_FRONTEND_DIST`，构建时使用相同配置。

对于已经构建的普通部署，也可以把校验通过的模型复制到当前使用的前端构建目录 `tts-wasm/` 下，不必重新构建。之后重新构建时，确保 `frontend/public/tts-wasm/` 中仍有模型。

## Docker Compose 部署

在**构建镜像的机器**上，先执行上面的 `mkdir`、`curl`、校验和 `mv` 步骤，再在项目根目录构建并启动：

```bash
docker compose build
docker compose up -d
```

如果镜像在其他机器构建，需先将模型放入该机器的构建目录；仅在运行容器的服务器下载模型不会修改现有镜像。

## 验证

将地址替换成你的网站地址，检查文件是否可访问：

```bash
curl -I https://你的域名/tts-wasm/sherpa-onnx-wasm-main-tts.data
```

正常应返回 HTTP 200，文件大小为 138068830 字节。然后在 Saki-AI 中选择浏览器端神经网络语音并预加载模型。首次使用需要下载模型，耗时取决于网络速度。

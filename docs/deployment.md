# 低资源部署

推荐使用 Node.js 22.12+ 原生运行。生产模式由同一个后端服务提供网页和 API，只需端口 `5480`，不常驻 Vite。双击 `start.bat` 或执行 `npm start` 默认进入轻量模式，不自动启动 Ollama、SD、GPT-SoVITS 或 QQ Bot。

## 低配机器推荐：在另一台机器构建

在开发机或 CI 的项目根目录运行：

```sh
npm run release:prepare
```

将生成的 `release/saki-ai-日期/` 整个目录复制到目标机器，安装 Node.js 后双击 `start.bat`，或运行：

```sh
node scripts/launch.cjs
```

全新发布包首次启动仅执行后端 `npm ci --omit=dev --omit=optional`，不安装前端构建依赖、不编译前端、不下载本地向量模型。安装成功后记录锁文件指纹，后续启动复用依赖；已有开发依赖且没有指纹时，使用 `npm install` 整理依赖，避免清空正在使用的开发环境。构建机的 `node_modules` 不会打包，目标机器自行安装对应系统与架构的依赖。初次安装需要能访问 npm 镜像。

发布包只复制程序和空白配置模板，不包含现有聊天、密钥、上传文件、检查点或 SSL 私钥。升级时停止旧服务、备份并保留数据目录，建议通过 `.env` 的 `SAKI_DATA_DIR`、`SAKI_MEMORY_WORKSPACE_DIR`、`CHECKPOINT_STORE_DIR` 使用固定绝对路径。已有原生安装的 `MEMORY.md`、`SESSION-STATE.md`、`memory/` 默认仍位于项目根目录，迁移时也应保留。

轻量构建省略 `assets/animate` 下约 **437 MiB** 的逐帧动画，保留静态角色及表情；不会自动预加载这些动画。图表引擎、截图导出、Office/PDF 解析、PPT 生成和浏览器驱动在实际使用时加载。

## 直接从源码启动

```sh
node scripts/launch.cjs
# 或 npm start；Windows 可双击 start.bat
```

缺少前端产物时会先安装前端依赖并构建一次，再安装后端生产依赖。构建阶段的内存与磁盘峰值明显高于日常运行；小内存服务器应优先使用预构建发布包。

访问 `http://127.0.0.1:5480`。默认仅监听本机。需要局域网访问时，在项目根目录 `.env` 中设置 `AGENT_HOST=0.0.0.0`，再访问 `http://服务器IP:5480`。反向代理也使用同一端口；流式聊天需关闭代理缓冲并适当放宽读取超时。已有 `ssl/` 证书会自动启用 HTTPS，可通过 `SAKI_TLS=0` 交由反向代理终止 TLS。

常用命令：

```sh
node scripts/launch.cjs --prepare    # 仅安装、构建，不启动
node scripts/launch.cjs --build      # 源码有更新时重新构建
node scripts/launch.cjs --install    # 强制按锁文件重新安装
node scripts/launch.cjs --no-install # 已准备好的离线环境，跳过安装
```

Linux/macOS 后台运行：

```sh
bash deploy.sh start
bash deploy.sh status
bash deploy.sh logs
bash deploy.sh stop
```

后台脚本只启动一个后端进程，记录 PID，检查健康状态；启动失败会返回错误。启动器本身及 `npm` 在前台启动时仍可能存在少量包装进程；后台模式不保留 npm/Vite 进程。日志在 `.deploy/backend.log`，长期运行建议配置系统日志轮换或使用 systemd。开发热更新仍可使用 `npm install`、`npm run install-all` 和 `npm run dev`，这会运行开发服务器，端口为 `5482`。

## 配置及功能取舍

复制根目录 `.env.example` 为 `.env`，按需修改；已有环境变量优先。

| 配置 | 生产默认 | 作用 |
| --- | --- | --- |
| `SAKI_PROFILE` | `light` | 轻量模式；`standard` 保留动画及浏览器抓取默认行为 |
| `SAKI_EMBEDDINGS` | light 为 `keyword` | 关键词记忆搜索；`lazy` 首次需要时加载向量模型；`warm` 显式预热 |
| `SAKI_CRAWLER` | light 为 `static` | HTTP 抓取，不启动 Chromium；`browser` 使用已安装的 Chrome/Edge 渲染 JS |
| `SAKI_HEAP_MB` | `384` | 启动器设置的 V8 老生代堆上限，**不是进程或整机 RAM 上限** |
| `SAKI_BACKGROUND_TASKS` | `1` | 保留定时任务和已启用的离线反思；设 `0` 停止后台轮询和执行 |
| `QQBOT_AUTO_CONNECT` | 未设置/`0` | 不自动连接 QQ；需要时显式设为 `1` 并配置机器人依赖 |
| `SAKI_BROWSER_IDLE_MS` | `60000` | 浏览器抓取后空闲多久关闭共享浏览器 |
| `PORT` / `AGENT_HOST` | `5480` / `127.0.0.1` | 监听地址 |
| `SAKI_DATA_DIR` | 项目内 `data/` | 聊天、配置、上传等持久数据目录 |
| `SAKI_MEMORY_WORKSPACE_DIR` | 项目根目录 | 长期记忆文件目录；设置自定义数据目录时默认放到其中的 `workspace-memory/` |
| `CHECKPOINT_STORE_DIR` | `~/.saki-ai/checkpoints` | 检查点存储目录；检查点功能保留 |

关键词搜索不提供向量语义相似度；静态抓取无法完整读取纯 JS 网页。Office/PDF/PPT 和终端仍可使用，对应任务会临时增加资源消耗；PPT 截图需要单独安装浏览器并配置 `BROWSER_PATH`。云端 API 或远程 Ollama 可避免在本机运行推理服务。

需要完整资源和本地向量能力时，在源码目录执行：

```sh
node scripts/launch.cjs --full --build
# 或生成含完整动画的发布包：npm run release:prepare -- --full
```

`--full` 安装可选依赖，使用 standard 配置；仍不会默认预热模型。若 `.env` 明确设置了 `SAKI_EMBEDDINGS=keyword` 或 `SAKI_CRAWLER=static`，需分别改为 `lazy`、`browser` 才会启用对应能力。轻量发布包无法自行恢复被省略的动画，需换用完整发布包。

## Docker（可选）

```sh
docker compose up -d --build
docker compose logs -f
docker compose down
```

多阶段构建只将前端产物、后端生产依赖和源码放入运行镜像，使用非 root 用户。默认只映射本机 `5480`，数据、长期记忆和检查点保存在 `saki-data` 卷中。`down` 保留数据，勿使用 `down -v`，除非确实要删除数据。

Compose 默认资源配额为 **1 CPU / 768 MiB**，V8 堆上限 **384 MiB**，日志最多两份各 5 MB；这些是可调整配额，不是满足所有任务的最低配置。可通过 `SAKI_CPUS`、`SAKI_MEMORY_LIMIT`、`SAKI_HEAP_MB` 调整。图片、PDF、浏览器截图、大型工作区检查点会增加峰值，必要时提高配额。Docker 的构建阶段不受运行容器配额约束；同样推荐在其他机器构建后传输镜像。

Docker 默认不包含 QQ Bot 构建产物、Chrome、Python、Git 或本地推理服务；需要这些工具时应扩展镜像。对 Windows 低配机器，原生 Node 运行可省去 Docker Desktop 的额外开销。

## 验证和观测

`GET /api/health` 返回服务状态、当前配置、PID、运行时长、RSS 和堆使用量，不会触发模型加载。

本次在 **Windows / Node 22.15.0** 上，全新隔离安装生产依赖、空白数据、关闭后台任务、使用轻量前端，`--max-old-space-size=192` 启动成功；首次页面与健康请求后空闲约 5 秒，后端进程 RSS 约 **73 MiB**，堆使用约 **19 MiB**，启动约 **1 秒**。这是单次空闲测量，不包含启动器、客户端浏览器、本地模型及操作系统，也不是所有平台或任务峰值的保证。仓库的部署测试覆盖同源页面/API、资源缓存、错误路由、无向量模型的记忆读写和静态抓取。

本次环境未安装 Docker，Docker 镜像尚未进行实际构建验证。

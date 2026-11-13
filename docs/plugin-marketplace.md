# 插件市场

本地及 Git Skill 安装会保留技能目录中的脚本、模板和参考资料（不复制 `.git`，遇到符号链接会明确报错）。更新采用完整目录替换，移除旧版本遗留资源；写入失败时恢复原目录和记录。`readSkill` 返回资源基准目录，相对路径应从该目录解析。此前仅安装说明文件的技能需要从原来源重新安装才能补齐资源。

MCP 初始化会读取工具列表的全部分页；分页失败或 cursor 重复时不会发布不完整的工具目录。移除服务配置或关闭全部服务时，也会清除连接失败的旧状态。

侧栏的「插件市场」会合并内置插件与 [saki-plugins](https://github.com/EthanChan050430/saki-plugins) 仓库中的功能插件。打开市场即可查看目录，点击「下载安装」下载所选插件；需要参数的插件会先显示配置表单。安装完成后，可在「已安装」中配置、停用或卸载，附带技能会出现在技能系统中。

仓库的 `registry.json` 中，`type: "bundle"` 表示功能插件。市场兼容该仓库的 `saki-plugin.json`、`.mcp.json` 和 `skills/<名称>/SKILL.md`，安装时保留原始文件并生成本应用使用的 `plugin.json`。主题、形象、游戏和语言包属于其他插件类型。

GitHub 功能插件的访问令牌在安装表单中填写，保存在本地插件配置中。使用 `npx` 的 MCP 插件需要本机 Node.js；网页抓取插件使用 `uvx`，需要先安装对应的 Python 工具。安装后，后端会按当前配置连接 MCP 服务。

点击右上角刷新按钮可重新同步仓库。目录默认缓存 5 分钟；网络异常时保留上次成功同步的目录，并在界面显示原因。每次下载固定到同一个 Git 提交，校验文件内容后才安装。GitHub 匿名 API 被限流时，会自动通过公开压缩包同步，仅保留功能插件文件，安装时只写入所选插件。安装记录保留来源仓库和提交号。

接口继续兼容原有调用：

- `GET /api/plugins/marketplace`：返回市场插件数组，支持 `query`、`category` 和 `refresh=true`。
- `GET /api/plugins/marketplace?includeSource=true`：返回 `{ plugins, source }`，附带仓库同步状态。
- `POST /api/plugins/marketplace/install`：传入 `{ "pluginId": "saki-dev-workflow", "config": {} }`，下载并安装指定插件。

const path = require('path');

class MCPManager {
    constructor() {
        this.clients = new Map(); // serverName -> { client, transport, tools }
        this.serverStatus = new Map(); // serverName -> { connected, error, toolCount }
        this._operationQueue = Promise.resolve();
    }

    async initializeServers(config) {
        // config is the mcpServers object from the user config
        if (!config || typeof config !== 'object') return;

        return this._enqueueOperation(() => this._initializeServers(config));
    }

    _enqueueOperation(operation) {
        const result = this._operationQueue.then(operation, operation);
        this._operationQueue = result.catch(() => {});
        return result;
    }

    _configSignature(serverConfig) {
        const sortObject = value => {
            if (Array.isArray(value)) return value.map(sortObject);
            if (!value || typeof value !== 'object') return value;
            return Object.keys(value).sort().reduce((result, key) => {
                result[key] = sortObject(value[key]);
                return result;
            }, {});
        };
        return JSON.stringify(sortObject(serverConfig || {}));
    }

    async _initializeServers(config) {
        const configuredNames = new Set(Object.keys(config));

        for (const [name, serverConfig] of Object.entries(config)) {
            const signature = this._configSignature(serverConfig);
            const existing = this.clients.get(name);
            if (existing && existing.signature === signature && !existing.retired) {
                continue;
            }
            if (existing) {
                this.clients.delete(name);
                this._retireEntry(existing);
            }

            let transport;
            try {
                this.serverStatus.set(name, {
                    connected: false,
                    error: 'Initializing...'
                });
                console.log(`[MCP] Initializing server: ${name}`);

                let command = serverConfig.command;
                let args = serverConfig.args;

                // Windows 下对 npx 和 cmd /c 的优化处理，避免进程挂起或 stdio 泄露
                if (process.platform === 'win32') {
                    if (command === 'npx') {
                        command = 'npx.cmd';
                    } else if (command === 'cmd' && args && args[0] === '/c' && args[1] === 'npx') {
                        command = 'npx.cmd';
                        args = args.slice(2);
                    }
                }

                const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
                const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
                transport = new StdioClientTransport({
                    command: command,
                    args: args,
                    env: { ...process.env, ...(serverConfig.env || {}) }
                });

                const client = new Client({
                    name: "ai-agent-client",
                    version: "1.0.0"
                }, {
                    capabilities: {}
                });

                // 设置连接超时并捕获详细错误
                const connectWithTimeout = async () => {
                    const timeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('连接超时：服务器在 15 秒内未响应。可能原因：1. stdout 输出了非 JSON 内容（如欢迎词）；2. npx 正在下载包；3. 进程挂起。')), 15000)
                    );
                    return Promise.race([client.connect(transport), timeout]);
                };

                await connectWithTimeout();
                
                // List tools
                const toolsResponse = await client.listTools();
                const entry = {
                    client,
                    transport,
                    tools: toolsResponse.tools,
                    signature,
                    refCount: 0,
                    retired: false,
                    closed: false
                };
                const previous = this.clients.get(name);
                this.clients.set(name, entry);
                if (previous) this._retireEntry(previous);
                this.serverStatus.set(name, { 
                    connected: true, 
                    toolCount: toolsResponse.tools.length 
                });
                console.log(`[MCP] Server ${name} initialized with ${toolsResponse.tools.length} tools`);
            } catch (error) {
                console.error(`[MCP] Failed to initialize server ${name}:`, error.message);
                
                // 专门为 bing-cn-mcp 以及类似会输出装饰文字的服务进行提示
                let userFriendlyError = error.message;
                if (error.message.includes('JSON')) {
                    userFriendlyError = "协议冲突：服务器输出了非 JSON 内容。请检查该 MCP 服务是否在 Stdout 打印了欢迎词，这会破坏 MCP 协议。";
                }
                
                this.serverStatus.set(name, { 
                    connected: false, 
                    error: userFriendlyError 
                });
                
                // 失败时释放资源
                console.log(`[MCP] Cleaning up failed server ${name}...`);
                try {
                    await transport?.close();
                } catch (closeError) {
                    console.error(`[MCP] Error cleaning up server ${name}:`, closeError.message);
                }
            }
        }

        for (const [name, entry] of this.clients.entries()) {
            if (!configuredNames.has(name)) {
                this.clients.delete(name);
                this.serverStatus.delete(name);
                this._retireEntry(entry);
            }
        }
    }

    _retireEntry(entry) {
        if (!entry || entry.retired) return Promise.resolve();
        entry.retired = true;
        return entry.refCount === 0 ? this._closeEntry(entry) : Promise.resolve();
    }

    async _closeEntry(entry) {
        if (!entry || entry.closed) return;
        entry.closed = true;
        try {
            await entry.transport.close();
        } catch (e) {
            console.error(`[MCP] Error closing transport:`, e.message);
        }
    }

    acquire(serverName) {
        const entry = this.clients.get(serverName);
        if (!entry || entry.retired) return null;
        entry.refCount += 1;
        return entry;
    }

    release(entryOrServerName) {
        const entry = typeof entryOrServerName === 'string'
            ? this.clients.get(entryOrServerName)
            : entryOrServerName;
        if (!entry || entry.refCount <= 0) return;
        entry.refCount -= 1;
        if (entry.refCount === 0 && entry.retired) this._closeEntry(entry);
    }

    async closeAll() {
        return this._enqueueOperation(async () => {
            const closeOperations = [];
            for (const [name, entry] of this.clients.entries()) {
                this.clients.delete(name);
                this.serverStatus.delete(name);
                closeOperations.push(this._retireEntry(entry));
            }
            await Promise.all(closeOperations);
        });
    }

    getAllTools() {
        const allTools = [];
        for (const [serverName, { tools }] of this.clients.entries()) {
            tools.forEach(tool => {
                allTools.push({
                    ...tool,
                    serverName
                });
            });
        }
        return allTools;
    }

    getToolSchema(serverName, toolName) {
        const clientInfo = this.clients.get(serverName);
        if (!clientInfo) return null;
        return clientInfo.tools.find(t => t.name === toolName);
    }

    getStatus() {
        const status = {};
        for (const [name, info] of this.serverStatus.entries()) {
            status[name] = info;
        }
        return status;
    }

    async callTool(serverName, toolName, args) {
        const clientInfo = this.acquire(serverName);
        if (!clientInfo) {
            throw new Error(`MCP Server "${serverName}" not found or not initialized.`);
        }
        try {
            return await clientInfo.client.callTool({
                name: toolName,
                arguments: args
            });
        } finally {
            this.release(clientInfo);
        }
    }
}

module.exports = new MCPManager();
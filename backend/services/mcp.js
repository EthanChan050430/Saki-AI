const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require('path');

class MCPManager {
    constructor() {
        this.clients = new Map(); // serverName -> { client, transport, tools }
        this.serverStatus = new Map(); // serverName -> { connected, error, toolCount }
    }

    async initializeServers(config) {
        // config is the mcpServers object from the user config
        if (!config || typeof config !== 'object') return;

        // Close existing connections first
        await this.closeAll();

        for (const [name, serverConfig] of Object.entries(config)) {
            try {
                this.serverStatus.set(name, { connected: false, error: 'Initializing...' });
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

                const transport = new StdioClientTransport({
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
                this.clients.set(name, {
                    client,
                    transport,
                    tools: toolsResponse.tools
                });
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
            }
        }
    }

    async closeAll() {
        for (const [name, { transport }] of this.clients.entries()) {
            try {
                await transport.close();
            } catch (e) {
                console.error(`[MCP] Error closing transport for ${name}:`, e.message);
            }
        }
        this.clients.clear();
        this.serverStatus.clear();
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
        const clientInfo = this.clients.get(serverName);
        if (!clientInfo) {
            throw new Error(`MCP Server "${serverName}" not found or not initialized.`);
        }
        return await clientInfo.client.callTool({
            name: toolName,
            arguments: args
        });
    }
}

module.exports = new MCPManager();
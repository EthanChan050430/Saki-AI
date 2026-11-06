'use strict';

const os = require('os');
const path = require('path');

// Resolve the host SDK even when SAKI_DATA_DIR is outside the application tree.
const { createRequire } = require('module');
const backendDir = process.env.SAKI_BACKEND_DIR || path.resolve(__dirname, '../../..');
const backendRequire = createRequire(path.join(backendDir, 'package.json'));
const { Server } = backendRequire('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = backendRequire('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = backendRequire('@modelcontextprotocol/sdk/types.js');

const server = new Server(
    {
        name: 'system-toolkit',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'get_system_metrics',
                description: '采集宿主机实时的系统核心指标（CPU核数、内存总量/余量、运行时间、架构及告警状态）',
                inputSchema: {
                    type: 'object',
                    properties: {
                        includeCpuDetails: {
                            type: 'boolean',
                            description: '是否包含每个 CPU 核心的独立时钟频率信息',
                        },
                    },
                },
            },
            {
                name: 'get_threshold_config',
                description: '读取当前插件通过环境变量注入的诊断配置阈值',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
        ],
    };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'get_system_metrics') {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);
        const cpus = os.cpus();
        const alertThreshold = Number(process.env.ALERT_CPU_THRESHOLD || 85);

        const data = {
            platform: os.platform(),
            arch: os.arch(),
            uptimeSeconds: Math.floor(os.uptime()),
            cpuCores: cpus.length,
            cpuModel: cpus[0]?.model || 'Unknown',
            memory: {
                totalMb: Math.round(totalMem / (1024 * 1024)),
                usedMb: Math.round(usedMem / (1024 * 1024)),
                freeMb: Math.round(freeMem / (1024 * 1024)),
                usagePercent: `${memoryUsagePercent}%`,
            },
            alertCpuThreshold: `${alertThreshold}%`,
            status: Number(memoryUsagePercent) > alertThreshold ? 'WARN' : 'HEALTHY',
        };

        if (args?.includeCpuDetails) {
            data.cpuCoresDetail = cpus.map((c, i) => ({ core: i, speed: c.speed }));
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }

    if (name === 'get_threshold_config') {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        ALERT_CPU_THRESHOLD: process.env.ALERT_CPU_THRESHOLD || '85',
                        METRICS_SAMPLE_COUNT: process.env.METRICS_SAMPLE_COUNT || '3',
                    }, null, 2),
                },
            ],
        };
    }

    throw new Error(`Tool not found: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`System Toolkit MCP Server Error: ${err.message}\n`);
    process.exit(1);
});

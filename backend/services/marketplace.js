'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { GithubPluginRepository } = require('./githubPluginRepository');

/**
 * 官方精选插件生态目录 (Curated Marketplace Catalog)
 * 将 MCP 服务与专有业务技能 (Skills) 深度绑定
 */
const CURATED_PLUGINS = [
    {
        id: 'system-toolkit',
        name: '系统运维与性能分析套件',
        version: '1.0.0',
        description: '提供宿主机 CPU、内存、磁盘与进程的实时观测工具，绑定系统诊断与瓶颈分析工作流技能。',
        author: 'Saki Team',
        category: 'utility',
        tags: ['system', 'monitoring', 'diagnosis', 'devops', 'mcp'],
        icon: 'Cpu',
        configSchema: {
            ALERT_CPU_THRESHOLD: {
                type: 'string',
                label: 'CPU 告警阈值(%)',
                description: '当 CPU 使用率超过此数值时在诊断报告中提示告警',
                default: '85',
                required: false,
                placeholder: '85'
            },
            METRICS_SAMPLE_COUNT: {
                type: 'string',
                label: '指标采样次数',
                description: '进程负载采样频次',
                default: '3',
                required: false,
                placeholder: '3'
            }
        },
        mcpToolsSummary: ['get_system_metrics', 'get_threshold_config'],
        skillsSummary: ['system-diagnosis (系统瓶颈诊断与健康分级)'],
        template: {
            assets: ['mcp_server.cjs'],
            manifest: {
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                id: 'system-toolkit',
                name: '系统运维与性能分析套件',
                version: '1.0.0',
                description: '提供宿主机 CPU、内存、磁盘与进程的实时观测工具，绑定系统诊断与瓶颈分析工作流技能',
                author: 'Saki Architecture Team',
                category: 'utility',
                tags: ['system', 'monitoring', 'diagnosis', 'devops', 'mcp'],
                configSchema: {
                    ALERT_CPU_THRESHOLD: {
                        type: 'string',
                        label: 'CPU 告警阈值(%)',
                        description: '当 CPU 使用率超过此数值时在诊断报告中提示告警',
                        default: '85',
                        required: false
                    },
                    METRICS_SAMPLE_COUNT: {
                        type: 'string',
                        label: '指标采样次数',
                        description: '进程负载采样频次',
                        default: '3',
                        required: false
                    }
                },
                mcp: {
                    serverName: 'system_toolkit',
                    command: 'node',
                    args: ['${pluginDir}/mcp_server.cjs'],
                    env: {
                        SAKI_BACKEND_DIR: '${backendDir}',
                        ALERT_CPU_THRESHOLD: '${config.ALERT_CPU_THRESHOLD}',
                        METRICS_SAMPLE_COUNT: '${config.METRICS_SAMPLE_COUNT}'
                    }
                }
            },
            skills: [
                {
                    dir: 'system-diagnosis',
                    content: `---
name: system-diagnosis
description: 评估宿主机资源使用率、定位内存与CPU占用过高的进程，并生成结构化的诊断与优化报告
---

# 系统健康诊断工作流规范 (System Health Diagnosis Workflow)

当你需要对用户机器进行性能体检或用户报告卡顿、资源占用过高时，遵循以下诊断标准：

## 诊断步骤 (Standard Procedure)

1. **调用指标采集工具**：
   - 使用 MCP 提供的 \`get_system_metrics\` 获取当前 CPU 负载、物理内存空闲量及各磁盘分区余量。
2. **阈值核查与告警判定**：
   - 检查 CPU 综合利用率是否高于环境变量中的阈值（默认 85%）。
   - 检查物理可用内存是否低于 15%。
3. **输出排查报告**：
   - 以结构化 Markdown 形式输出总体评级【正常/预警/危险】与处置建议。
`
                }
            ]
        }
    },
    {
        id: 'github-workflow',
        name: 'GitHub 智能协作与评审套件',
        version: '1.2.0',
        description: '无缝连接 GitHub 仓库，提供代码拉取、PR 自动化评审与 Issue 分流整理技能。',
        author: 'Saki Team',
        category: 'developer',
        tags: ['github', 'git', 'pr-review', 'issue', 'code-quality'],
        icon: 'GitPullRequest',
        configSchema: {
            GITHUB_PERSONAL_ACCESS_TOKEN: {
                type: 'string',
                label: 'GitHub 访问令牌 (PAT)',
                description: '用于调用 GitHub API 的个人访问令牌 (需包含 repo 权限)',
                required: true,
                secret: true,
                placeholder: 'ghp_...'
            },
            GITHUB_DEFAULT_OWNER: {
                type: 'string',
                label: '默认仓库拥有者 (Owner/Org)',
                description: '快速检索未指定命名空间的项目',
                required: false,
                placeholder: 'octocat'
            }
        },
        mcpToolsSummary: ['search_repositories', 'create_issue', 'get_pull_request', 'create_pull_request_review', 'get_file_contents'],
        skillsSummary: ['pr-review (自动化 PR 评审指南)', 'issue-triage (缺陷定级与标签归类)'],
        template: {
            manifest: {
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                id: 'github-workflow',
                name: 'GitHub 智能协作与评审套件',
                version: '1.2.0',
                description: '无缝连接 GitHub 仓库，提供代码拉取、PR 自动化评审与 Issue 分流整理技能',
                author: 'Saki Team',
                category: 'developer',
                tags: ['github', 'git', 'pr-review', 'issue', 'code-quality'],
                configSchema: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: {
                        type: 'string',
                        label: 'GitHub 访问令牌 (PAT)',
                        description: '用于调用 GitHub API 的个人访问令牌 (需包含 repo 权限)',
                        required: true,
                        secret: true,
                        placeholder: 'ghp_...'
                    },
                    GITHUB_DEFAULT_OWNER: {
                        type: 'string',
                        label: '默认仓库拥有者 (Owner/Org)',
                        description: '快速检索未指定命名空间的项目',
                        required: false,
                        placeholder: 'octocat'
                    }
                },
                mcp: {
                    serverName: 'github',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    env: {
                        GITHUB_PERSONAL_ACCESS_TOKEN: '${config.GITHUB_PERSONAL_ACCESS_TOKEN}'
                    }
                }
            },
            skills: [
                {
                    dir: 'pr-review',
                    content: `---
name: pr-review
description: 按照企业级工程规范自动化评审 GitHub Pull Request，审查代码异味、潜在 Bug 及单测覆盖率
---

# Pull Request 代码审查工作流规范 (PR Review Workflow)

当用户要求对某个 PR 进行评审时，执行如下步骤：

1. **提取变更与上下文**：
   - 调用 GitHub MCP 工具获取 PR 关联的分支、提交记录及 Diff 文件列表。
2. **多维核查清单**：
   - **安全性**：是否存在硬编码凭证、SQL 注入、XSS 或未受信任的反序列化风险。
   - **性能与并发**：是否存在高耗时循环、未索引查询或竞态条件。
   - **架构契约**：变更是否破坏了对外接口契约（Breaking Changes）。
3. **输出评审意见**：
   - 包含【总结概述】、【潜在缺陷列表（带具体代码位置）】及【重构建议】。
`
                },
                {
                    dir: 'issue-triage',
                    content: `---
name: issue-triage
description: 分析 GitHub 缺陷报告与用户需求，自动推断优先级、模块标签及复现步骤完整度
---

# Issue 分流与整理规范 (Issue Triage Workflow)

1. 分析 Issue 标题与描述，提炼核心问题点与操作系统/运行环境；
2. 判定缺陷等级（P0 致命崩溃 / P1 严重阻碍 / P2 一般体验 / P3 建议）；
3. 给出适用的标签（Labels）与分配建议。
`
                }
            ]
        }
    },
    {
        id: 'web-browser-automation',
        name: '网页深度自动化与数据采集',
        version: '1.1.0',
        description: '基于无头浏览器核心，提供页面动态截图、复杂表单交互、反爬重试与深层文本抽取能力。',
        author: 'Saki Team',
        category: 'web',
        tags: ['crawler', 'puppeteer', 'automation', 'scraping', 'web'],
        icon: 'Globe',
        configSchema: {
            BROWSER_TIMEOUT_MS: {
                type: 'string',
                label: '页面导航超时(毫秒)',
                description: '页面加载最大等待时长',
                default: '30000',
                required: false,
                placeholder: '30000'
            }
        },
        mcpToolsSummary: ['puppeteer_navigate', 'puppeteer_screenshot', 'puppeteer_click', 'puppeteer_fill', 'puppeteer_evaluate'],
        skillsSummary: ['deep-web-scraping (复杂动态渲染页面信息提取规范)'],
        template: {
            manifest: {
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                id: 'web-browser-automation',
                name: '网页深度自动化与数据采集',
                version: '1.1.0',
                description: '基于无头浏览器核心，提供页面动态截图、复杂表单交互与深层文本抽取能力',
                author: 'Saki Team',
                category: 'web',
                tags: ['crawler', 'puppeteer', 'automation', 'scraping', 'web'],
                configSchema: {
                    BROWSER_TIMEOUT_MS: {
                        type: 'string',
                        label: '页面导航超时(毫秒)',
                        description: '页面加载最大等待时长',
                        default: '30000',
                        required: false
                    }
                },
                mcp: {
                    serverName: 'puppeteer',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
                    env: {
                        PUPPETEER_TIMEOUT: '${config.BROWSER_TIMEOUT_MS}'
                    }
                }
            },
            skills: [
                {
                    dir: 'deep-web-scraping',
                    content: `---
name: deep-web-scraping
description: 规范如何使用浏览器交互工具逐步探索动态网站、绕过前端混淆并采集结构化数据
---

# 深度网页抓取与交互规范 (Deep Web Scraping Workflow)

1. 先导航到目标页面并等待网络空闲；
2. 若遇到懒加载元素，执行渐进式页面滚动；
3. 提取关键选择器下的文本与表格数据，并清洗为 Markdown 格式呈现。
`
                }
            ]
        }
    },
    {
        id: 'sqlite-data-analyst',
        name: 'SQLite 数据库与数据分析专家',
        version: '1.0.0',
        description: '直接连接本地 SQLite 数据库文件，执行安全只读查询、表结构审计与 SQL 调优分析。',
        author: 'Saki Team',
        category: 'database',
        tags: ['sqlite', 'database', 'sql', 'analytics', 'data'],
        icon: 'Database',
        configSchema: {
            SQLITE_DB_PATH: {
                type: 'string',
                label: 'SQLite 数据库文件路径',
                description: '目标 .db 或 .sqlite 文件的绝对路径',
                required: true,
                placeholder: 'D:/my-project/data.db'
            }
        },
        mcpToolsSummary: ['read_query', 'list_tables', 'describe_table'],
        skillsSummary: ['sql-query-optimizer (SQL 性能调优与索引规划)', 'schema-audit (表结构规范化审查)'],
        template: {
            manifest: {
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                id: 'sqlite-data-analyst',
                name: 'SQLite 数据库与数据分析专家',
                version: '1.0.0',
                description: '直接连接本地 SQLite 数据库文件，执行安全查询、表结构审计与 SQL 调优分析',
                author: 'Saki Team',
                category: 'database',
                tags: ['sqlite', 'database', 'sql', 'analytics', 'data'],
                configSchema: {
                    SQLITE_DB_PATH: {
                        type: 'string',
                        label: 'SQLite 数据库文件路径',
                        description: '目标 .db 或 .sqlite 文件的绝对路径',
                        required: true,
                        placeholder: 'D:/my-project/data.db'
                    }
                },
                mcp: {
                    serverName: 'sqlite_analyst',
                    command: 'npx',
                    args: ['-y', 'mcp-server-sqlite', '--db-path', '${config.SQLITE_DB_PATH}'],
                    env: {}
                }
            },
            skills: [
                {
                    dir: 'sql-query-optimizer',
                    content: `---
name: sql-query-optimizer
description: 针对慢查询 SQL 进行 EXPLAIN 分析，推荐最适配的联合索引并重构子查询
---

# SQL 调优与索引规划指南 (SQL Query Optimizer Workflow)

1. 先执行 EXPLAIN QUERY PLAN 获取执行计划；
2. 识别是否触发了全表扫描 (SCAN TABLE)；
3. 提出明确的索引创建建议 (CREATE INDEX) 并评估写性能影响。
`
                }
            ]
        }
    },
    {
        id: 'office-power-suite',
        name: '智能办公与文稿演示工作流',
        version: '1.0.0',
        description: '深度整合结构化报表生成、PPT 幻灯片排版与长文档提炼技能。',
        author: 'Saki Team',
        category: 'office',
        tags: ['office', 'ppt', 'excel', 'word', 'presentation'],
        icon: 'FileText',
        configSchema: {
            DEFAULT_REPORT_THEME: {
                type: 'string',
                label: '报告默认主题风格',
                description: '商务简约 / 科技深蓝 / 极简黑白',
                default: '科技深蓝',
                required: false
            }
        },
        mcpToolsSummary: ['generate_report', 'export_presentation_outline'],
        skillsSummary: ['ppt-slide-architect (专业幻灯片大纲与视觉节奏规划)', 'executive-summary (高管简报速读规范)'],
        template: {
            manifest: {
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                id: 'office-power-suite',
                name: '智能办公与文稿演示工作流',
                version: '1.0.0',
                description: '深度整合结构化报表生成、PPT 幻灯片排版与长文档提炼技能',
                author: 'Saki Team',
                category: 'office',
                tags: ['office', 'ppt', 'excel', 'word', 'presentation'],
                configSchema: {
                    DEFAULT_REPORT_THEME: {
                        type: 'string',
                        label: '报告默认主题风格',
                        description: '商务简约 / 科技深蓝 / 极简黑白',
                        default: '科技深蓝',
                        required: false
                    }
                }
            },
            skills: [
                {
                    dir: 'ppt-slide-architect',
                    content: `---
name: ppt-slide-architect
description: 规划高说服力的演示文稿大纲，设计每页幻灯片的视觉焦点与核心论据
---

# 幻灯片大纲与视觉构架规范 (PPT Slide Architect)

1. 确立主线：金字塔原理（结论先行 -> 论据支撑 -> 行动呼吁）；
2. 单页原则：一页只传递一个核心信息；
3. 输出符合 Saki PPT 生成器规范的结构化幻灯片数据。
`
                }
            ]
        }
    }
];

class MarketplaceService {
    constructor({ pluginService, repository = new GithubPluginRepository() }) {
        this.pluginService = pluginService;
        this.repository = repository;
    }

    getSourceStatus() {
        return this.repository?.getStatus() || null;
    }

    /**
     * 获取市场目录清单，并根据已安装状态予以丰富
     */
    async getCatalog({ query = '', category = 'all', refresh = false } = {}) {
        const remotePlugins = this.repository ? await this.repository.getCatalog({ refresh }) : [];
        const installedPlugins = await this.pluginService.listInstalled();
        const installedMap = new Map(installedPlugins.map(p => [p.id, p]));

        const normalizedQuery = String(query || '').trim().toLowerCase();
        const normalizedCategory = String(category || '').trim().toLowerCase();

        const catalog = new Map(CURATED_PLUGINS.map(item => [item.id, { ...item, source: 'builtin' }]));
        for (const item of remotePlugins) {
            if (!catalog.has(item.id)) catalog.set(item.id, item);
        }
        return [...catalog.values()]
            .filter(item => {
                if (normalizedCategory !== 'all' && item.category !== normalizedCategory) {
                    return false;
                }
                if (!normalizedQuery) return true;
                const matchSource = `${item.id} ${item.name} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase();
                return matchSource.includes(normalizedQuery);
            })
            .map(item => {
                const installed = installedMap.get(item.id);
                return {
                    id: item.id,
                    name: item.name,
                    version: item.version,
                    description: item.description,
                    author: item.author,
                    category: item.category,
                    tags: item.tags,
                    icon: item.icon,
                    configSchema: item.configSchema,
                    mcpToolsSummary: item.mcpToolsSummary,
                    skillsSummary: item.skillsSummary,
                    mcpServersSummary: item.mcpServersSummary,
                    requirements: item.requirements || [],
                    source: item.source,
                    repository: item.repository || null,
                    sourceUrl: item.sourceUrl || null,
                    isInstalled: Boolean(installed),
                    installedVersion: installed?.version || null,
                    installedStatus: installed?.status || null,
                    installedEnabled: installed?.enabled ?? null
                };
            });
    }

    /**
     * 获取指定市场插件详情
     */
    async getMarketplacePlugin(pluginId) {
        const catalog = await this.getCatalog();
        return catalog.find(item => item.id === pluginId) || null;
    }

    /**
     * 从市场安装官方插件模板
     */
    async installFromMarketplace(pluginId, initialConfig = {}) {
        const item = CURATED_PLUGINS.find(p => p.id === pluginId);
        if (!item) {
            if (this.repository) return this.repository.install(pluginId, this.pluginService, initialConfig);
            throw new Error(`Plugin "${pluginId}" not found in marketplace catalog.`);
        }

        const template = item.template;
        if (!template) {
            throw new Error(`Marketplace plugin "${pluginId}" does not provide an installation template.`);
        }

        // Build outside the live directory; PluginService owns replacement,
        // store updates, skill synchronization and their shared lock.
        const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-marketplace-'));
        try {
            // Runtime assets ship with the backend, independently of installed plugins.
            for (const asset of template.assets || []) {
                await fs.copy(
                    path.join(__dirname, 'pluginAssets', pluginId, asset),
                    path.join(targetDir, asset),
                    { overwrite: true }
                );
            }

            // 1. 写入 plugin.json
            await fs.writeJson(path.join(targetDir, 'plugin.json'), template.manifest, { spaces: 2 });

            // 2. 写入 skills/
            if (Array.isArray(template.skills)) {
                for (const skill of template.skills) {
                    const skillDir = path.join(targetDir, 'skills', skill.dir);
                    await fs.ensureDir(skillDir);
                    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skill.content, 'utf8');
                }
            }

            return await this.pluginService.installFromFolder(targetDir, {
                source: 'marketplace',
                config: initialConfig || {},
            });
        } finally {
            await fs.remove(targetDir);
        }
    }
}

module.exports = {
    MarketplaceService,
    CURATED_PLUGINS
};

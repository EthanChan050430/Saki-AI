const path = require('path');
const fs = require('fs-extra');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const CLAWHUB_SOURCE_TYPES = new Set(['openhub', 'clawhub']);
const DEFAULT_SYSTEM_SKILLS = [
    {
        id: 'elite-longterm-memory',
        name: 'Elite Longterm Memory',
        fileCandidates: [
            ['elite-longterm-memory', 'SKILL.md'],
            ['elite-longterm-memory-elite-longterm-memory', 'SKILL.md'],
        ],
    },
    {
        id: 'find-skill-find-skill',
        name: 'Find Skill',
        fileCandidates: [
            ['find-skill-find-skill', 'SKILL.md'],
        ],
    },
];

function sanitizeName(name = '') {
    return String(name).trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'untitled-skill';
}

function slugify(name = '') {
    return sanitizeName(name)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || `skill-${Date.now()}`;
}

function previewText(text = '', max = 180) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

const SEARCH_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'build', 'by', 'create', 'do', 'for', 'from', 'get',
    'help', 'how', 'i', 'in', 'into', 'is', 'it', 'make', 'need', 'of', 'on', 'or', 'please', 'show',
    'skill', 'skills', 'that', 'the', 'this', 'to', 'use', 'using', 'want', 'with', 'write',
    '一个', '一些', '一下', '什么', '帮', '帮我', '怎么', '想', '我', '我要', '找', '技能', '请', '让', '使用', '做', '关于',
    '相关', '看看', '需要', '配置', '实现', '支持', '查看', '查找',
]);

const QUERY_SYNONYMS = {
    '天气': ['weather'],
    '预报': ['forecast'],
    '天气预报': ['weather', 'forecast', 'weather forecast'],
    '气象': ['weather'],
    '记忆': ['memory'],
    '长期记忆': ['long term memory', 'memory'],
    '长程记忆': ['long term memory', 'memory'],
    '长期': ['long term'],
    '代理': ['agent'],
    '智能体': ['agent'],
    '搜索': ['search'],
    '联网': ['web', 'search'],
    '浏览': ['browse'],
    '绘图': ['drawing', 'image generation'],
    '画图': ['drawing', 'image generation'],
    '图片': ['image'],
    '演示': ['presentation', 'ppt'],
    '幻灯片': ['slides', 'presentation', 'ppt'],
    'ppt': ['presentation', 'slides'],
    '文档': ['document'],
    '代码': ['code'],
    '自动化': ['automation'],
    '工作流': ['workflow'],
    '任务': ['task'],
    'git': ['git'],
    'github': ['github', 'git'],
};

function normalizeSearchText(text = '') {
    return String(text || '')
        .toLowerCase()
        .replace(/[`"'()[\]{}<>]/g, ' ')
        .replace(/[_/\\|]+/g, ' ')
        .replace(/[-:;,!?]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitCompoundToken(token = '') {
    return String(token)
        .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
        .map(part => part.trim())
        .filter(Boolean);
}

function tokenizeSearchText(text = '') {
    const normalized = normalizeSearchText(text);
    if (!normalized) return [];

    const rawTokens = normalized.match(/[a-z0-9][a-z0-9.+#-]{1,}|[\u4e00-\u9fa5]{2,}/gi) || [];
    const tokens = new Set();

    for (const rawToken of rawTokens) {
        const token = rawToken.trim();
        if (!token || SEARCH_STOPWORDS.has(token)) continue;

        if (token.length >= 2) tokens.add(token);

        for (const part of splitCompoundToken(token)) {
            if (part.length >= 2 && !SEARCH_STOPWORDS.has(part)) {
                tokens.add(part);
            }
        }

        if (/^[\u4e00-\u9fa5]{4,}$/.test(token)) {
            for (let i = 0; i < token.length - 1; i++) {
                const bigram = token.slice(i, i + 2);
                if (!SEARCH_STOPWORDS.has(bigram)) {
                    tokens.add(bigram);
                }
            }
        }
    }

    return Array.from(tokens);
}

function buildQueryVariants(query = '', limit = 24) {
    const variants = new Set();
    const normalized = normalizeSearchText(query);
    const tokens = tokenizeSearchText(query);

    if (normalized && !SEARCH_STOPWORDS.has(normalized)) {
        variants.add(normalized);
    }

    for (const token of tokens) {
        variants.add(token);
    }

    for (const token of [normalized, ...tokens]) {
        const synonymList = QUERY_SYNONYMS[token] || QUERY_SYNONYMS[String(token || '').replace(/\s+/g, '')] || [];
        for (const synonym of synonymList) {
            const normalizedSynonym = normalizeSearchText(synonym);
            if (normalizedSynonym) {
                variants.add(normalizedSynonym);
            }
        }
    }

    for (let i = 0; i < tokens.length - 1; i++) {
        const phrase = `${tokens[i]} ${tokens[i + 1]}`.trim();
        if (phrase.length >= 4) {
            variants.add(phrase);
        }
    }

    return Array.from(variants).slice(0, limit);
}

function extractDeclaredKeywords(content = '') {
    const source = String(content || '');
    const keywords = new Set();

    const inlineMatch = source.match(/^keywords:\s*\[([^\]]+)\]/im);
    if (inlineMatch) {
        inlineMatch[1]
            .split(',')
            .map(item => item.replace(/^["'\s]+|["'\s]+$/g, '').trim())
            .filter(Boolean)
            .forEach(item => keywords.add(item));
    }

    const yamlBlockMatch = source.match(/^keywords:\s*\n((?:\s*-\s*.+\n?)+)/im);
    if (yamlBlockMatch) {
        yamlBlockMatch[1]
            .split(/\r?\n/)
            .map(line => line.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, '').trim())
            .filter(Boolean)
            .forEach(item => keywords.add(item));
    }

    return Array.from(keywords);
}

function scoreVariantAgainstField(variant = '', field = '') {
    if (!variant || !field) return 0;
    if (field === variant) return 1.2;
    if (field.includes(variant)) return 1;
    if (variant.length >= 4 && variant.includes(field)) return 0.7;
    return 0;
}

function parseSkillHeader(content = '') {
    const lines = String(content).split(/\r?\n/).slice(0, 20);
    const titleLine = lines.find(line => /^#\s+/.test(line));
    const descriptionLine = lines.find(line => /^[-*]\s+/.test(line) || /^[A-Za-z\u4e00-\u9fa5].{10,}$/.test(line));
    return {
        title: titleLine ? titleLine.replace(/^#\s+/, '').trim() : '',
        description: descriptionLine ? descriptionLine.replace(/^[-*]\s+/, '').trim() : '',
    };
}

function escapeRegExp(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFrontMatterValue(content = '', key = '') {
    const source = String(content || '');
    const headerEnd = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
    const searchArea = headerEnd !== -1 ? source.slice(0, headerEnd) : source.slice(0, 1200);
    const match = searchArea.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*([^\\r\\n]+)`, 'im'));
    if (!match) return '';
    return match[1].replace(/^['"]+|['"]+$/g, '').trim();
}

function stripMarkdownExtension(value = '') {
    return String(value || '').trim().replace(/\.(md|markdown)$/i, '');
}

function stripSkillIdentifierDecorations(identifier = '') {
    let text = String(identifier || '').trim();
    if (!text) return '';

    text = text.split(/\r?\n/)[0].trim();
    text = text.replace(/^Tool:\s*readSkill\((.*)\)\s*$/i, '$1').trim();
    text = text.replace(/^[-*]\s+/, '').trim();
    text = text.replace(/^---\s*/, '').replace(/\s*---$/, '').trim();
    text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
    text = text.replace(/^\s*(name|skill|slug|id)\s*[:=]\s*/i, '').trim();
    text = text.replace(/\s+\[[^\]]+\]\s*(?::.*)?$/i, '').trim();
    text = text.replace(/\s+Source:\s+.*$/i, '').trim();
    return stripMarkdownExtension(text);
}

function normalizeSkillIdentifierText(text = '') {
    return normalizeSearchText(stripSkillIdentifierDecorations(text));
}

function compactSkillIdentifierText(text = '') {
    return normalizeSkillIdentifierText(text).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '');
}

function addSkillAlias(aliases, value) {
    const cleaned = stripSkillIdentifierDecorations(value);
    if (!cleaned) return;

    const variants = [
        cleaned,
        stripMarkdownExtension(cleaned),
        cleaned.replace(/\.skill\b/gi, ' skill'),
        cleaned.replace(/\bskill\b/gi, '').replace(/[._-]+/g, ' '),
    ];

    for (const variant of variants) {
        const normalized = String(variant || '').replace(/\s+/g, ' ').trim();
        if (normalized) aliases.add(normalized);
    }

    for (const part of cleaned.split(/\s+-\s+|\|/)) {
        const normalizedPart = part.replace(/\s+/g, ' ').trim();
        if (normalizedPart.length >= 2) aliases.add(normalizedPart);
    }
}

function skillIdentifierAliases(skill = {}) {
    const aliases = new Set();
    const header = parseSkillHeader(skill.content || '');
    const frontMatterName = extractFrontMatterValue(skill.content || '', 'name');

    [
        skill.id,
        skill.slug,
        skill.name,
        skill.fileName,
        stripMarkdownExtension(skill.fileName),
        skill.source,
        skill.sourceMeta?.slug,
        skill.sourceMeta?.name,
        frontMatterName,
        header.title,
    ].forEach(value => addSkillAlias(aliases, value));

    return Array.from(aliases);
}

function scoreSkill(skill, query = '') {
    const variants = buildQueryVariants(query);
    if (variants.length === 0) {
        return { score: 0, matchedTerms: [] };
    }

    const fields = {
        name: normalizeSearchText(skill.name),
        description: normalizeSearchText(skill.description),
        slug: normalizeSearchText(skill.sourceMeta?.slug || skill.slug || ''),
        aliases: skillIdentifierAliases(skill)
            .map(alias => normalizeSearchText(alias))
            .filter(Boolean),
        tags: Array.from(new Set([...(skill.tags || []), ...extractDeclaredKeywords(skill.content || '')]))
            .map(tag => normalizeSearchText(tag))
            .filter(Boolean),
        content: normalizeSearchText(previewText(skill.content || '', 1200)),
    };

    let score = 0;
    const matchedTerms = new Set();

    for (const variant of variants) {
        const nameScore = scoreVariantAgainstField(variant, fields.name);
        const slugScore = scoreVariantAgainstField(variant, fields.slug);
        const aliasScore = Math.max(0, ...fields.aliases.map(alias => scoreVariantAgainstField(variant, alias)));
        const descriptionScore = scoreVariantAgainstField(variant, fields.description);
        const tagScore = Math.max(0, ...fields.tags.map(tag => scoreVariantAgainstField(variant, tag)));
        const contentScore = scoreVariantAgainstField(variant, fields.content);

        if (nameScore > 0) {
            score += nameScore >= 1.2 ? 36 : 24;
            matchedTerms.add(variant);
        }
        if (slugScore > 0) {
            score += slugScore >= 1.2 ? 28 : 18;
            matchedTerms.add(variant);
        }
        if (aliasScore > 0) {
            score += aliasScore >= 1.2 ? 28 : 18;
            matchedTerms.add(variant);
        }
        if (tagScore > 0) {
            score += tagScore >= 1.2 ? 20 : 12;
            matchedTerms.add(variant);
        }
        if (descriptionScore > 0) {
            score += descriptionScore >= 1.2 ? 14 : 8;
            matchedTerms.add(variant);
        }
        if (contentScore > 0) {
            score += contentScore >= 1.2 ? 8 : 4;
            matchedTerms.add(variant);
        }
    }

    if (matchedTerms.size >= 2) score += 10;
    if (fields.name && normalizeSearchText(query) && fields.name.includes(normalizeSearchText(query))) score += 16;

    return {
        score,
        matchedTerms: Array.from(matchedTerms).slice(0, 8),
    };
}

function resolveSkillByIdentifier(skills = [], identifier = '') {
    const rawIdentifier = String(identifier || '').trim();
    const cleanedIdentifier = stripSkillIdentifierDecorations(rawIdentifier);
    if (!cleanedIdentifier) return null;

    const rawNeedles = new Set([rawIdentifier, cleanedIdentifier].filter(Boolean));
    const normalizedNeedles = new Set(
        Array.from(rawNeedles)
            .map(value => normalizeSkillIdentifierText(value))
            .filter(Boolean)
    );
    const compactNeedles = new Set(
        Array.from(rawNeedles)
            .map(value => compactSkillIdentifierText(value))
            .filter(Boolean)
    );

    for (const skill of skills) {
        const directValues = [
            skill.id,
            skill.slug,
            skill.name,
            skill.fileName,
            stripMarkdownExtension(skill.fileName),
            skill.source,
            skill.sourceMeta?.slug,
        ].map(value => String(value || '').trim()).filter(Boolean);

        if (directValues.some(value => rawNeedles.has(value))) {
            return skill;
        }
    }

    for (const skill of skills) {
        for (const alias of skillIdentifierAliases(skill)) {
            const normalizedAlias = normalizeSkillIdentifierText(alias);
            const compactAlias = compactSkillIdentifierText(alias);
            if (
                (normalizedAlias && normalizedNeedles.has(normalizedAlias)) ||
                (compactAlias && compactNeedles.has(compactAlias))
            ) {
                return skill;
            }
        }
    }

    const scored = skills
        .map(skill => {
            const result = scoreSkill(skill, cleanedIdentifier);
            return {
                skill,
                score: result.score,
                matchedTerms: result.matchedTerms,
            };
        })
        .filter(item => item.score > 0)
        .sort((a, b) =>
            b.score - a.score
            || Number(Boolean(b.skill.isDefault)) - Number(Boolean(a.skill.isDefault))
            || new Date(b.skill.updatedAt || 0) - new Date(a.skill.updatedAt || 0)
        );

    const best = scored[0];
    if (!best) return null;

    const secondScore = scored[1]?.score || 0;
    const queryTokens = tokenizeSearchText(cleanedIdentifier);
    const querySpecificEnough = cleanedIdentifier.length >= 4 || queryTokens.length >= 2;
    const scoreStrongEnough = best.score >= 36 || (best.score >= 24 && queryTokens.length >= 2);
    const clearLead = !scored[1] || best.score >= secondScore + 14 || best.score >= secondScore * 1.6;

    if (querySpecificEnough && scoreStrongEnough && clearLead) {
        return {
            ...best.skill,
            searchScore: best.score,
            matchedTerms: best.matchedTerms,
        };
    }

    return null;
}

function normalizeSourceType(sourceType = '') {
    const normalized = String(sourceType || '').trim().toLowerCase();
    if (CLAWHUB_SOURCE_TYPES.has(normalized)) return 'openhub';
    return normalized || 'manual';
}

function extractBalancedJson(text = '') {
    const source = String(text);
    const start = source.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseSearchResults(text = '', limit = 8) {
    return String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('- '))
        .map(line => {
            const match = line.match(/^(\S+)\s{2,}(.+?)(?:\s{2,}\(([\d.]+)\))?$/);
            if (!match) return null;
            const [, slug, displayName, score] = match;
            return {
                id: `openhub:${slug}`,
                slug,
                name: displayName || slug,
                description: '',
                sourceType: 'openhub',
                source: slug,
                preview: `OpenHub skill: ${slug}`,
                searchScore: score ? Number(score) : null,
            };
        })
        .filter(Boolean)
        .slice(0, limit);
}

function quoteShellArg(arg = '') {
    const value = String(arg);
    if (!value) return '""';
    if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

class SkillService {
    constructor({ dataDir }) {
        this.dataDir = dataDir;
        this.skillsDir = path.join(dataDir, 'skills');
        this.storePath = path.join(dataDir, 'skills_store.json');
    }

    async init() {
        await fs.ensureDir(this.skillsDir);
        if (!(await fs.pathExists(this.storePath))) {
            await fs.writeJson(this.storePath, { version: 1, skills: [] }, { spaces: 2 });
        }
        await this.ensureDefaultSkills();
    }

    async loadStore() {
        await this.init();
        const store = await fs.readJson(this.storePath).catch(() => ({ version: 1, skills: [] }));
        return {
            version: 1,
            skills: Array.isArray(store.skills)
                ? store.skills.map(skill => ({
                    ...skill,
                    enabled: skill.enabled !== false,
                    isDefault: Boolean(skill.isDefault),
                    isSystem: Boolean(skill.isSystem),
                    canDelete: skill.canDelete !== false,
                }))
                : [],
        };
    }

    async saveStore(store) {
        await fs.writeJson(this.storePath, store, { spaces: 2 });
    }

    async runClawHub(args, options = {}) {
        try {
            const command = ['npx', '--yes', 'clawhub', ...args].map(quoteShellArg).join(' ');
            const baseOptions = {
                cwd: options.cwd || this.dataDir,
                windowsHide: true,
                maxBuffer: 4 * 1024 * 1024,
                env: {
                    ...process.env,
                    FORCE_COLOR: '0',
                },
            };
            const result = process.platform === 'win32'
                ? await execAsync(command, baseOptions)
                : await execFileAsync('npx', ['--yes', 'clawhub', ...args], baseOptions);

            return {
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                text: `${result.stdout || ''}\n${result.stderr || ''}`.trim(),
            };
        } catch (error) {
            const detail = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
            const message = detail || error.message || 'ClawHub command failed.';
            throw new Error(message);
        }
    }

    mapStoredSkill(skill) {
        return {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            fileName: skill.fileName,
            sourceType: skill.sourceType,
            source: skill.source,
            sourceMeta: skill.sourceMeta || null,
            tags: skill.tags || [],
            updatedAt: skill.updatedAt,
            preview: previewText(skill.content, 140),
            enabled: skill.enabled !== false,
            isDefault: Boolean(skill.isDefault),
            isSystem: Boolean(skill.isSystem),
            canDelete: skill.canDelete !== false,
        };
    }

    filterSkills(skills = [], options = {}) {
        if (options.enabledOnly) {
            return skills.filter(skill => skill.enabled !== false);
        }
        return skills;
    }

    async ensureDefaultSkills() {
        const store = await fs.readJson(this.storePath).catch(() => ({ version: 1, skills: [] }));
        const skills = Array.isArray(store.skills) ? store.skills : [];
        let changed = false;

        for (const defaultSkill of DEFAULT_SYSTEM_SKILLS) {
            const matches = skills.filter(skill =>
                skill.id === defaultSkill.id ||
                skill.slug === defaultSkill.id ||
                normalizeSearchText(skill.name) === normalizeSearchText(defaultSkill.name)
            );

            let content = '';
            for (const candidateParts of defaultSkill.fileCandidates) {
                const candidatePath = path.join(this.skillsDir, ...candidateParts);
                if (await fs.pathExists(candidatePath)) {
                    content = await fs.readFile(candidatePath, 'utf8');
                    break;
                }
            }
            if (!content) {
                content = matches[0]?.content || '';
            }

            if (!content) continue;

            const canonicalDir = path.join(this.skillsDir, defaultSkill.id);
            const canonicalPath = path.join(canonicalDir, 'SKILL.md');
            await fs.ensureDir(canonicalDir);
            await fs.writeFile(canonicalPath, content, 'utf8');

            const header = parseSkillHeader(content);
            const primary = matches[0] || {};
            const now = new Date().toISOString();
            const canonicalSkill = {
                ...primary,
                id: defaultSkill.id,
                slug: defaultSkill.id,
                name: defaultSkill.name,
                fileName: `${defaultSkill.name}.md`,
                path: canonicalPath,
                content,
                description: primary.description || header.description || previewText(content, 120),
                sourceType: 'system',
                source: `system:${defaultSkill.id}`,
                tags: Array.from(new Set([...(primary.tags || []), ...this.extractTags(content, defaultSkill.name)])).slice(0, 12),
                enabled: primary.enabled !== false,
                isDefault: true,
                isSystem: true,
                canDelete: false,
                updatedAt: primary.updatedAt || now,
                createdAt: primary.createdAt || now,
            };

            const needsRewrite =
                matches.length !== 1 ||
                primary.id !== canonicalSkill.id ||
                primary.slug !== canonicalSkill.slug ||
                primary.name !== canonicalSkill.name ||
                primary.path !== canonicalSkill.path ||
                primary.content !== canonicalSkill.content ||
                primary.sourceType !== canonicalSkill.sourceType ||
                primary.source !== canonicalSkill.source ||
                primary.canDelete !== canonicalSkill.canDelete ||
                primary.isDefault !== canonicalSkill.isDefault ||
                primary.isSystem !== canonicalSkill.isSystem;

            if (!needsRewrite) {
                continue;
            }

            const filteredSkills = skills.filter(skill =>
                !(
                    skill.id === defaultSkill.id ||
                    skill.slug === defaultSkill.id ||
                    normalizeSearchText(skill.name) === normalizeSearchText(defaultSkill.name)
                )
            );
            filteredSkills.unshift(canonicalSkill);

            for (const duplicate of matches.slice(1)) {
                await fs.remove(path.dirname(duplicate.path || '')).catch(() => {});
            }

            store.skills = filteredSkills;
            changed = true;
        }

        if (changed) {
            await fs.writeJson(this.storePath, {
                version: 1,
                skills: store.skills,
            }, { spaces: 2 });
        }
    }

    async listSkills(options = {}) {
        const store = await this.loadStore();
        return this.filterSkills(store.skills, options)
            .slice()
            .sort((a, b) => {
                if (Boolean(b.isDefault) !== Boolean(a.isDefault)) {
                    return Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
                }
                if ((a.enabled !== false) !== (b.enabled !== false)) {
                    return Number(b.enabled !== false) - Number(a.enabled !== false);
                }
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            })
            .map(skill => this.mapStoredSkill(skill));
    }

    async getSkill(identifier, options = {}) {
        const store = await this.loadStore();
        return resolveSkillByIdentifier(this.filterSkills(store.skills, options), identifier);
    }

    async searchSkills(query, limit = 8, options = {}) {
        const store = await this.loadStore();
        return this.filterSkills(store.skills, options)
            .map(skill => {
                const result = scoreSkill(skill, query);
                return {
                    skill: {
                        ...skill,
                        searchScore: result.score,
                        matchedTerms: result.matchedTerms,
                    },
                    score: result.score,
                };
            })
            .filter(item => item.score > 0)
            .sort((a, b) =>
                b.score - a.score
                || Number(Boolean(b.skill.isDefault)) - Number(Boolean(a.skill.isDefault))
                || new Date(b.skill.updatedAt || 0) - new Date(a.skill.updatedAt || 0)
            )
            .slice(0, limit)
            .map(item => item.skill);
    }

    async buildContext(query, limit = 4) {
        const relevant = await this.searchSkills(query, limit, { enabledOnly: true });
        return relevant.map(skill =>
            `- ${skill.name}: ${skill.description || previewText(skill.content, 120)}${skill.matchedTerms?.length ? ` [matched: ${skill.matchedTerms.join(', ')}]` : ''}`
        ).join('\n');
    }

    extractTags(content = '', name = '') {
        const source = `${name} ${content}`;
        const tokens = source.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{3,24}/g) || [];
        return Array.from(new Set([
            ...tokens,
            ...extractDeclaredKeywords(content),
        ])).slice(0, 16);
    }

    async upsertSkill({ name, content, description = '', sourceType = 'manual', source = '', tags = [], sourceMeta = null }) {
        const store = await this.loadStore();
        const safeName = sanitizeName(name);
        const slug = slugify(sourceMeta?.slug ? `${safeName}-${sourceMeta.slug}` : safeName);
        const header = parseSkillHeader(content);
        const fileName = `${safeName}.md`;
        const skillDir = path.join(this.skillsDir, slug);
        const filePath = path.join(skillDir, 'SKILL.md');
        await fs.ensureDir(skillDir);
        await fs.writeFile(filePath, content, 'utf8');

        const normalizedSourceType = normalizeSourceType(sourceType);
        const existing = store.skills.find(skill =>
            skill.slug === slug ||
            skill.name === safeName ||
            (
                sourceMeta?.slug &&
                skill.sourceMeta?.slug &&
                skill.sourceMeta.slug === sourceMeta.slug
            )
        );
        const payload = {
            id: slug,
            slug,
            name: safeName,
            fileName,
            path: filePath,
            description: description || header.description || previewText(content, 120),
            content,
            sourceType: normalizedSourceType,
            source,
            sourceMeta,
            tags: Array.from(new Set([...(tags || []), ...this.extractTags(content, safeName)])).slice(0, 12),
            updatedAt: new Date().toISOString(),
            enabled: existing ? existing.enabled !== false : true,
            isDefault: Boolean(existing?.isDefault),
            isSystem: Boolean(existing?.isSystem),
            canDelete: existing ? existing.canDelete !== false : true,
        };

        if (existing?.isSystem || existing?.isDefault) {
            payload.sourceType = existing.sourceType;
            payload.source = existing.source;
            payload.canDelete = false;
            payload.isDefault = Boolean(existing.isDefault);
            payload.isSystem = Boolean(existing.isSystem);
        }

        if (existing) {
            Object.assign(existing, payload);
        } else {
            store.skills.push({
                ...payload,
                createdAt: payload.updatedAt,
            });
        }

        await this.saveStore(store);
        return this.getSkill(slug);
    }

    async setSkillEnabled(identifier, enabled) {
        const store = await this.loadStore();
        const skill = store.skills.find(item =>
            item.id === identifier ||
            item.slug === identifier ||
            item.name === identifier ||
            item.fileName === identifier ||
            item.sourceMeta?.slug === identifier
        );
        if (!skill) return null;
        skill.enabled = Boolean(enabled);
        skill.updatedAt = new Date().toISOString();
        await this.saveStore(store);
        return this.getSkill(skill.id);
    }

    async installFromGit(repoUrl) {
        await this.init();
        const tempDir = path.join(this.skillsDir, `_tmp_${Date.now()}`);
        await execFileAsync('git', ['clone', '--depth', '1', repoUrl, tempDir], {
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
        });
        const skillFile = await this.findSkillFile(tempDir);
        if (!skillFile) {
            await fs.remove(tempDir);
            throw new Error('No SKILL.md found in the repository.');
        }
        const content = await fs.readFile(skillFile, 'utf8');
        const name = path.basename(path.dirname(skillFile)) === path.basename(tempDir)
            ? path.basename(repoUrl).replace(/\.git$/i, '')
            : path.basename(path.dirname(skillFile));
        const skill = await this.upsertSkill({
            name,
            content,
            sourceType: 'git',
            source: repoUrl,
        });
        await fs.remove(tempDir);
        return skill;
    }

    async installFromLocal(localPath) {
        const resolved = path.resolve(localPath);
        const stats = await fs.stat(resolved).catch(() => null);
        if (!stats) throw new Error('Local path not found.');
        let skillFile = resolved;
        if (stats.isDirectory()) {
            skillFile = await this.findSkillFile(resolved);
        }
        if (!skillFile || path.basename(skillFile).toUpperCase() !== 'SKILL.MD') {
            throw new Error('No SKILL.md found in the local path.');
        }
        const content = await fs.readFile(skillFile, 'utf8');
        return this.upsertSkill({
            name: path.basename(path.dirname(skillFile)),
            content,
            sourceType: 'local',
            source: resolved,
        });
    }

    async searchOpenHub(query, limit = 8) {
        const trimmed = String(query || '').trim();
        if (!trimmed) return [];
        const result = await this.runClawHub(['search', ...trimmed.split(/\s+/), '--limit', String(limit)]);
        return parseSearchResults(result.text, limit);
    }

    async inspectOpenHubSkill(slug, options = {}) {
        const normalizedSlug = String(slug || '').trim();
        if (!normalizedSlug) {
            throw new Error('OpenHub skill slug is required.');
        }

        const args = ['inspect', normalizedSlug, '--files', '--json'];
        if (options.version) {
            args.splice(2, 0, '--version', String(options.version));
        }

        const inspectResult = await this.runClawHub(args);
        const jsonText = extractBalancedJson(inspectResult.text);
        if (!jsonText) {
            throw new Error('Failed to read OpenHub skill metadata.');
        }

        const payload = JSON.parse(jsonText);
        const skillInfo = payload.skill || {};
        const latestVersion = payload.latestVersion || payload.version || {};
        const versionInfo = payload.version || {};
        const stats = skillInfo.stats || {};
        const owner = payload.owner || {};

        let content = null;
        if (options.includeContent !== false) {
            const contentResult = await this.runClawHub(['inspect', normalizedSlug, '--file', 'SKILL.md']);
            const text = String(contentResult.text || '').replace(/\n- Fetching skill\s*$/i, '').trim();
            content = text || null;
        }

        return {
            id: `openhub:${skillInfo.slug || normalizedSlug}`,
            slug: skillInfo.slug || normalizedSlug,
            name: skillInfo.displayName || skillInfo.slug || normalizedSlug,
            description: skillInfo.summary || latestVersion.changelog || '',
            summary: skillInfo.summary || '',
            version: latestVersion.version || versionInfo.version || null,
            owner: owner.displayName || owner.handle || '',
            ownerHandle: owner.handle || '',
            downloads: stats.downloads || stats.installsAllTime || 0,
            stars: stats.stars || 0,
            updatedAt: skillInfo.updatedAt ? new Date(skillInfo.updatedAt).toISOString() : null,
            tags: Object.keys(skillInfo.tags || {}),
            content,
            sourceType: 'openhub',
            source: skillInfo.slug || normalizedSlug,
            sourceMeta: {
                slug: skillInfo.slug || normalizedSlug,
                version: latestVersion.version || versionInfo.version || null,
                owner: owner.displayName || owner.handle || '',
                ownerHandle: owner.handle || '',
                downloads: stats.downloads || stats.installsAllTime || 0,
                stars: stats.stars || 0,
                registry: 'clawhub',
            },
            isRemote: true,
        };
    }

    async installFromOpenHub(slug) {
        const detail = await this.inspectOpenHubSkill(slug, { includeContent: true });
        if (!detail.content) {
            throw new Error(`OpenHub skill '${slug}' does not expose a SKILL.md file.`);
        }

        return this.upsertSkill({
            name: detail.name || detail.slug,
            content: detail.content,
            description: detail.summary || detail.description,
            sourceType: 'openhub',
            source: detail.slug,
            tags: detail.tags,
            sourceMeta: detail.sourceMeta,
        });
    }

    async findSkillFile(rootDir) {
        const direct = path.join(rootDir, 'SKILL.md');
        if (await fs.pathExists(direct)) return direct;
        const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const nested = path.join(rootDir, entry.name, 'SKILL.md');
            if (await fs.pathExists(nested)) return nested;
        }
        return null;
    }

    async deleteSkill(identifier) {
        const store = await this.loadStore();
        const index = store.skills.findIndex(skill =>
            skill.id === identifier ||
            skill.slug === identifier ||
            skill.name === identifier ||
            skill.fileName === identifier ||
            skill.sourceMeta?.slug === identifier
        );
        if (index === -1) return false;
        const skill = store.skills[index];
        if (skill.canDelete === false || skill.isDefault || skill.isSystem) {
            throw new Error(`Skill '${skill.name}' is protected and cannot be deleted.`);
        }
        store.skills.splice(index, 1);
        await fs.remove(path.dirname(skill.path)).catch(() => {});
        await this.saveStore(store);
        return true;
    }
}

module.exports = {
    SkillService,
    normalizeSourceType,
    previewText,
};

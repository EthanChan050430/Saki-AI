const path = require('path');
const fs = require('fs-extra');

function sanitizeName(name = '') {
    return String(name).trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'untitled-memory';
}

function slugify(name = '') {
    return sanitizeName(name)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || `memory-${Date.now()}`;
}

function stripMarkdown(text = '') {
    return String(text)
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function previewText(text = '', max = 120) {
    const clean = stripMarkdown(text);
    return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function nowIso() {
    return new Date().toISOString();
}

function defaultStore() {
    return {
        version: 4,
        memories: [],
        profiles: {
            identity: '',
            preferences: '',
            projects: '',
            relationship_style: '',
            updatedAt: null,
        },
        stats: {
            totalMemories: 0,
            lastAutoCaptureAt: null,
            lastSleepCycleAt: null,
            lastOfflineReflectionAt: null,
        },
    };
}

function defaultShortTermStore() {
    return {
        version: 1,
        chats: {},
        updatedAt: null,
        lastFlushAt: null,
    };
}

function defaultSleepStore() {
    return {
        version: 1,
        queue: [],
        runs: [],
        updatedAt: null,
        lastRunAt: null,
    };
}

function defaultKnowledgeGraphStore() {
    return {
        version: 1,
        entities: [],
        relations: [],
        reflections: [],
        updatedAt: null,
        lastReflectedAt: null,
    };
}

const KNOWLEDGE_RELATION_SINGLE_VALUE_PREDICATES = new Set([
    'current_status',
    'progress',
    'next_step',
    'deadline',
    'owner',
    'priority',
    'current_focus',
    'preferred_style',
    'working_mode',
]);

const CATEGORY_PATTERNS = {
    preference: [
        /\b(prefer|favorite|favourite|like|dislike|habit|taste)\b/i,
        /(\u559c\u6b22|\u7231\u5403|\u504f\u597d|\u4e0d\u559c\u6b22|\u8ba8\u538c|\u53e3\u5473|\u4e60\u60ef|\u79f0\u547c|\u99d5\u5934)/,
    ],
    identity: [
        /\b(i am|i'm|my name|birthday|job|work|live in|study)\b/i,
        /(\u6211\u53eb|\u6211\u662f|\u540d\u5b57|\u751f\u65e5|\u804c\u4e1a|\u5de5\u4f5c|\u4f4f\u5728|\u5b66\u6821)/,
    ],
    project: [
        /\b(project|plan|deadline|todo|roadmap|goal|task)\b/i,
        /(\u9879\u76ee|\u8ba1\u5212|\u622a\u6b62|\u5f85\u529e|\u4efb\u52a1|\u76ee\u6807|\u9700\u6c42|\u8def\u7ebf\u56fe)/,
    ],
    interaction: [
        /\b(style|tone|call me|reply|respond)\b/i,
        /(\u8bed\u6c14|\u98ce\u683c|\u56de\u7b54\u65b9\u5f0f|\u79f0\u547c|\u8bf7\u53eb\u6211|\u5e0c\u671b\u4f60)/,
    ],
    relationship: [
        /\b(relationship|friend|family|wife|husband|girlfriend|boyfriend|partner)\b/i,
        /(\u5bb6\u4eba|\u670b\u53cb|\u540c\u4e8b|\u8001\u516c|\u8001\u5a46|\u7537\u670b\u53cb|\u5973\u670b\u53cb)/,
    ],
};

const EXPLICIT_REMEMBER_PATTERNS = [
    /\bremember\b/i,
    /(\u8bb0\u4f4f|\u8bf7\u8bb0\u4f4f|\u5e2e\u6211\u8bb0\u4f4f|\u8bb0\u4e00\u4e0b|\u522b\u5fd8\u4e86|\u4ee5\u540e\u8bb0\u5f97|\u957f\u671f\u8bb0\u4f4f)/,
];

const SENSORY_NOISE_PATTERNS = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|sure|got it|cool|great|roger|understood)[!. ]*$/i,
    /^(你好|您好|谢谢|多谢|好的|行|收到|明白了|嗯嗯)[!！。 ]*$/u,
];

const GENERIC_MEMORY_NAME_PATTERNS = [
    /^user preference$/i,
    /^user identity$/i,
    /^ongoing project$/i,
    /^interaction preference$/i,
    /^remembered user fact$/i,
];

const PROACTIVE_DURABLE_PATTERNS = {
    preference: [
        /\b(prefer|favorite|favourite|like|dislike|love|hate|always|usually|often|never|allergic|vegan|vegetarian|gluten|lactose|habit|routine|avoid)\b/i,
        /(\u559c\u6b22|\u4e0d\u559c\u6b22|\u7231\u5403|\u8fc7\u654f|\u5fcc\u53e3|\u7d20\u98df|\u4e60\u60ef|\u5e73\u65f6|\u901a\u5e38|\u4e00\u76f4|\u522b\u7ed9\u6211|\u907f\u514d)/u,
    ],
    identity: [
        /\b(i am|i'm|my name is|i work as|i work at|i live in|i study at|my birthday|i was born)\b/i,
        /(\u6211\u662f|\u6211\u53eb|\u540d\u5b57\u662f|\u5728.*\u5de5\u4f5c|\u804c\u4e1a|\u4f4f\u5728|\u751f\u65e5|\u51fa\u751f)/u,
    ],
    interaction: [
        /\b(call me|reply in|respond in|tone|style|be concise|be direct|use markdown)\b/i,
        /(\u8bf7\u53eb\u6211|\u79f0\u547c\u6211|\u56de\u7b54\u65f6|\u8bed\u6c14|\u98ce\u683c|\u7b80\u6d01|\u76f4\u63a5|\u4f7f\u7528markdown)/u,
    ],
    relationship: [
        /\b(my wife|my husband|my partner|my daughter|my son|my mom|my dad|my family)\b/i,
        /(\u6211\u8001\u5a46|\u6211\u8001\u516c|\u6211\u5bf9\u8c61|\u6211\u5973\u513f|\u6211\u513f\u5b50|\u6211\u5988|\u6211\u7238|\u6211\u5bb6\u4eba)/u,
    ],
    project: [
        /\b(project|roadmap|deadline|milestone|launch|release|recurring|every week|every month)\b/i,
        /(\u9879\u76ee|\u8def\u7ebf\u56fe|\u622a\u6b62|\u91cc\u7a0b\u7891|\u53d1\u5e03|\u6bcf\u5468|\u6bcf\u6708)/u,
    ],
    general: [],
};

function detectCategory(text = '', name = '') {
    const source = `${name} ${text}`;
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (patterns.some(pattern => pattern.test(source))) return category;
    }
    return 'general';
}

function isExplicitRememberRequest(text = '') {
    return EXPLICIT_REMEMBER_PATTERNS.some(pattern => pattern.test(String(text || '')));
}

function stripRememberInstruction(text = '') {
    return String(text || '')
        .replace(/^\s*(please\s+)?remember\s*(that)?\s*/i, '')
        .replace(/^\s*(\u8bf7\u8bb0\u4f4f|\u5e2e\u6211\u8bb0\u4f4f|\u8bb0\u4f4f|\u8bb0\u4e00\u4e0b|\u522b\u5fd8\u4e86|\u4ee5\u540e\u8bb0\u5f97)[\uff1a:,\uff0c]?\s*/u, '')
        .trim();
}

function deriveExplicitMemoryName(text = '', category = 'general') {
    const cleaned = previewText(stripRememberInstruction(text), 24) || previewText(text, 24) || 'important memory';
    if (category === 'preference') return `User Preference: ${cleaned}`;
    if (category === 'identity') return `User Identity: ${cleaned}`;
    if (category === 'project') return `Project Context: ${cleaned}`;
    if (category === 'interaction') return `Interaction Preference: ${cleaned}`;
    if (category === 'relationship') return `Relationship Context: ${cleaned}`;
    return `Remembered User Fact: ${cleaned}`;
}

function inferTags(text = '', name = '') {
    const source = `${name} ${stripMarkdown(text)}`;
    const matches = source.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}/g) || [];
    const skip = new Set([
        'memory', 'please', 'remember', 'user', 'assistant', 'none', 'yet',
    ]);
    const tags = [];
    for (const item of matches) {
        const token = item.toLowerCase();
        if (skip.has(token)) continue;
        if (!tags.includes(item)) tags.push(item);
        if (tags.length >= 8) break;
    }
    return tags;
}

function inferImportance(text = '', name = '', category = 'general') {
    const source = `${name}\n${text}`.toLowerCase();
    let score = 0.45;
    if (['identity', 'preference', 'interaction', 'project', 'relationship'].includes(category)) score += 0.15;
    if (/\b(must|important|remember|preference|birthday|deadline|todo|goal|style)\b/i.test(source)) score += 0.2;
    if (/(\u5fc5\u987b|\u4e00\u5b9a|\u957f\u671f|\u6c38\u8fdc|\u8bb0\u4f4f|\u91cd\u8981|\u504f\u597d|\u79f0\u547c|\u751f\u65e5|\u8fc7\u654f|\u7981\u5fcc|\u76ee\u6807|\u98ce\u683c)/.test(source)) score += 0.2;
    if (source.length > 300) score += 0.05;
    return Math.max(0.1, Math.min(1, Number(score.toFixed(2))));
}

function clampNumber(value, min = 0, max = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
}

function uniqueList(items = []) {
    return Array.from(new Set((items || []).filter(Boolean)));
}

function estimateTokenCount(text = '') {
    const clean = stripMarkdown(text);
    if (!clean) return 0;
    return Math.max(1, Math.ceil(clean.length / 4));
}

function trimToMax(text = '', max = 2000) {
    const source = String(text || '').trim();
    if (!source) return '';
    return source.length > max ? `${source.slice(0, max - 3)}...` : source;
}

function dedupeTextBlocks(blocks = [], max = 3200) {
    const seen = new Set();
    const merged = [];
    for (const block of blocks) {
        const normalized = stripMarkdown(block || '');
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        merged.push(String(block || '').trim());
    }
    return trimToMax(merged.filter(Boolean).join('\n\n'), max);
}

function splitIntoSentences(text = '') {
    return String(text || '')
        .split(/(?<=[.!?。！？；;])\s+|\n+/u)
        .map(item => item.trim())
        .filter(Boolean);
}

function stripSensoryNoise(text = '') {
    const sentences = splitIntoSentences(text);
    return sentences
        .filter(sentence => !SENSORY_NOISE_PATTERNS.some(pattern => pattern.test(sentence)))
        .join(' ')
        .trim();
}

function sentenceSalience(sentence = '') {
    const source = String(sentence || '').trim();
    if (!source) return 0;
    let score = 0.2;
    if (isExplicitRememberRequest(source)) score += 0.7;
    if (detectCategory(source, source) !== 'general') score += 0.25;
    if (/\b(must|need|should|deadline|prefer|important|always|never)\b/i.test(source)) score += 0.2;
    if (/(\u5fc5\u987b|\u9700\u8981|\u5e94\u8be5|\u622a\u6b62|\u504f\u597d|\u91cd\u8981|\u4e00\u76f4|\u6c38\u8fdc)/u.test(source)) score += 0.2;
    if (/\b(19|20)\d{2}\b/.test(source)) score += 0.08;
    if (source.length > 40) score += 0.05;
    if (source.length > 120) score += 0.05;
    return Number(score.toFixed(3));
}

function summarizeSalientText(text = '', { maxSentences = 3, maxChars = 220 } = {}) {
    const cleaned = stripSensoryNoise(text) || stripMarkdown(text);
    const sentences = splitIntoSentences(cleaned);
    if (!sentences.length) return previewText(cleaned, maxChars);

    const ranked = sentences
        .map((sentence, index) => ({
            sentence,
            index,
            score: sentenceSalience(sentence),
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index);

    const picked = ranked
        .slice(0, maxSentences)
        .sort((left, right) => left.index - right.index)
        .map(item => item.sentence);

    return previewText(picked.join(' '), maxChars);
}

function setSimilarity(left = [], right = []) {
    const a = new Set((left || []).filter(Boolean));
    const b = new Set((right || []).filter(Boolean));
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const item of a) {
        if (b.has(item)) overlap += 1;
    }
    return overlap / Math.max(a.size, b.size);
}

function collectTopicKeywords(text = '', name = '') {
    return uniqueList(
        inferTags(text, name)
            .map(item => normalizeSearchText(item))
            .filter(Boolean)
    ).slice(0, 10);
}

function prettifyKeyword(keyword = '') {
    return String(keyword || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferTopicLabel(text = '', category = 'general', keywords = []) {
    const prettyKeywords = keywords
        .map(prettifyKeyword)
        .filter(Boolean)
        .slice(0, 3);

    if (prettyKeywords.length) {
        return prettyKeywords.join(' / ');
    }

    if (category && category !== 'general') {
        return `${category} context`;
    }

    return previewText(text, 48) || 'general context';
}

function buildTopicKey(text = '', category = 'general', keywords = []) {
    const baseTokens = [category, ...keywords.slice(0, 3)].filter(Boolean);
    const seed = (baseTokens.length ? baseTokens : [previewText(text, 30)]).join(' ');
    return slugify(seed);
}

function groupTopicSentences(text = '') {
    const sentences = splitIntoSentences(stripSensoryNoise(text) || text);
    if (!sentences.length) return [];

    const segments = [];
    let current = null;

    for (const sentence of sentences) {
        const category = detectCategory(sentence, sentence);
        const keywords = collectTopicKeywords(sentence, sentence);
        const explicitBoundary = /(\bby the way\b|\banother thing\b|\bswitching topics?\b|\bseparately\b|\u53e6\u5916|\u987a\u4fbf|\u56de\u5230|\u6362\u4e2a\u8bdd\u9898)/iu.test(sentence);

        if (!current) {
            current = { category, keywords, sentences: [sentence] };
            continue;
        }

        const similarity = setSimilarity(current.keywords, keywords);
        const sameCategory = category === current.category && category !== 'general';

        if (!explicitBoundary && (sameCategory || similarity >= 0.22)) {
            current.sentences.push(sentence);
            current.keywords = uniqueList([...(current.keywords || []), ...keywords]).slice(0, 10);
            if (current.category === 'general' && category !== 'general') {
                current.category = category;
            }
            continue;
        }

        segments.push(current);
        current = { category, keywords, sentences: [sentence] };
    }

    if (current) segments.push(current);

    return segments.map(segment => {
        const textBlock = segment.sentences.join(' ');
        const category = segment.category || detectCategory(textBlock, textBlock);
        const keywords = uniqueList(segment.keywords || collectTopicKeywords(textBlock, textBlock)).slice(0, 10);
        return {
            category,
            keywords,
            topicLabel: inferTopicLabel(textBlock, category, keywords),
            topicKey: buildTopicKey(textBlock, category, keywords),
            text: trimToMax(textBlock, 1200),
            summary: summarizeSalientText(textBlock, { maxSentences: 2, maxChars: 180 }),
            salience: clampNumber(sentenceSalience(textBlock), 0, 1.5),
            tokenCount: estimateTokenCount(textBlock),
        };
    });
}

function summarizeTopicItems(items = []) {
    const summaries = uniqueList(
        (items || [])
            .map(item => item.summary || previewText(item.text || item.content || '', 140))
            .filter(Boolean)
    ).slice(-4);

    return trimToMax(summaries.join(' | '), 260);
}

function buildTopicCandidate(topic = {}, chatId = '') {
    const items = Array.isArray(topic.items) ? topic.items : [];
    const content = dedupeTextBlocks(items.map(item => item.text || item.content || item.summary), 2600);
    const summary = summarizeTopicItems(items) || previewText(content, 180);
    const importance = clampNumber(
        Math.max(
            topic.importance || 0,
            ...items.map(item => Number(item.importance) || Number(item.salience) || 0)
        ),
        0.35,
        0.95
    );

    return {
        id: slugify(`${topic.topicKey || topic.topicLabel || 'topic'}-${Date.now()}`),
        chatId,
        topicKey: topic.topicKey || buildTopicKey(content, topic.category, topic.keywords),
        topicLabel: topic.topicLabel || inferTopicLabel(content, topic.category, topic.keywords),
        category: topic.category || detectCategory(content, topic.topicLabel),
        summary,
        content,
        tags: uniqueList([...(topic.keywords || []), ...collectTopicKeywords(content, topic.topicLabel)]).slice(0, 10),
        importance,
        turns: items.length || 1,
        source: topic.source || 'short-term-buffer',
        createdAt: topic.createdAt || nowIso(),
        updatedAt: nowIso(),
    };
}

function deriveCanonicalMemoryName(candidate = {}) {
    const label = candidate.topicLabel || candidate.name || previewText(candidate.summary || candidate.content || '', 48);
    const trimmedLabel = trimToMax(label, 80);
    switch (candidate.category) {
    case 'preference':
        return `Preference Topic: ${trimmedLabel}`;
    case 'identity':
        return `Identity Topic: ${trimmedLabel}`;
    case 'project':
        return `Project Topic: ${trimmedLabel}`;
    case 'interaction':
        return `Interaction Topic: ${trimmedLabel}`;
    case 'relationship':
        return `Relationship Topic: ${trimmedLabel}`;
    default:
        return `Memory Topic: ${trimmedLabel}`;
    }
}

function isGenericMemoryName(name = '') {
    const source = String(name || '').trim();
    return !source || GENERIC_MEMORY_NAME_PATTERNS.some(pattern => pattern.test(source));
}

function hasDurablePattern(text = '', category = 'general') {
    const source = String(text || '').trim();
    if (!source) return false;
    const patterns = [
        ...(PROACTIVE_DURABLE_PATTERNS[category] || []),
        ...(PROACTIVE_DURABLE_PATTERNS.general || []),
    ];
    return patterns.some(pattern => pattern.test(source));
}

function deriveAutonomousMemoryName(candidate = {}) {
    if (candidate.name && !isGenericMemoryName(candidate.name)) {
        return sanitizeName(candidate.name);
    }

    const category = candidate.category || detectCategory(candidate.content || '', candidate.summary || '');
    const content = candidate.content || candidate.summary || '';
    const keywords = uniqueList([
        ...(candidate.tags || []),
        ...collectTopicKeywords(content, candidate.summary || candidate.name || ''),
    ]).slice(0, 3);
    const label = inferTopicLabel(content, category, keywords);

    switch (category) {
    case 'preference':
        return sanitizeName(`User Preference: ${label}`);
    case 'identity':
        return sanitizeName(`User Identity: ${label}`);
    case 'interaction':
        return sanitizeName(`Interaction Preference: ${label}`);
    case 'relationship':
        return sanitizeName(`Relationship Context: ${label}`);
    case 'project':
        return sanitizeName(`Project Context: ${label}`);
    default:
        return sanitizeName(`Durable Memory: ${label}`);
    }
}

function buildContentSignature(text = '') {
    const normalized = normalizeSearchText(text);
    if (!normalized) return '';
    const tokens = normalized.split(/\s+/).filter(Boolean).slice(0, 16);
    return tokens.join(' ');
}

const SEARCH_SYNONYM_GROUPS = [
    ['budget', 'expense', 'expenses', 'spend', 'spending', 'cost', 'costs', 'travel budget', 'travel expense'],
    ['\u9884\u7b97', '\u5f00\u652f', '\u652f\u51fa', '\u8d39\u7528', '\u82b1\u9500', '\u6210\u672c'],
    ['travel', 'trip', 'business trip', 'traveling', 'travelled'],
    ['\u5dee\u65c5', '\u51fa\u5dee', '\u5546\u65c5'],
    ['report', 'error', 'exception', 'stack trace', 'bug'],
    ['\u62a5\u9519', '\u9519\u8bef', '\u5f02\u5e38', '\u6545\u969c', '\u5806\u6808'],
];

const RELATIVE_YEAR_ALIASES = [
    { offset: 0, labels: ['\u4eca\u5e74', '\u672c\u5e74', 'this year', 'current year'] },
    { offset: -1, labels: ['\u53bb\u5e74', '\u4e0a\u4e00\u5e74', 'last year', 'previous year'] },
    { offset: -2, labels: ['\u524d\u5e74', '\u524d\u4e24\u5e74', 'the year before last'] },
    { offset: 1, labels: ['\u660e\u5e74', 'next year'] },
];

function normalizeSearchText(text = '') {
    return String(text || '')
        .toLowerCase()
        .replace(/[_/\\|]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s.-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getYearAliases(text = '', baseYear = new Date().getFullYear()) {
    const source = String(text || '');
    const aliases = new Set();
    const years = source.match(/\b(19|20)\d{2}\b/g) || [];

    for (const yearText of years) {
        const year = Number(yearText);
        for (const item of RELATIVE_YEAR_ALIASES) {
            if (year === baseYear + item.offset) {
                item.labels.forEach(label => aliases.add(label));
            }
        }
    }

    for (const item of RELATIVE_YEAR_ALIASES) {
        if (item.labels.some(label => source.toLowerCase().includes(label.toLowerCase()))) {
            aliases.add(String(baseYear + item.offset));
        }
    }

    return Array.from(aliases);
}

function tokenizeSearchText(text = '') {
    const normalized = normalizeSearchText(text);
    const tokens = new Set();
    if (!normalized) return [];

    const words = normalized.match(/[a-z0-9.-]{2,}/g) || [];
    words.forEach(word => tokens.add(word));

    const chineseChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
    for (const chunk of chineseChunks) {
        tokens.add(chunk);
        for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
            for (let i = 0; i <= chunk.length - size; i += 1) {
                tokens.add(chunk.slice(i, i + size));
            }
        }
    }

    return Array.from(tokens).filter(Boolean);
}

function expandSearchTerms(text = '') {
    const terms = new Set(tokenizeSearchText(text));
    getYearAliases(text).forEach(term => terms.add(normalizeSearchText(term)));

    for (const group of SEARCH_SYNONYM_GROUPS) {
        const normalizedGroup = group.map(item => normalizeSearchText(item)).filter(Boolean);
        if (normalizedGroup.some(item => terms.has(item) || normalizeSearchText(text).includes(item))) {
            normalizedGroup.forEach(item => terms.add(item));
        }
    }

    return Array.from(terms).filter(Boolean);
}

function buildMemoryDocument(memory = {}) {
    const parts = [
        memory.name,
        memory.summary,
        memory.content,
        Array.isArray(memory.tags) ? memory.tags.join(' ') : '',
        Array.isArray(memory.aliases) ? memory.aliases.join(' ') : '',
        memory.category,
    ].filter(Boolean);
    const baseText = parts.join('\n');
    const hints = [
        ...expandSearchTerms(baseText),
        ...getYearAliases(baseText),
    ];
    return [baseText, hints.join(' ')].filter(Boolean).join('\n');
}

function buildQueryDocument(query = '') {
    const normalized = normalizeSearchText(query);
    const expansions = expandSearchTerms(query);
    return [normalized, expansions.join(' ')].filter(Boolean).join('\n');
}

function cosineSimilarity(left = [], right = []) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) return 0;
    const size = Math.min(left.length, right.length);
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let i = 0; i < size; i += 1) {
        const a = Number(left[i]) || 0;
        const b = Number(right[i]) || 0;
        dot += a * b;
        leftNorm += a * a;
        rightNorm += b * b;
    }
    if (!leftNorm || !rightNorm) return 0;
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function scoreQuery(memory, query = '') {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return 0;

    const document = buildMemoryDocument(memory);
    const normalizedDoc = normalizeSearchText(document);
    const terms = expandSearchTerms(query);
    const name = normalizeSearchText(memory.name);
    const summary = normalizeSearchText(memory.summary);
    const content = normalizeSearchText(memory.content);
    const tags = normalizeSearchText((memory.tags || []).join(' '));
    const aliases = normalizeSearchText((memory.aliases || []).join(' '));
    let matchedTerms = 0;

    let score = 0;
    if (name.includes(normalizedQuery)) score += 8;
    if (summary.includes(normalizedQuery)) score += 5;
    if (content.includes(normalizedQuery)) score += 4;

    for (const term of terms) {
        if (!term) continue;
        const foundInDoc = normalizedDoc.includes(term);
        if (foundInDoc) {
            matchedTerms += 1;
            score += 0.9;
        }
        if (name.includes(term)) score += 2.2;
        if (summary.includes(term)) score += 1.8;
        if (content.includes(term)) score += 1.2;
        if (tags.includes(term)) score += 1.6;
        if (aliases.includes(term)) score += 1.6;
    }

    if (matchedTerms >= Math.min(3, terms.length)) {
        score += 3;
    }

    return Number((score + (memory.importance || 0)).toFixed(4));
}

class MemoryService {
    constructor({ dataDir, memoriesDir }) {
        this.dataDir = dataDir;
        this.memoriesDir = memoriesDir;
        this.workspaceDir = path.resolve(dataDir, '..');
        this.storePath = path.join(dataDir, 'memory_store.json');
        this.vectorStorePath = path.join(dataDir, 'memory_vectors.json');
        this.shortTermPath = path.join(dataDir, 'memory_short_term.json');
        this.sleepStorePath = path.join(dataDir, 'memory_sleep_queue.json');
        this.workingDir = path.join(dataDir, 'working_memory');
        this.sessionStatePath = path.join(this.workspaceDir, 'SESSION-STATE.md');
        this.sessionStateJsonPath = path.join(this.dataDir, 'session_state.json');
        this.curatedMemoryPath = path.join(this.workspaceDir, 'MEMORY.md');
        this.memoryArchiveDir = path.join(this.workspaceDir, 'memory');
        this.memoryTopicsDir = path.join(this.memoryArchiveDir, 'topics');
        this.memorySleepDir = path.join(this.memoryArchiveDir, 'sleep');
        this.memoryReflectionDir = path.join(this.memoryArchiveDir, 'offline-reflections');
        this.coldStorePath = path.join(this.dataDir, 'memory_cold_store.json');
        this.knowledgeGraphPath = path.join(this.dataDir, 'memory_knowledge_graph.json');
        this.embeddingModelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
        this.embeddingExtractor = null;
        this.embeddingExtractorPromise = null;
        this.embeddingDisabled = false;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        await fs.ensureDir(this.memoriesDir);
        await fs.ensureDir(this.workingDir);
        await fs.ensureDir(this.memoryArchiveDir);
        await fs.ensureDir(this.memoryTopicsDir);
        await fs.ensureDir(this.memorySleepDir);
        await fs.ensureDir(this.memoryReflectionDir);
        if (!(await fs.pathExists(this.storePath))) {
            await fs.writeJson(this.storePath, defaultStore(), { spaces: 2 });
        }
        if (!(await fs.pathExists(this.vectorStorePath))) {
            await fs.writeJson(this.vectorStorePath, { version: 1, model: this.embeddingModelName, vectors: {} }, { spaces: 2 });
        }
        if (!(await fs.pathExists(this.knowledgeGraphPath))) {
            await fs.writeJson(this.knowledgeGraphPath, defaultKnowledgeGraphStore(), { spaces: 2 });
        }
        await this.ensureWorkspaceMemoryFiles();
        await this.importLegacyTxtMemories();
        this.initialized = true;
    }

    async loadStore() {
        await this.init();
        const store = await fs.readJson(this.storePath).catch(() => defaultStore());
        return {
            ...defaultStore(),
            ...store,
            memories: Array.isArray(store.memories) ? store.memories : [],
            profiles: { ...defaultStore().profiles, ...(store.profiles || {}) },
            stats: { ...defaultStore().stats, ...(store.stats || {}) },
        };
    }

    async saveStore(store) {
        store.stats.totalMemories = store.memories.length;
        await fs.writeJson(this.storePath, store, { spaces: 2 });
        await this.syncCuratedArchive(store);
    }

    async loadKnowledgeGraph() {
        await this.init();
        const fallback = defaultKnowledgeGraphStore();
        const store = await fs.readJson(this.knowledgeGraphPath).catch(() => fallback);
        return {
            ...fallback,
            ...store,
            entities: Array.isArray(store?.entities) ? store.entities : [],
            relations: Array.isArray(store?.relations) ? store.relations : [],
            reflections: Array.isArray(store?.reflections) ? store.reflections : [],
        };
    }

    async saveKnowledgeGraph(store) {
        const normalized = {
            version: 1,
            entities: Array.isArray(store?.entities) ? store.entities.slice(0, 500) : [],
            relations: Array.isArray(store?.relations) ? store.relations.slice(0, 1200) : [],
            reflections: Array.isArray(store?.reflections) ? store.reflections.slice(0, 120) : [],
            updatedAt: nowIso(),
            lastReflectedAt: store?.lastReflectedAt || null,
        };
        await fs.writeJson(this.knowledgeGraphPath, normalized, { spaces: 2 });
        await this.syncCuratedArchive(await this.loadStore());
        return normalized;
    }

    async loadVectorStore() {
        await this.init();
        const fallback = { version: 1, model: this.embeddingModelName, vectors: {} };
        const store = await fs.readJson(this.vectorStorePath).catch(() => fallback);
        return {
            ...fallback,
            ...store,
            vectors: store && typeof store.vectors === 'object' && store.vectors ? store.vectors : {},
        };
    }

    async saveVectorStore(store) {
        const normalized = {
            version: 1,
            model: this.embeddingModelName,
            vectors: store?.vectors || {},
        };
        await fs.writeJson(this.vectorStorePath, normalized, { spaces: 2 });
    }

    async loadShortTermStore() {
        await this.init();
        const fallback = defaultShortTermStore();
        const store = await fs.readJson(this.shortTermPath).catch(() => fallback);
        return {
            ...fallback,
            ...store,
            chats: store && typeof store.chats === 'object' && store.chats ? store.chats : {},
        };
    }

    async saveShortTermStore(store) {
        const normalized = {
            version: 1,
            chats: store?.chats || {},
            updatedAt: nowIso(),
            lastFlushAt: store?.lastFlushAt || null,
        };
        await fs.writeJson(this.shortTermPath, normalized, { spaces: 2 });
        return normalized;
    }

    async loadSleepStore() {
        await this.init();
        const fallback = defaultSleepStore();
        const store = await fs.readJson(this.sleepStorePath).catch(() => fallback);
        return {
            ...fallback,
            ...store,
            queue: Array.isArray(store?.queue) ? store.queue : [],
            runs: Array.isArray(store?.runs) ? store.runs : [],
        };
    }

    async saveSleepStore(store) {
        const normalized = {
            version: 1,
            queue: Array.isArray(store?.queue) ? store.queue : [],
            runs: Array.isArray(store?.runs) ? store.runs.slice(0, 40) : [],
            updatedAt: nowIso(),
            lastRunAt: store?.lastRunAt || null,
        };
        await fs.writeJson(this.sleepStorePath, normalized, { spaces: 2 });
        return normalized;
    }

    normalizeKnowledgeEntity(entity = {}, metadata = {}) {
        const rawName = String(entity.name || entity.label || entity.id || '').trim();
        if (!rawName) return null;
        const name = sanitizeName(rawName);

        const type = String(entity.type || entity.category || metadata.defaultType || 'general')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_') || 'general';
        const summary = trimToMax(entity.summary || entity.description || entity.status || '', 240);
        const status = trimToMax(entity.status || entity.state || '', 180);
        const aliases = uniqueList([
            ...(Array.isArray(entity.aliases) ? entity.aliases : []),
            ...(Array.isArray(entity.tags) ? entity.tags : []),
        ].map(item => String(item || '').trim()).filter(Boolean)).slice(0, 12);
        const tags = uniqueList([
            type,
            ...aliases,
            ...collectTopicKeywords(`${summary}\n${status}`, name),
        ]).slice(0, 12);
        const entityId = slugify(`${type}-${name}`);

        return {
            id: entityId,
            name,
            type,
            summary,
            status,
            aliases,
            tags,
            confidence: clampNumber(entity.confidence || metadata.confidence || 0.78, 0.2, 0.99),
            source: metadata.source || entity.source || 'offline-reflection',
            updatedAt: metadata.runAt || nowIso(),
            createdAt: metadata.runAt || nowIso(),
        };
    }

    normalizeKnowledgeRelation(relation = {}, metadata = {}) {
        const rawSubject = String(relation.subject || relation.source || relation.from || '').trim();
        const predicate = String(relation.predicate || relation.relation || relation.type || '')
            .trim()
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
            .replace(/^_+|_+$/g, '');
        const object = trimToMax(relation.object || relation.target || relation.to || relation.value || '', 280);

        if (!rawSubject || !predicate || !object) return null;
        const subject = sanitizeName(rawSubject);

        const normalizedPredicate = predicate || 'related_to';
        const identitySeed = KNOWLEDGE_RELATION_SINGLE_VALUE_PREDICATES.has(normalizedPredicate)
            ? `${subject}::${normalizedPredicate}`
            : `${subject}::${normalizedPredicate}::${object}`;

        return {
            id: slugify(identitySeed),
            subject,
            subjectType: String(relation.subjectType || relation.sourceType || metadata.defaultSubjectType || 'general')
                .trim()
                .toLowerCase() || 'general',
            predicate: normalizedPredicate,
            object,
            objectType: String(relation.objectType || relation.targetType || metadata.defaultObjectType || 'fact')
                .trim()
                .toLowerCase() || 'fact',
            qualifiers: trimToMax(relation.qualifiers || relation.context || relation.timeframe || '', 200),
            evidence: trimToMax(relation.evidence || relation.note || relation.summary || '', 240),
            confidence: clampNumber(relation.confidence || metadata.confidence || 0.76, 0.2, 0.99),
            source: metadata.source || relation.source || 'offline-reflection',
            updatedAt: metadata.runAt || nowIso(),
            createdAt: metadata.runAt || nowIso(),
        };
    }

    async upsertKnowledgeGraph({ summary = '', entities = [], relations = [], reflection = null, source = 'offline-reflection', runAt = nowIso() } = {}) {
        const store = await this.loadKnowledgeGraph();
        const normalizedEntities = (Array.isArray(entities) ? entities : [])
            .map(entity => this.normalizeKnowledgeEntity(entity, { source, runAt }))
            .filter(Boolean);
        const normalizedRelations = (Array.isArray(relations) ? relations : [])
            .map(relation => this.normalizeKnowledgeRelation(relation, { source, runAt }))
            .filter(Boolean);

        for (const entity of normalizedEntities) {
            const existing = store.entities.find(item => item.id === entity.id);
            if (existing) {
                existing.summary = summarizeSalientText(
                    [existing.summary, entity.summary, entity.status].filter(Boolean).join('. '),
                    { maxSentences: 3, maxChars: 240 }
                ) || entity.summary || existing.summary;
                existing.status = entity.status || existing.status;
                existing.aliases = uniqueList([...(existing.aliases || []), ...(entity.aliases || [])]).slice(0, 12);
                existing.tags = uniqueList([...(existing.tags || []), ...(entity.tags || [])]).slice(0, 12);
                existing.confidence = Math.max(existing.confidence || 0, entity.confidence || 0);
                existing.source = entity.source || existing.source;
                existing.updatedAt = runAt;
            } else {
                store.entities.unshift(entity);
            }
        }

        for (const relation of normalizedRelations) {
            const existing = store.relations.find(item => item.id === relation.id);
            if (existing) {
                existing.object = relation.object || existing.object;
                existing.objectType = relation.objectType || existing.objectType;
                existing.qualifiers = relation.qualifiers || existing.qualifiers;
                existing.evidence = relation.evidence || existing.evidence;
                existing.confidence = Math.max(existing.confidence || 0, relation.confidence || 0);
                existing.updatedAt = runAt;
                existing.source = relation.source || existing.source;
            } else {
                store.relations.unshift(relation);
            }
        }

        if (reflection) {
            store.reflections.unshift({
                id: reflection.id || slugify(`reflection-${runAt}`),
                summary: trimToMax(reflection.summary || summary || '', 280),
                source,
                model: reflection.model || '',
                provider: reflection.provider || '',
                entityCount: normalizedEntities.length,
                relationCount: normalizedRelations.length,
                createdAt: runAt,
            });
        }

        store.lastReflectedAt = runAt;
        await this.saveKnowledgeGraph(store);
        return {
            entities: normalizedEntities,
            relations: normalizedRelations,
            reflection,
        };
    }

    async searchKnowledgeGraph(query = '', limit = 6) {
        const store = await this.loadKnowledgeGraph();
        const normalizedQuery = normalizeSearchText(query);
        const terms = normalizedQuery.split(/\s+/).filter(Boolean);

        const scoreText = (text = '') => {
            const normalized = normalizeSearchText(text);
            if (!normalized) return 0;
            if (!terms.length) return 0;

            let score = 0;
            for (const term of terms) {
                if (!term) continue;
                if (normalized.includes(term)) score += 1;
            }
            return score;
        };

        const entityMatches = store.entities
            .map(entity => {
                const score = scoreText([
                    entity.name,
                    entity.type,
                    entity.summary,
                    entity.status,
                    ...(entity.aliases || []),
                    ...(entity.tags || []),
                ].join('\n'));

                return {
                    kind: 'entity',
                    score: score + (entity.confidence || 0) + ((entity.status || entity.summary) ? 0.3 : 0),
                    item: entity,
                };
            })
            .filter(entry => terms.length ? entry.score > 0 : true);

        const relationMatches = store.relations
            .map(relation => {
                const score = scoreText([
                    relation.subject,
                    relation.subjectType,
                    relation.predicate,
                    relation.object,
                    relation.objectType,
                    relation.qualifiers,
                    relation.evidence,
                ].join('\n'));

                return {
                    kind: 'relation',
                    score: score + (relation.confidence || 0) + 0.4,
                    item: relation,
                };
            })
            .filter(entry => terms.length ? entry.score > 0 : true);

        return [...relationMatches, ...entityMatches]
            .sort((left, right) => right.score - left.score || new Date(right.item.updatedAt || 0) - new Date(left.item.updatedAt || 0))
            .slice(0, limit);
    }

    async recordOfflineReflectionRun({ summary = '', provider = '', model = '', entities = [], relations = [], runAt = nowIso() } = {}) {
        const store = await this.loadStore();
        store.stats.lastOfflineReflectionAt = runAt;
        await this.saveStore(store);

        return this.upsertKnowledgeGraph({
            summary,
            entities,
            relations,
            source: 'offline-reflection',
            runAt,
            reflection: {
                id: slugify(`offline-reflection-${runAt}`),
                summary,
                provider,
                model,
            },
        });
    }

    async getEmbeddingExtractor() {
        if (this.embeddingDisabled) return null;
        if (this.embeddingExtractor) return this.embeddingExtractor;
        if (!this.embeddingExtractorPromise) {
            this.embeddingExtractorPromise = (async () => {
                try {
                    const { pipeline, env } = await import('@xenova/transformers');
                    if (env && this.dataDir) {
                        env.cacheDir = path.join(this.dataDir, 'models-cache');
                    }
                    const extractor = await pipeline('feature-extraction', this.embeddingModelName);
                    this.embeddingExtractor = extractor;
                    return extractor;
                } catch (error) {
                    this.embeddingDisabled = true;
                    console.warn('[Memory] Vector embeddings disabled:', error.message);
                    return null;
                }
            })();
        }
        return this.embeddingExtractorPromise;
    }

    async embedText(text = '') {
        const source = String(text || '').trim();
        if (!source) return null;
        const extractor = await this.getEmbeddingExtractor();
        if (!extractor) return null;
        const result = await extractor(source, { pooling: 'mean', normalize: true });
        if (result?.data) return Array.from(result.data, value => Number(value));
        if (Array.isArray(result)) return result.flat(Infinity).map(value => Number(value));
        return null;
    }

    async upsertVectorEntry(memory, vectorStore = null) {
        if (!memory?.id) return vectorStore;
        const store = vectorStore || await this.loadVectorStore();
        const embedding = await this.embedText(buildMemoryDocument(memory));
        if (!embedding?.length) return store;
        store.vectors[memory.id] = {
            embedding,
            updatedAt: memory.updatedAt || nowIso(),
        };
        if (!vectorStore) {
            await this.saveVectorStore(store);
        }
        return store;
    }

    async deleteVectorEntry(memoryId, vectorStore = null) {
        if (!memoryId) return vectorStore;
        const store = vectorStore || await this.loadVectorStore();
        if (store.vectors[memoryId]) {
            delete store.vectors[memoryId];
            if (!vectorStore) {
                await this.saveVectorStore(store);
            }
        }
        return store;
    }

    async ensureVectorCoverage(memories = []) {
        if (this.embeddingDisabled || !Array.isArray(memories) || memories.length === 0) {
            return this.loadVectorStore();
        }

        const vectorStore = await this.loadVectorStore();
        let changed = false;
        const liveIds = new Set(memories.map(memory => memory.id));

        for (const memory of memories) {
            const current = vectorStore.vectors[memory.id];
            if (!current || current.updatedAt !== memory.updatedAt) {
                const embedding = await this.embedText(buildMemoryDocument(memory));
                if (embedding?.length) {
                    vectorStore.vectors[memory.id] = {
                        embedding,
                        updatedAt: memory.updatedAt || nowIso(),
                    };
                    changed = true;
                }
            }
        }

        for (const id of Object.keys(vectorStore.vectors)) {
            if (!liveIds.has(id)) {
                delete vectorStore.vectors[id];
                changed = true;
            }
        }

        if (changed) {
            await this.saveVectorStore(vectorStore);
        }

        return vectorStore;
    }

    async getSemanticScores(query = '', memories = []) {
        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery || this.embeddingDisabled || !memories.length) {
            return new Map();
        }

        try {
            const vectorStore = await this.ensureVectorCoverage(memories);
            const queryEmbedding = await this.embedText(buildQueryDocument(query));
            if (!queryEmbedding?.length) return new Map();

            const scores = new Map();
            for (const memory of memories) {
                const entry = vectorStore.vectors[memory.id];
                if (!entry?.embedding?.length) continue;
                scores.set(memory.id, Math.max(0, cosineSimilarity(queryEmbedding, entry.embedding)));
            }
            return scores;
        } catch (error) {
            console.warn('[Memory] Semantic search fallback to keyword mode:', error.message);
            return new Map();
        }
    }

    renderSessionState(state = {}) {
        const pendingActions = (state.pendingActions || []).length
            ? state.pendingActions.map(item => `- [ ] ${item}`).join('\n')
            : '- [ ] None';
        const keyContext = (state.keyContext || []).length
            ? (state.keyContext || []).map(item => `- ${item}`).join('\n')
            : '[None yet]';
        const recentDecisions = (state.recentDecisions || []).length
            ? (state.recentDecisions || []).map(item => `- ${item}`).join('\n')
            : '[None yet]';
        const topicFocus = (state.topicFocus || []).length
            ? (state.topicFocus || []).map(item => `- ${item}`).join('\n')
            : '[None yet]';

        return [
            '# SESSION-STATE.md - Active Working Memory',
            '',
            'This file is the agent WAL hot RAM. It must be updated before responding when durable context changes.',
            '',
            '## Current Task',
            state.currentTask || '[None]',
            '',
            '## Key Context',
            keyContext,
            '',
            '## Topic Focus',
            topicFocus,
            '',
            '## Pending Actions',
            pendingActions,
            '',
            '## Recent Decisions',
            recentDecisions,
            '',
            '## Memory Pressure',
            state.memoryPressure || '[Stable]',
            '',
            '---',
            `Last updated: ${state.updatedAt || nowIso()}`,
        ].join('\n');
    }

    async ensureWorkspaceMemoryFiles() {
        const defaultState = {
            currentTask: '[None]',
            keyContext: [],
            topicFocus: [],
            pendingActions: [],
            recentDecisions: [],
            memoryPressure: '[Stable]',
            updatedAt: nowIso(),
        };
        if (!(await fs.pathExists(this.sessionStateJsonPath))) {
            await fs.writeJson(this.sessionStateJsonPath, defaultState, { spaces: 2 });
        }
        if (!(await fs.pathExists(this.sessionStatePath))) {
            await fs.writeFile(this.sessionStatePath, this.renderSessionState(defaultState), 'utf8');
        }
        if (!(await fs.pathExists(this.curatedMemoryPath))) {
            await fs.writeFile(this.curatedMemoryPath, [
                '# MEMORY.md',
                '',
                'Curated long-term memory summary for the agent.',
                '',
                '## Preferences',
                '[None yet]',
                '',
                '## Identity',
                '[None yet]',
                '',
                '## Projects',
                '[None yet]',
                '',
                '## Interaction Style',
                '[None yet]',
                '',
                '## Memory Pipeline',
                '- Long-term memories: 0',
                '- Short-term topics: 0',
                '- Pending sleep queue: 0',
                '- Structured entities: 0',
                '- Structured relations: 0',
                '- Last sleep cycle: [Not run yet]',
                '- Last offline reflection: [Not run yet]',
                '',
                '## Structured Knowledge',
                '[None yet]',
                '',
                '## Recent Important Memories',
                '[None yet]',
                '',
            ].join('\n'), 'utf8');
        }
        if (!(await fs.pathExists(this.coldStorePath))) {
            await fs.writeJson(this.coldStorePath, { version: 1, decisions: [], updatedAt: null }, { spaces: 2 });
        }
        if (!(await fs.pathExists(this.shortTermPath))) {
            await fs.writeJson(this.shortTermPath, defaultShortTermStore(), { spaces: 2 });
        }
        if (!(await fs.pathExists(this.sleepStorePath))) {
            await fs.writeJson(this.sleepStorePath, defaultSleepStore(), { spaces: 2 });
        }
    }

    async loadSessionState() {
        await this.init();
        const fallback = {
            currentTask: '[None]',
            keyContext: [],
            topicFocus: [],
            pendingActions: [],
            recentDecisions: [],
            memoryPressure: '[Stable]',
            updatedAt: nowIso(),
        };
        const state = await fs.readJson(this.sessionStateJsonPath).catch(() => fallback);
        return { ...fallback, ...state };
    }

    async saveSessionState(state) {
        const normalized = {
            currentTask: state.currentTask || '[None]',
            keyContext: Array.from(new Set((state.keyContext || []).filter(Boolean))).slice(0, 10),
            topicFocus: Array.from(new Set((state.topicFocus || []).filter(Boolean))).slice(0, 8),
            pendingActions: Array.from(new Set((state.pendingActions || []).filter(Boolean))).slice(0, 10),
            recentDecisions: Array.from(new Set((state.recentDecisions || []).filter(Boolean))).slice(0, 10),
            memoryPressure: state.memoryPressure || '[Stable]',
            updatedAt: nowIso(),
        };
        await fs.writeJson(this.sessionStateJsonPath, normalized, { spaces: 2 });
        await fs.writeFile(this.sessionStatePath, this.renderSessionState(normalized), 'utf8');
        return normalized;
    }

    captureSensorySnapshot({ userMessage = '', assistantMessage = '' } = {}) {
        const cleanedUser = stripRememberInstruction(userMessage) || userMessage;
        const userDigest = summarizeSalientText(cleanedUser, { maxSentences: 3, maxChars: 220 });
        const assistantDigest = summarizeSalientText(assistantMessage, { maxSentences: 2, maxChars: 180 });
        const combinedSource = [userDigest || cleanedUser, assistantDigest].filter(Boolean).join('\n');
        const segments = groupTopicSentences(combinedSource || [cleanedUser, assistantMessage].filter(Boolean).join('\n'));
        const segmentImportance = segments.map(segment =>
            clampNumber(
                Math.max(
                    Number(segment.salience) || 0,
                    inferImportance(segment.text, segment.topicLabel, segment.category)
                ),
                0.2,
                0.95
            )
        );
        const importance = clampNumber(
            Math.max(
                isExplicitRememberRequest(userMessage) ? 0.95 : 0,
                detectCategory(cleanedUser, cleanedUser) !== 'general' ? 0.58 : 0.3,
                ...segmentImportance
            ),
            0.15,
            0.98
        );

        return {
            userDigest,
            assistantDigest,
            combinedDigest: summarizeSalientText(combinedSource, { maxSentences: 4, maxChars: 260 }),
            segments,
            importance,
            shouldStage: isExplicitRememberRequest(userMessage)
                || segments.some(segment => segment.category !== 'general' || (segment.salience || 0) >= 0.45),
        };
    }

    normalizePromotionCandidate(candidate = {}, chatId = '') {
        const category = candidate.category || detectCategory(candidate.content || '', candidate.summary || candidate.name || '');
        const content = trimToMax(candidate.content || candidate.text || candidate.summary || '', 3200);
        const summary = candidate.summary || previewText(content, 180);
        const tags = uniqueList([
            ...(candidate.tags || []),
            ...(candidate.keywords || []),
            ...collectTopicKeywords(content, candidate.name || candidate.topicLabel || summary),
        ]).slice(0, 12);

        return {
            id: candidate.id || slugify(`${candidate.topicKey || candidate.name || summary}-${Date.now()}`),
            chatId: candidate.chatId || chatId || '',
            name: candidate.name || '',
            topicKey: candidate.topicKey || buildTopicKey(content, category, tags),
            topicLabel: candidate.topicLabel || inferTopicLabel(content, category, tags),
            category,
            summary,
            content,
            tags,
            importance: clampNumber(
                candidate.importance || inferImportance(content, candidate.name || candidate.topicLabel || '', category),
                0.2,
                0.98
            ),
            turns: Number(candidate.turns || candidate.observationCount || candidate.items?.length || 1),
            source: candidate.source || 'auto-fallback',
            createdAt: candidate.createdAt || nowIso(),
        };
    }

    getAutonomousPromotionScore(candidate = {}) {
        const normalized = this.normalizePromotionCandidate(candidate, candidate.chatId || '');
        const sourceText = `${normalized.summary}\n${normalized.content}`;
        const durableCategory = ['preference', 'identity', 'interaction', 'relationship'].includes(normalized.category);
        const durableSignal = hasDurablePattern(sourceText, normalized.category);
        const repeatedSignal = normalized.turns >= 2;
        const llmSignal = normalized.source === 'auto-llm';
        const explicitSignal = normalized.source === 'explicit-request';
        let score = normalized.importance;

        if (durableCategory) score += 0.2;
        if (durableSignal) score += 0.18;
        if (repeatedSignal) score += 0.12;
        if (llmSignal) score += 0.05;
        if (explicitSignal) score += 0.4;
        if (normalized.category === 'identity' && normalized.importance >= 0.68) score += 0.12;
        if (normalized.category === 'interaction' && normalized.importance >= 0.68) score += 0.1;
        if (normalized.category === 'project' && repeatedSignal && durableSignal) score += 0.08;

        return {
            candidate: normalized,
            durableCategory,
            durableSignal,
            repeatedSignal,
            score: Number(score.toFixed(3)),
        };
    }

    shouldPromoteAutonomously(candidate = {}) {
        const evaluation = this.getAutonomousPromotionScore(candidate);
        const { durableCategory, durableSignal, repeatedSignal, score } = evaluation;
        const category = evaluation.candidate.category;
        const projectRecurringSignal = /(\bevery week\b|\bevery month\b|\bweekly\b|\bmonthly\b|\brecurring\b|\blong-term\b|\u6bcf\u5468|\u6bcf\u6708|\u4f8b\u884c|\u957f\u671f)/iu
            .test(`${evaluation.candidate.summary}\n${evaluation.candidate.content}`);

        const shouldPromote = category === 'identity'
            ? score >= 0.82
            : durableCategory
                ? (score >= 0.88 || (evaluation.candidate.importance >= 0.72 && (durableSignal || repeatedSignal)))
                : category === 'project'
                    ? (score >= 1.08 && evaluation.candidate.importance >= 0.88 && repeatedSignal && projectRecurringSignal)
                    : score >= 1.02;

        return {
            ...evaluation,
            shouldPromote,
        };
    }

    async saveAutonomousCandidates(candidates = [], { source = 'auto-proactive', merge = true } = {}) {
        const saved = [];
        const pending = [];
        const promotedCandidates = [];

        for (const rawCandidate of candidates || []) {
            const evaluation = this.shouldPromoteAutonomously(rawCandidate);
            if (!evaluation.shouldPromote) {
                pending.push(evaluation.candidate);
                continue;
            }

            const candidate = evaluation.candidate;
            const memory = await this.upsertMemory({
                name: deriveAutonomousMemoryName(candidate),
                summary: candidate.summary,
                content: candidate.content,
                category: candidate.category,
                tags: candidate.tags,
                aliases: uniqueList([candidate.topicLabel, candidate.topicKey, ...(candidate.tags || [])]).slice(0, 12),
                importance: clampNumber(Math.max(candidate.importance, evaluation.score), 0.4, 0.99),
                auto: true,
                source: `${source}:${candidate.source || 'candidate'}`,
                merge,
            });
            saved.push(memory);
            promotedCandidates.push(candidate);
        }

        return { saved, pending, promotedCandidates };
    }

    async syncAutonomousSessionState(savedMemories = [], pendingCandidates = []) {
        if ((!savedMemories || !savedMemories.length) && (!pendingCandidates || !pendingCandidates.length)) {
            return null;
        }

        const state = await this.loadSessionState();
        state.keyContext = [
            ...(savedMemories || []).map(memory => `[${memory.category}] ${memory.summary || memory.name}`),
            ...(state.keyContext || []),
        ].slice(0, 10);
        state.topicFocus = [
            ...(pendingCandidates || []).map(item => item.topicLabel || item.summary),
            ...(savedMemories || []).map(memory => memory.name),
            ...(state.topicFocus || []),
        ].slice(0, 8);
        if (savedMemories.length) {
            state.memoryPressure = '[Stable - proactive capture succeeded]';
        }
        return this.saveSessionState(state);
    }

    pruneShortTermStore(store) {
        const nextStore = { ...defaultShortTermStore(), ...(store || {}) };
        const cutoff = Date.now() - (3 * 24 * 60 * 60 * 1000);
        const nextChats = {};

        for (const [chatId, chat] of Object.entries(nextStore.chats || {})) {
            const topics = Object.entries(chat?.topics || {})
                .sort((left, right) => new Date(right[1]?.updatedAt || 0) - new Date(left[1]?.updatedAt || 0))
                .slice(0, 10)
                .reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {});

            const updatedAt = new Date(chat?.updatedAt || 0).getTime();
            if (!Object.keys(topics).length && updatedAt && updatedAt < cutoff) {
                continue;
            }

            nextChats[chatId] = {
                chatId,
                recentTurns: Array.isArray(chat?.recentTurns) ? chat.recentTurns.slice(-8) : [],
                topics,
                updatedAt: chat?.updatedAt || null,
            };
        }

        nextStore.chats = nextChats;
        nextStore.updatedAt = nowIso();
        return nextStore;
    }

    async updateShortTermMemory(chatId, { userMessage = '', assistantMessage = '' } = {}) {
        if (!chatId) return { buffered: [], flushed: [], sensory: this.captureSensorySnapshot({ userMessage, assistantMessage }) };

        const sensory = this.captureSensorySnapshot({ userMessage, assistantMessage });
        if (!sensory.shouldStage) {
            return { buffered: [], flushed: [], sensory };
        }

        const store = await this.loadShortTermStore();
        const currentChat = store.chats[chatId] || { chatId, recentTurns: [], topics: {}, updatedAt: null };
        currentChat.recentTurns = Array.isArray(currentChat.recentTurns) ? currentChat.recentTurns : [];
        currentChat.recentTurns.push({
            at: nowIso(),
            user: sensory.userDigest || previewText(userMessage, 120),
            assistant: sensory.assistantDigest || previewText(assistantMessage, 120),
        });
        currentChat.recentTurns = currentChat.recentTurns.slice(-8);

        const buffered = [];
        const flushed = [];
        const flushThreshold = 3;

        for (const segment of sensory.segments) {
            if (!segment?.text) continue;
            const existing = currentChat.topics[segment.topicKey] || {
                topicKey: segment.topicKey,
                topicLabel: segment.topicLabel,
                category: segment.category,
                keywords: segment.keywords || [],
                items: [],
                tokenCount: 0,
                importance: 0,
                createdAt: nowIso(),
                updatedAt: null,
                source: 'short-term-buffer',
            };

            const item = {
                text: segment.text,
                summary: segment.summary,
                salience: clampNumber(segment.salience || 0, 0.1, 1),
                importance: clampNumber(
                    Math.max(
                        inferImportance(segment.text, segment.topicLabel, segment.category),
                        segment.salience || 0
                    ),
                    0.25,
                    0.95
                ),
                createdAt: nowIso(),
            };

            const lastSummary = existing.items[existing.items.length - 1]?.summary;
            if (lastSummary && lastSummary === item.summary) {
                continue;
            }

            existing.items.push(item);
            existing.items = existing.items.slice(-6);
            existing.topicLabel = segment.topicLabel || existing.topicLabel;
            existing.category = segment.category || existing.category;
            existing.keywords = uniqueList([...(existing.keywords || []), ...(segment.keywords || [])]).slice(0, 10);
            existing.summary = summarizeTopicItems(existing.items);
            existing.tokenCount = estimateTokenCount(existing.items.map(entry => entry.text).join('\n'));
            existing.importance = clampNumber(
                Math.max(
                    existing.importance || 0,
                    item.importance,
                    inferImportance(existing.summary || existing.items.map(entry => entry.text).join(' '), existing.topicLabel, existing.category)
                ),
                0.3,
                0.96
            );
            existing.updatedAt = nowIso();
            currentChat.topics[segment.topicKey] = existing;

            if (existing.items.length >= flushThreshold || existing.tokenCount >= 180) {
                flushed.push(buildTopicCandidate(existing, chatId));
                delete currentChat.topics[segment.topicKey];
                store.lastFlushAt = nowIso();
            } else {
                buffered.push(existing);
            }
        }

        currentChat.updatedAt = nowIso();
        store.chats[chatId] = currentChat;
        await this.saveShortTermStore(this.pruneShortTermStore(store));

        return { buffered, flushed, sensory };
    }

    async appendTopicSnapshot(candidate = {}) {
        if (!candidate?.topicKey) return;
        await this.init();
        const filePath = path.join(this.memoryTopicsDir, `${candidate.topicKey}.md`);
        const existing = await fs.readFile(filePath, 'utf8').catch(() => `# ${candidate.topicLabel || candidate.topicKey}\n`);
        const lines = [
            '',
            `## ${candidate.updatedAt || nowIso()}`,
            `Category: ${candidate.category || 'general'}`,
            candidate.summary ? `Summary: ${candidate.summary}` : '',
            candidate.content || '',
        ].filter(Boolean);
        await fs.writeFile(filePath, `${existing.trimEnd()}\n${lines.join('\n\n')}\n`, 'utf8');
    }

    combineSleepCandidates(candidates = []) {
        const items = (candidates || []).filter(Boolean);
        const base = items[0] || {};
        const content = dedupeTextBlocks(items.map(item => item.content || item.summary), 3200);
        const summary = summarizeSalientText(items.map(item => item.summary || item.content).join('. '), {
            maxSentences: 4,
            maxChars: 260,
        }) || previewText(content, 200);

        return {
            ...base,
            topicKey: base.topicKey || buildTopicKey(content, base.category, base.tags),
            topicLabel: base.topicLabel || inferTopicLabel(content, base.category, base.tags),
            summary,
            content,
            tags: uniqueList(items.flatMap(item => item.tags || item.keywords || [])).slice(0, 12),
            importance: clampNumber(
                Math.max(...items.map(item => Number(item.importance) || 0.35)),
                0.35,
                0.98
            ),
            turns: items.reduce((total, item) => total + (Number(item.turns) || 1), 0),
            updatedAt: nowIso(),
        };
    }

    async enqueueSleepCandidates(candidates = [], reason = 'auto') {
        const validCandidates = (candidates || []).filter(item => item?.content || item?.summary);
        if (!validCandidates.length) return [];

        const sleepStore = await this.loadSleepStore();
        const queued = [];

        for (const candidate of validCandidates) {
            const normalized = {
                id: candidate.id || slugify(`${candidate.topicKey || candidate.topicLabel || candidate.summary}-${Date.now()}`),
                topicKey: candidate.topicKey || buildTopicKey(candidate.content, candidate.category, candidate.tags),
                topicLabel: candidate.topicLabel || inferTopicLabel(candidate.content, candidate.category, candidate.tags),
                category: candidate.category || detectCategory(candidate.content || '', candidate.summary || ''),
                summary: candidate.summary || previewText(candidate.content || '', 160),
                content: trimToMax(candidate.content || candidate.summary || '', 3200),
                tags: uniqueList(candidate.tags || candidate.keywords || []).slice(0, 12),
                importance: clampNumber(candidate.importance || inferImportance(candidate.content || '', candidate.topicLabel || '', candidate.category), 0.3, 0.98),
                turns: Number(candidate.turns) || 1,
                source: candidate.source || 'sleep-queue',
                chatIds: uniqueList([candidate.chatId].filter(Boolean)),
                createdAt: candidate.createdAt || nowIso(),
                updatedAt: nowIso(),
                reasons: uniqueList([reason].filter(Boolean)),
            };

            const existingIndex = sleepStore.queue.findIndex(item =>
                item.topicKey === normalized.topicKey && item.category === normalized.category
            );

            if (existingIndex >= 0) {
                const merged = this.combineSleepCandidates([sleepStore.queue[existingIndex], normalized]);
                sleepStore.queue[existingIndex] = {
                    ...sleepStore.queue[existingIndex],
                    ...merged,
                    chatIds: uniqueList([
                        ...(sleepStore.queue[existingIndex].chatIds || []),
                        ...normalized.chatIds,
                    ]),
                    reasons: uniqueList([
                        ...(sleepStore.queue[existingIndex].reasons || []),
                        ...normalized.reasons,
                    ]),
                };
                queued.push(sleepStore.queue[existingIndex]);
                await this.appendTopicSnapshot(sleepStore.queue[existingIndex]);
                continue;
            }

            sleepStore.queue.unshift(normalized);
            queued.push(normalized);
            await this.appendTopicSnapshot(normalized);
        }

        sleepStore.queue = sleepStore.queue
            .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
            .slice(0, 200);
        await this.saveSleepStore(sleepStore);
        return queued;
    }

    async searchPendingMemories(query = '', limit = 4) {
        const sleepStore = await this.loadSleepStore();
        const items = sleepStore.queue || [];
        if (!query) {
            return items.slice(0, limit);
        }

        return items
            .map(item => ({
                item,
                score: scoreQuery({
                    name: deriveCanonicalMemoryName(item),
                    summary: item.summary,
                    content: item.content,
                    tags: item.tags || [],
                    aliases: [item.topicLabel, item.topicKey].filter(Boolean),
                    importance: item.importance || 0,
                }, query),
            }))
            .filter(entry => entry.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, limit)
            .map(entry => entry.item);
    }

    async getShortTermContext(chatId = '', query = '', limit = 4) {
        if (!chatId) return { topics: [], summaryText: '' };
        const store = await this.loadShortTermStore();
        const chat = store.chats[chatId];
        const topics = Object.values(chat?.topics || {});
        const selected = query
            ? topics
                .map(topic => ({
                    topic,
                    score: scoreQuery({
                        name: topic.topicLabel,
                        summary: topic.summary,
                        content: topic.items?.map(item => item.text).join('\n') || '',
                        tags: topic.keywords || [],
                        aliases: [topic.topicKey].filter(Boolean),
                        importance: topic.importance || 0,
                    }, query),
                }))
                .filter(entry => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .slice(0, limit)
                .map(entry => entry.topic)
            : topics
                .slice()
                .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
                .slice(0, limit);

        return {
            topics: selected,
            summaryText: selected.length
                ? selected.map(topic => `- [${topic.category}] ${topic.topicLabel}: ${topic.summary}`).join('\n')
                : '',
        };
    }

    async appendSleepLog(run = {}, candidates = []) {
        await this.init();
        const filePath = path.join(this.memorySleepDir, `${new Date().toISOString().slice(0, 10)}.md`);
        const existing = await fs.readFile(filePath, 'utf8').catch(() => '# Sleep Cycles\n');
        const lines = [
            '',
            `## ${run.finishedAt || nowIso()} (${run.reason || 'auto'})`,
            `Processed topics: ${run.processed || 0}`,
            candidates.length
                ? candidates.map(item => `- [${item.category}] ${item.topicLabel || item.name}: ${item.summary}`).join('\n')
                : '- [none]',
        ];
        await fs.writeFile(filePath, `${existing.trimEnd()}\n${lines.join('\n')}\n`, 'utf8');
    }

    async runSleepCycle({ reason = 'manual', sleepStore = null, force = false } = {}) {
        const queueStore = sleepStore || await this.loadSleepStore();
        if (!queueStore.queue.length && !force) {
            return { processed: 0, consolidated: [], queueSize: 0, skipped: true };
        }

        const groups = new Map();
        for (const item of queueStore.queue) {
            const key = `${item.category || 'general'}::${item.topicKey || slugify(item.topicLabel || item.summary || 'memory')}`;
            const group = groups.get(key) || [];
            group.push(item);
            groups.set(key, group);
        }

        const consolidatedCandidates = Array.from(groups.values()).map(group => this.combineSleepCandidates(group));
        const consolidatedMemories = [];

        for (const candidate of consolidatedCandidates) {
            const memory = await this.upsertMemory({
                name: deriveCanonicalMemoryName(candidate),
                summary: candidate.summary,
                content: candidate.content,
                category: candidate.category,
                tags: candidate.tags,
                aliases: uniqueList([candidate.topicLabel, candidate.topicKey, ...(candidate.tags || [])]).slice(0, 12),
                importance: candidate.importance,
                auto: true,
                source: `sleep-cycle:${candidate.source || 'queue'}`,
                merge: true,
            });
            consolidatedMemories.push(memory);
        }

        const finishedAt = nowIso();
        queueStore.queue = [];
        queueStore.lastRunAt = finishedAt;
        queueStore.runs.unshift({
            id: slugify(`sleep-${finishedAt}`),
            reason,
            processed: consolidatedCandidates.length,
            finishedAt,
            topics: consolidatedCandidates
                .map(item => `[${item.category}] ${item.topicLabel || item.summary}`)
                .slice(0, 12),
        });
        await this.saveSleepStore(queueStore);
        await this.appendSleepLog({
            reason,
            processed: consolidatedCandidates.length,
            finishedAt,
        }, consolidatedCandidates);

        const store = await this.loadStore();
        store.stats.lastSleepCycleAt = finishedAt;
        await this.saveStore(store);

        return {
            processed: consolidatedCandidates.length,
            consolidated: consolidatedMemories,
            queueSize: queueStore.queue.length,
        };
    }

    async maybeRunSleepCycle({ force = false, reason = 'auto' } = {}) {
        const sleepStore = await this.loadSleepStore();
        if (!sleepStore.queue.length) {
            return { processed: 0, consolidated: [], queueSize: 0, skipped: true };
        }

        const lastRunMs = sleepStore.lastRunAt ? new Date(sleepStore.lastRunAt).getTime() : 0;
        const oldestMs = new Date(sleepStore.queue[sleepStore.queue.length - 1]?.updatedAt || Date.now()).getTime();
        const shouldRun = force
            || sleepStore.queue.length >= 8
            || (Date.now() - oldestMs) >= (20 * 60 * 1000)
            || (lastRunMs && (Date.now() - lastRunMs) >= (30 * 60 * 1000));

        if (!shouldRun) {
            return { processed: 0, consolidated: [], queueSize: sleepStore.queue.length, skipped: true };
        }

        return this.runSleepCycle({ reason, sleepStore, force: true });
    }

    async getSystemStatus({ store = null, shortTerm = null, sleepStore = null } = {}) {
        const longTermStore = store || await this.loadStore();
        const shortTermStore = shortTerm || await this.loadShortTermStore();
        const pendingStore = sleepStore || await this.loadSleepStore();
        const knowledgeStore = await this.loadKnowledgeGraph();
        const activeTopics = Object.values(shortTermStore.chats || {})
            .flatMap(chat => Object.values(chat?.topics || {}))
            .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
            .slice(0, 6)
            .map(topic => ({
                topicLabel: topic.topicLabel,
                category: topic.category,
                summary: topic.summary,
                updatedAt: topic.updatedAt,
            }));
        const shortTermTopicCount = Object.values(shortTermStore.chats || {})
            .reduce((total, chat) => total + Object.keys(chat?.topics || {}).length, 0);

        return {
            longTermCount: longTermStore.memories.length,
            shortTermTopicCount,
            pendingQueueSize: pendingStore.queue.length,
            lastAutoCaptureAt: longTermStore.stats.lastAutoCaptureAt || null,
            lastSleepCycleAt: pendingStore.lastRunAt || longTermStore.stats.lastSleepCycleAt || null,
            lastOfflineReflectionAt: longTermStore.stats.lastOfflineReflectionAt || knowledgeStore.lastReflectedAt || null,
            knowledgeEntityCount: knowledgeStore.entities.length,
            knowledgeRelationCount: knowledgeStore.relations.length,
            activeTopics,
            recentSleepRuns: (pendingStore.runs || []).slice(0, 3),
            recentReflections: (knowledgeStore.reflections || []).slice(0, 3),
        };
    }

    inferPendingActions(text = '') {
        const source = String(text || '').trim();
        if (!source) return [];
        const actions = [];
        if (/(\u8bf7|\u5e2e\u6211|\u9700\u8981|\u60f3\u8981|\u5f85\u529e|todo|need to|please)/i.test(source)) {
            actions.push(previewText(stripRememberInstruction(source), 100));
        }
        return actions;
    }

    inferDecision(text = '') {
        const source = String(text || '').trim();
        if (!source) return '';
        if (/(\u51b3\u5b9a|\u6539\u6210|\u7528|\u91c7\u7528|\u4e0d\u7528|we should|let's use|decide)/i.test(source)) {
            return previewText(source, 120);
        }
        return '';
    }

    async appendDailyLog({ chatId = '', userMessage = '', assistantMessage = '', memories = [] } = {}) {
        await this.init();
        const date = new Date().toISOString().slice(0, 10);
        const filePath = path.join(this.memoryArchiveDir, `${date}.md`);
        const existing = await fs.readFile(filePath, 'utf8').catch(() => `# ${date}\n`);
        const lines = [
            '',
            `## ${new Date().toLocaleTimeString()}`,
            chatId ? `Chat: ${chatId}` : '',
            userMessage ? `User: ${stripMarkdown(userMessage)}` : '',
            assistantMessage ? `Assistant: ${previewText(assistantMessage, 200)}` : '',
            memories.length ? `Captured memories:\n${memories.map(item => `- [${item.category}] ${item.name}`).join('\n')}` : '',
        ].filter(Boolean);
        await fs.writeFile(filePath, `${existing.trimEnd()}\n${lines.join('\n')}\n`, 'utf8');
    }

    async syncCuratedArchive(store) {
        await this.ensureWorkspaceMemoryFiles();
        const system = await this.getSystemStatus({ store });
        const knowledgeStore = await this.loadKnowledgeGraph();
        const topMemories = store.memories
            .slice()
            .sort((a, b) => (b.importance || 0) - (a.importance || 0))
            .slice(0, 12);
        const topKnowledgeRelations = knowledgeStore.relations
            .slice()
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
            .slice(0, 8);
        const memoryMd = [
            '# MEMORY.md',
            '',
            'Curated long-term memory summary for the agent.',
            '',
            '## Preferences',
            store.profiles.preferences || '[None yet]',
            '',
            '## Identity',
            store.profiles.identity || '[None yet]',
            '',
            '## Projects',
            store.profiles.projects || '[None yet]',
            '',
            '## Interaction Style',
            store.profiles.relationship_style || '[None yet]',
            '',
            '## Memory Pipeline',
            `- Long-term memories: ${system.longTermCount}`,
            `- Short-term topics: ${system.shortTermTopicCount}`,
            `- Pending sleep queue: ${system.pendingQueueSize}`,
            `- Structured entities: ${system.knowledgeEntityCount}`,
            `- Structured relations: ${system.knowledgeRelationCount}`,
            `- Last auto capture: ${system.lastAutoCaptureAt || '[None yet]'}`,
            `- Last sleep cycle: ${system.lastSleepCycleAt || '[Not run yet]'}`,
            `- Last offline reflection: ${system.lastOfflineReflectionAt || '[Not run yet]'}`,
            '',
            '## Active Short-Term Topics',
            system.activeTopics.length
                ? system.activeTopics.map(topic => `- [${topic.category}] ${topic.topicLabel}: ${topic.summary}`).join('\n')
                : '[None yet]',
            '',
            '## Structured Knowledge',
            topKnowledgeRelations.length
                ? topKnowledgeRelations.map(relation => `- [${relation.subjectType}] ${relation.subject} -> ${relation.predicate} -> ${relation.object}`).join('\n')
                : '[None yet]',
            '',
            '## Recent Important Memories',
            topMemories.length
                ? topMemories.map(memory => `- [${memory.category}] ${memory.name}: ${memory.summary}`).join('\n')
                : '[None yet]',
            '',
            `Last updated: ${nowIso()}`,
        ].join('\n');
        await fs.writeFile(this.curatedMemoryPath, memoryMd, 'utf8');
    }

    async rememberDecision(entry = '') {
        const decision = String(entry || '').trim();
        if (!decision) return null;
        const store = await fs.readJson(this.coldStorePath).catch(() => ({ version: 1, decisions: [], updatedAt: null }));
        store.decisions = Array.isArray(store.decisions) ? store.decisions : [];
        const item = {
            id: slugify(`${decision}-${Date.now()}`),
            content: decision,
            createdAt: nowIso(),
        };
        store.decisions.unshift(item);
        store.decisions = store.decisions.slice(0, 200);
        store.updatedAt = nowIso();
        await fs.writeJson(this.coldStorePath, store, { spaces: 2 });

        const topicFile = path.join(this.memoryTopicsDir, 'decisions.md');
        const existing = await fs.readFile(topicFile, 'utf8').catch(() => '# Decisions\n');
        await fs.writeFile(topicFile, `${existing.trimEnd()}\n- ${item.createdAt}: ${decision}\n`, 'utf8');
        return item;
    }

    async applyWriteAheadLog({ chatId = '', userMessage = '' } = {}) {
        if (!userMessage) return { savedMemories: [], sessionState: null };
        const explicit = this.extractExplicitMemories(userMessage);
        const savedMemories = [];

        for (const item of explicit) {
            const memory = await this.upsertMemory({
                name: item.name,
                summary: item.summary,
                content: item.content,
                category: item.category,
                importance: item.importance,
                auto: true,
                source: item.source || 'wal',
                merge: false,
            });
            savedMemories.push(memory);
        }

        const sensory = this.captureSensorySnapshot({ userMessage });
        const system = await this.getSystemStatus();
        const state = await this.loadSessionState();
        state.currentTask = sensory.userDigest || previewText(userMessage, 180);
        state.keyContext = [
            ...savedMemories.map(memory => `[${memory.category}] ${memory.summary || memory.name}`),
            sensory.combinedDigest ? `Hot RAM: ${sensory.combinedDigest}` : '',
            ...(state.keyContext || []),
        ].slice(0, 10);
        state.topicFocus = [
            ...sensory.segments.map(segment => segment.topicLabel),
            ...(state.topicFocus || []),
        ].slice(0, 8);
        state.pendingActions = [
            ...this.inferPendingActions(userMessage),
            ...(state.pendingActions || []),
        ].slice(0, 10);
        state.memoryPressure = system.pendingQueueSize >= 6
            ? '[Hot - sleep queue backed up]'
            : system.shortTermTopicCount >= 4
                ? '[Warm - active topic buffers growing]'
                : '[Stable]';
        const decision = this.inferDecision(userMessage);
        if (decision) {
            state.recentDecisions = [decision, ...(state.recentDecisions || [])].slice(0, 10);
            await this.rememberDecision(decision);
        }

        const sessionState = await this.saveSessionState(state);
        await this.appendDailyLog({ chatId, userMessage, memories: savedMemories });
        return { savedMemories, sessionState };
    }

    async importLegacyTxtMemories() {
        const files = await fs.readdir(this.memoriesDir).catch(() => []);
        if (!files.length) return;

        const store = await fs.readJson(this.storePath).catch(() => defaultStore());
        store.memories = Array.isArray(store.memories) ? store.memories : [];
        const existingSlugs = new Set(store.memories.map(memory => memory.slug));
        let changed = false;

        for (const file of files) {
            if (!file.toLowerCase().endsWith('.txt')) continue;
            const filePath = path.join(this.memoriesDir, file);
            const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
            if (!raw.trim()) continue;

            const name = file.replace(/\.txt$/i, '');
            const slug = slugify(name);
            if (existingSlugs.has(slug)) continue;

            const stats = await fs.stat(filePath).catch(() => null);
            const category = detectCategory(raw, name);
            store.memories.push({
                id: slug,
                slug,
                name,
                fileName: file,
                type: 'long_term',
                category,
                summary: previewText(raw, 160),
                content: raw,
                tags: inferTags(raw, name),
                aliases: [],
                source: 'legacy',
                importance: inferImportance(raw, name, category),
                confidence: 0.9,
                auto: false,
                pinned: false,
                createdAt: stats?.ctime ? new Date(stats.ctime).toISOString() : nowIso(),
                updatedAt: stats?.mtime ? new Date(stats.mtime).toISOString() : nowIso(),
                lastAccessedAt: null,
                accessCount: 0,
            });
            existingSlugs.add(slug);
            changed = true;
        }

        if (changed) {
            this.rebuildProfiles(store);
            await this.saveStore(store);
        }
    }

    rebuildProfiles(store) {
        const topByCategory = (category) =>
            store.memories
                .filter(memory => memory.category === category)
                .sort((a, b) => (b.importance || 0) - (a.importance || 0))
                .slice(0, 6)
                .map(memory => `- ${memory.name}: ${memory.summary}`)
                .join('\n');

        store.profiles = {
            identity: topByCategory('identity'),
            preferences: topByCategory('preference'),
            projects: topByCategory('project'),
            relationship_style: topByCategory('interaction'),
            updatedAt: nowIso(),
        };
    }

    async writeMemoryMirror(memory) {
        const fileName = memory.fileName || `${sanitizeName(memory.name)}.txt`;
        memory.fileName = fileName;
        const content = [
            `# ${memory.name}`,
            '',
            `Type: ${memory.type}`,
            `Category: ${memory.category}`,
            `Importance: ${memory.importance}`,
            `Updated: ${memory.updatedAt}`,
            memory.tags?.length ? `Tags: ${memory.tags.join(', ')}` : '',
            '',
            memory.summary ? `Summary: ${memory.summary}` : '',
            '',
            memory.content || '',
        ].filter(Boolean).join('\n');
        await fs.writeFile(path.join(this.memoriesDir, fileName), content, 'utf8');
    }

    async listMemories() {
        const store = await this.loadStore();
        return store.memories
            .slice()
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .map(memory => ({
                id: memory.id,
                name: memory.name,
                fileName: memory.fileName || `${sanitizeName(memory.name)}.txt`,
                size: `${(Buffer.byteLength(memory.content || '', 'utf8') / 1024).toFixed(2)} KB`,
                time: new Date(memory.updatedAt).toLocaleString(),
                preview: memory.summary || previewText(memory.content || ''),
                type: memory.type,
                category: memory.category,
                importance: memory.importance,
                tags: memory.tags || [],
                auto: !!memory.auto,
            }));
    }

    async getMemory(identifier) {
        const store = await this.loadStore();
        const normalized = String(identifier || '').trim();
        const memory = store.memories.find(item =>
            item.id === normalized ||
            item.slug === normalized ||
            item.fileName === normalized ||
            item.name === normalized ||
            `${item.name}.txt` === normalized
        );
        if (!memory) return null;
        memory.lastAccessedAt = nowIso();
        memory.accessCount = (memory.accessCount || 0) + 1;
        await this.saveStore(store);
        return memory;
    }

    async searchMemories(query, limit = 8) {
        const store = await this.loadStore();
        const memories = store.memories.slice();
        const semanticScores = await this.getSemanticScores(query, memories);
        const hasSemanticScores = semanticScores.size > 0;

        return memories
            .map(memory => {
                const lexicalScore = scoreQuery(memory, query);
                const semanticScore = semanticScores.get(memory.id) || 0;
                const lexicalWeight = Math.min(1, lexicalScore / 18);
                const score = hasSemanticScores
                    ? (semanticScore * 0.72) + (lexicalWeight * 0.28) + ((memory.importance || 0) * 0.08)
                    : lexicalScore + ((memory.importance || 0) * 0.2);
                return { memory, lexicalScore, semanticScore, score };
            })
            .filter(item => hasSemanticScores
                ? (item.semanticScore >= 0.18 || item.lexicalScore > 0)
                : item.lexicalScore > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.memory);
    }

    async upsertMemory(input) {
        const store = await this.loadStore();
        const name = sanitizeName(input.name || input.summary || input.content?.slice(0, 40) || 'Untitled Memory');
        const slug = input.slug || slugify(name);
        const category = input.category || detectCategory(input.content || '', name);
        const summary = input.summary || previewText(input.content || '', 180);
        const tags = Array.from(new Set([...(input.tags || []), ...inferTags(input.content || '', name)])).slice(0, 10);
        const aliases = uniqueList([...(input.aliases || []), ...collectTopicKeywords(input.content || '', name)]).slice(0, 12);
        const existing = store.memories.find(memory =>
            memory.slug === slug ||
            memory.name === name ||
            memory.fileName === `${sanitizeName(name)}.txt`
        );
        const timestamp = nowIso();

        if (existing) {
            const appendedContent = input.merge === false
                ? (input.content || existing.content)
                : dedupeTextBlocks([existing.content, input.content], 4000);
            existing.name = name;
            existing.summary = summarizeSalientText(
                [existing.summary, summary].filter(Boolean).join('. '),
                { maxSentences: 4, maxChars: 240 }
            ) || summary || existing.summary;
            existing.content = appendedContent;
            existing.category = category;
            existing.type = input.type || existing.type || 'long_term';
            existing.tags = Array.from(new Set([...(existing.tags || []), ...tags])).slice(0, 12);
            existing.aliases = uniqueList([...(existing.aliases || []), ...aliases]).slice(0, 12);
            existing.importance = Math.max(existing.importance || 0, input.importance || inferImportance(appendedContent, name, category));
            existing.confidence = Math.max(existing.confidence || 0.6, input.confidence || 0.8);
            existing.auto = input.auto !== undefined ? input.auto : existing.auto;
            existing.updatedAt = timestamp;
            existing.source = input.source || existing.source || 'manual';
            existing.fileName = existing.fileName || `${sanitizeName(name)}.txt`;
            await this.writeMemoryMirror(existing);
            await this.upsertVectorEntry(existing);
            this.rebuildProfiles(store);
            await this.saveStore(store);
            return existing;
        }

        const memory = {
            id: slug,
            slug,
            name,
            fileName: `${sanitizeName(name)}.txt`,
            type: input.type || 'long_term',
            category,
            summary,
            content: input.content || '',
            tags,
            aliases,
            source: input.source || 'manual',
            importance: input.importance || inferImportance(input.content || '', name, category),
            confidence: input.confidence || 0.85,
            auto: !!input.auto,
            pinned: !!input.pinned,
            createdAt: timestamp,
            updatedAt: timestamp,
            lastAccessedAt: null,
            accessCount: 0,
        };
        store.memories.push(memory);
        await this.writeMemoryMirror(memory);
        await this.upsertVectorEntry(memory);
        this.rebuildProfiles(store);
        await this.saveStore(store);
        return memory;
    }

    async deleteMemory(identifier, trashHandler) {
        const store = await this.loadStore();
        const index = store.memories.findIndex(memory =>
            memory.id === identifier ||
            memory.slug === identifier ||
            memory.fileName === identifier ||
            memory.name === identifier
        );
        if (index === -1) return false;
        const [memory] = store.memories.splice(index, 1);
        const mirrorPath = path.join(this.memoriesDir, memory.fileName || `${sanitizeName(memory.name)}.txt`);
        if (await fs.pathExists(mirrorPath)) {
            if (trashHandler) await trashHandler(mirrorPath);
            else await fs.remove(mirrorPath);
        }
        await this.deleteVectorEntry(memory.id);
        this.rebuildProfiles(store);
        await this.saveStore(store);
        return true;
    }

    async updateWorkingMemory(chatId, payload) {
        if (!chatId) return null;
        await this.init();
        const filePath = path.join(this.workingDir, `${chatId}.json`);
        const prev = await fs.readJson(filePath).catch(() => ({ chatId, turns: [], summary: '', updatedAt: null }));
        prev.turns.push({
            at: nowIso(),
            user: payload.user || '',
            assistant: payload.assistant || '',
            notes: payload.notes || '',
        });
        prev.turns = prev.turns.slice(-12);
        prev.summary = prev.turns
            .slice(-6)
            .map(turn => `User: ${previewText(turn.user, 80)}\nAssistant: ${previewText(turn.assistant, 100)}`)
            .join('\n\n');
        prev.updatedAt = nowIso();
        await fs.writeJson(filePath, prev, { spaces: 2 });
        return prev;
    }

    async getWorkingMemory(chatId) {
        if (!chatId) return null;
        await this.init();
        const filePath = path.join(this.workingDir, `${chatId}.json`);
        return fs.readJson(filePath).catch(() => null);
    }

    async buildContext({ query = '', chatId = '', limit = 6 } = {}) {
        const store = await this.loadStore();
        const relevant = query
            ? await this.searchMemories(query, limit)
            : store.memories
                .slice()
                .sort((a, b) => (b.importance || 0) - (a.importance || 0))
                .slice(0, limit);
        const structured = await this.searchKnowledgeGraph(query, Math.min(limit, 6));
        const working = await this.getWorkingMemory(chatId);
        const sessionState = await this.loadSessionState();
        const shortTerm = await this.getShortTermContext(chatId, query, Math.min(limit, 4));
        const pending = await this.searchPendingMemories(query, Math.min(limit, 4));
        const system = await this.getSystemStatus({ store });
        return {
            profile: store.profiles,
            relevant,
            structured,
            working,
            sessionState,
            shortTerm,
            pending,
            system,
            summaryText: [
                sessionState?.currentTask
                    ? `Session State:\nCurrent Task: ${sessionState.currentTask}\nKey Context:\n${(sessionState.keyContext || []).map(item => `- ${item}`).join('\n') || '[None yet]'}\nTopic Focus:\n${(sessionState.topicFocus || []).map(item => `- ${item}`).join('\n') || '[None yet]'}\nMemory Pressure: ${sessionState.memoryPressure || '[Stable]'}`
                    : '',
                shortTerm?.summaryText ? `Short-Term Topics:\n${shortTerm.summaryText}` : '',
                pending.length ? `Pending Sleep Queue:\n${pending.map(item => `- [${item.category}] ${item.topicLabel || item.summary}: ${item.summary}`).join('\n')}` : '',
                store.profiles.identity ? `Identity:\n${store.profiles.identity}` : '',
                store.profiles.preferences ? `Preferences:\n${store.profiles.preferences}` : '',
                store.profiles.projects ? `Projects:\n${store.profiles.projects}` : '',
                store.profiles.relationship_style ? `Interaction Style:\n${store.profiles.relationship_style}` : '',
                structured.length ? `Structured Knowledge:\n${structured.map(entry => (
                    entry.kind === 'relation'
                        ? `- ${entry.item.subject} -> ${entry.item.predicate} -> ${entry.item.object}${entry.item.evidence ? ` (evidence: ${entry.item.evidence})` : ''}`
                        : `- ${entry.item.name} [${entry.item.type}]: ${entry.item.status || entry.item.summary || 'known entity'}`
                )).join('\n')}` : '',
                relevant.length ? `Relevant Memories:\n${relevant.map(memory => `- [${memory.category}] ${memory.name}: ${memory.summary}`).join('\n')}` : '',
                working?.summary ? `Working Memory:\n${working.summary}` : '',
                `Memory System:\n- Long-term memories: ${system.longTermCount}\n- Short-term topics: ${system.shortTermTopicCount}\n- Pending sleep queue: ${system.pendingQueueSize}\n- Structured entities: ${system.knowledgeEntityCount}\n- Structured relations: ${system.knowledgeRelationCount}\n- Last sleep cycle: ${system.lastSleepCycleAt || '[Not run yet]'}\n- Last offline reflection: ${system.lastOfflineReflectionAt || '[Not run yet]'}`,
            ].filter(Boolean).join('\n\n'),
        };
    }

    parseJsonBlock(text = '') {
        const match = String(text).match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    isExplicitRememberRequest(text = '') {
        return isExplicitRememberRequest(text);
    }

    extractExplicitMemories(userMessage = '') {
        if (!isExplicitRememberRequest(userMessage)) return [];
        const cleaned = stripRememberInstruction(userMessage) || userMessage;
        const category = detectCategory(cleaned, cleaned);
        return [{
            name: deriveExplicitMemoryName(cleaned, category),
            summary: previewText(cleaned, 120),
            content: cleaned,
            category,
            importance: 0.95,
            source: 'explicit-request',
            auto: true,
            merge: false,
        }];
    }

    async autoCaptureFromTurn({ chatId = '', userMessage, assistantMessage, provider, model, ollamaUrl, config, callLLM }) {
        const explicit = this.extractExplicitMemories(userMessage);
        const fallback = explicit.length > 0 ? [] : this.fallbackAutoMemories(userMessage, assistantMessage);
        let candidates = explicit.length > 0 ? [...explicit] : [...fallback];

        if (callLLM && provider && model) {
            try {
                const extractionPrompt = `
You are a memory extraction engine for an AI assistant.
Extract only durable memories worth remembering long-term from this conversation turn.

Rules:
- Prefer user identity, preferences, recurring goals, project context, communication style, constraints, important relationships, important long-term tasks.
- If the user explicitly asks the assistant to remember something, include it unless it is obviously trivial.
- Ignore one-off small talk and transient requests.
- Return JSON array only.
- Each item schema:
  {"name":"short title","summary":"one sentence","content":"detailed memory","category":"identity|preference|project|interaction|relationship|general","importance":0.0-1.0}
- Return [] if nothing is worth storing.

User:
${userMessage || ''}

Assistant:
${assistantMessage || ''}
                `.trim();
                const result = await callLLM(provider, model, ollamaUrl, extractionPrompt, config);
                const parsed = this.parseJsonBlock(result);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const llmCandidates = parsed
                        .filter(item => item && item.name && item.content)
                        .map(item => ({
                            ...item,
                            auto: true,
                            source: 'auto-llm',
                            importance: Math.max(0, Math.min(1, Number(item.importance) || 0.7)),
                        }));
                    candidates = explicit.length > 0 ? [...explicit, ...llmCandidates] : llmCandidates;
                }
            } catch (error) {
                console.warn('[Memory] Auto extraction failed, using fallback:', error.message);
            }
        }

        const deduped = [];
        const seen = new Set();
        for (const item of candidates) {
            const key = `${item.name}::${item.content}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }

        const eligible = deduped
            .filter(item => (item.importance || 0) >= 0.55)
            .map(item => this.normalizePromotionCandidate({
                ...item,
                chatId,
                turns: item.turns || 1,
            }, chatId));

        const explicitCandidates = eligible.filter(item => item.source === 'explicit-request');
        const nonExplicitCandidates = eligible.filter(item => item.source !== 'explicit-request');

        const explicitSave = await this.saveAutonomousCandidates(explicitCandidates, {
            source: 'explicit-memory',
            merge: false,
        });
        const proactiveSave = await this.saveAutonomousCandidates(nonExplicitCandidates, {
            source: 'proactive-memory',
            merge: true,
        });
        const saved = [...explicitSave.saved, ...proactiveSave.saved];
        const staged = proactiveSave.pending;
        const alreadyPromotedKeys = new Set([
            ...explicitSave.promotedCandidates.map(item => item.topicKey),
            ...proactiveSave.promotedCandidates.map(item => item.topicKey),
        ].filter(Boolean));
        const alreadyPromotedSignatures = new Set([
            ...explicitSave.promotedCandidates.map(item => buildContentSignature(item.content || item.summary)),
            ...proactiveSave.promotedCandidates.map(item => buildContentSignature(item.content || item.summary)),
        ].filter(Boolean));

        const shortTermResult = chatId
            ? await this.updateShortTermMemory(chatId, { userMessage, assistantMessage })
            : { buffered: [], flushed: [], sensory: this.captureSensorySnapshot({ userMessage, assistantMessage }) };
        const shortTermCandidates = [
            ...(shortTermResult.flushed || []),
            ...((shortTermResult.buffered || []).map(topic => buildTopicCandidate(topic, chatId))),
        ]
            .map(candidate => this.normalizePromotionCandidate(candidate, chatId))
            .filter(candidate => {
                if (alreadyPromotedKeys.has(candidate.topicKey)) return false;
                const signature = buildContentSignature(candidate.content || candidate.summary);
                if (!signature) return true;
                return !Array.from(alreadyPromotedSignatures).some(existing =>
                    existing.includes(signature) || signature.includes(existing)
                );
            });
        const shortTermPromotion = await this.saveAutonomousCandidates(shortTermCandidates, {
            source: 'short-term-promotion',
            merge: true,
        });

        const queued = await this.enqueueSleepCandidates([
            ...staged,
            ...shortTermPromotion.pending,
        ], 'auto-capture');
        const sleepRun = await this.maybeRunSleepCycle({ reason: 'auto-capture' });

        const allSaved = Array.from(
            new Map(
                [...saved, ...shortTermPromotion.saved]
                    .filter(Boolean)
                    .map(memory => [memory.id || memory.name, memory])
            ).values()
        );
        await this.syncAutonomousSessionState(allSaved, queued);

        if (allSaved.length > 0 || queued.length > 0 || sleepRun.processed > 0) {
            const store = await this.loadStore();
            store.stats.lastAutoCaptureAt = nowIso();
            if (sleepRun.processed > 0) {
                store.stats.lastSleepCycleAt = nowIso();
            }
            await this.saveStore(store);
            await this.appendDailyLog({
                chatId,
                userMessage,
                assistantMessage,
                memories: [
                    ...allSaved,
                    ...((sleepRun.consolidated || []).map(memory => ({
                        name: memory.name,
                        category: memory.category,
                    }))),
                ],
            });
        }

        return {
            saved: allSaved,
            queued,
            shortTerm: shortTermResult.buffered || [],
            sleepRun,
        };
    }

    fallbackAutoMemories(userMessage = '', assistantMessage = '') {
        const text = `${userMessage}\n${assistantMessage}`.trim();
        const candidates = [];
        const rules = [
            {
                category: 'preference',
                regex: /(\u559c\u6b22|\u504f\u597d|\u7231\u5403|\u4e0d\u559c\u6b22|\u8ba8\u538c|\u53e3\u5473|\u5e0c\u671b\u4f60.*?(\u8bed\u6c14|\u98ce\u683c|\u79f0\u547c)|\bprefer\b|\bfavorite\b|\blike\b)/i,
                name: 'User Preference',
            },
            {
                category: 'identity',
                regex: /(\u6211\u662f|\u6211\u53eb|\u540d\u5b57\u662f|\u804c\u4e1a\u662f|\u5728.*?\u5de5\u4f5c|\u4f4f\u5728|\bi am\b|\bmy name\b)/i,
                name: 'User Identity',
            },
            {
                category: 'project',
                regex: /(\u9879\u76ee|\u6b63\u5728\u505a|\u6253\u7b97\u505a|\u957f\u671f\u76ee\u6807|\u622a\u6b62|deadline|roadmap|todo|\u9700\u6c42)/i,
                name: 'Ongoing Project',
            },
            {
                category: 'interaction',
                regex: /(\u8bf7\u53eb\u6211|\u56de\u7b54\u6211\u65f6|\u8bed\u6c14|\u98ce\u683c|\u5e0c\u671b\u4f60|\bcall me\b|\btone\b|\bstyle\b)/i,
                name: 'Interaction Preference',
            },
        ];

        for (const rule of rules) {
            if (rule.regex.test(text)) {
                candidates.push({
                    name: rule.name,
                    summary: previewText(userMessage, 120),
                    content: userMessage || text,
                    category: rule.category,
                    importance: 0.7,
                    source: 'auto-fallback',
                });
            }
        }
        return candidates;
    }
}

module.exports = {
    MemoryService,
    sanitizeName,
    slugify,
    previewText,
};

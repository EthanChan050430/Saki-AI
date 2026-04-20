const { URL } = require('url');

const EMOTION_TERMS = [
    'breaking',
    'bombshell',
    'shocking',
    'outrageous',
    'must see',
    'exposed',
    'scandal',
    'black market',
    'viral',
    '惊爆',
    '震惊',
    '黑幕',
    '曝光',
    '实锤',
    '速看',
    '离谱',
    '可怕',
    '愤怒',
    '黑产',
    '炸裂',
];

const POSITIVE_TERMS = [
    'confirmed',
    'official',
    'verified',
    'authentic',
    '证实',
    '确认',
    '真实',
    '官方',
];

const NEGATIVE_TERMS = [
    'false',
    'fake',
    'misleading',
    'hoax',
    'debunked',
    'rumor',
    '骗局',
    '谣言',
    '不实',
    '虚假',
    '伪造',
    '误导',
    '辟谣',
];

const UNCERTAINTY_TERMS = [
    'alleged',
    'apparently',
    'maybe',
    'might',
    'reportedly',
    'unconfirmed',
    '可能',
    '疑似',
    '据传',
    '网传',
    '未证实',
    '据说',
    '似乎',
];

const FACT_CHECK_HOST_HINTS = [
    'factcheck',
    'politifact',
    'snopes',
    'fullfact',
    'ifact',
];

const TRUSTED_HOST_HINTS = [
    'reuters.com',
    'apnews.com',
    'bbc.com',
    'npr.org',
    'theguardian.com',
    'who.int',
    'gov.cn',
    'xinhuanet.com',
    'people.com.cn',
    'thepaper.cn',
    'caixin.com',
];

const LOW_TRUST_HOST_HINTS = [
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'douyin.com',
    'weibo.com',
    'zhihu.com',
    'youtube.com',
    'bilibili.com',
    'reddit.com',
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function detectLanguage(text = '') {
    return /[\u3400-\u9fff]/.test(String(text || '')) ? 'zh' : 'en';
}

function getHostname(rawUrl = '') {
    try {
        return new URL(String(rawUrl || '').trim()).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

function normalizeUrl(rawUrl = '') {
    try {
        const parsed = new URL(String(rawUrl || '').trim());
        parsed.hash = '';
        if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
            parsed.port = '';
        }
        const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
    } catch {
        return String(rawUrl || '').trim();
    }
}

function includesAny(text = '', terms = []) {
    const normalized = String(text || '').toLowerCase();
    return terms.filter((term) => normalized.includes(String(term).toLowerCase()));
}

function scoreSourceAuthority(rawUrl = '') {
    const host = getHostname(rawUrl);
    if (!host) return 25;

    let score = 54;

    if (
        host.endsWith('.gov')
        || host.endsWith('.gov.cn')
        || host.endsWith('.edu')
        || host.endsWith('.edu.cn')
        || host.endsWith('.ac.uk')
        || host.endsWith('.mil')
        || host.endsWith('.int')
    ) {
        score = 95;
    }

    if (FACT_CHECK_HOST_HINTS.some((hint) => host.includes(hint))) {
        score = Math.max(score, 88);
    }

    if (TRUSTED_HOST_HINTS.some((hint) => host.includes(hint))) {
        score = Math.max(score, 82);
    }

    if (host.includes('wikipedia.org')) {
        score = Math.max(score, 66);
    }

    if (host.includes('blog') || host.includes('substack') || host.includes('medium.com')) {
        score = Math.min(score, 46);
    }

    if (LOW_TRUST_HOST_HINTS.some((hint) => host.includes(hint))) {
        score = Math.min(score, 28);
    }

    return clamp(score, 15, 98);
}

function mergeRankedSearchResults(results = []) {
    const merged = new Map();

    (Array.isArray(results) ? results : []).forEach((item, index) => {
        const url = normalizeUrl(item?.url || item?.link || '');
        if (!url) return;

        const existing = merged.get(url) || {
            id: `src_${merged.size + 1}`,
            title: String(item?.title || item?.name || url).trim(),
            url,
            domain: getHostname(url),
            content: '',
            engines: [],
            queries: [],
            engineCount: 0,
            authorityScore: scoreSourceAuthority(url),
            rank: index,
        };

        const content = String(item?.content || '').trim();
        if (content.length > existing.content.length) {
            existing.content = content;
        }

        if (item?.engine && !existing.engines.includes(item.engine)) {
            existing.engines.push(item.engine);
        }

        if (item?.query && !existing.queries.includes(item.query)) {
            existing.queries.push(item.query);
        }

        existing.engineCount = existing.engines.length;
        existing.rank = Math.min(existing.rank, index);
        existing.authorityScore = Math.max(existing.authorityScore, scoreSourceAuthority(url));
        merged.set(url, existing);
    });

    return Array.from(merged.values()).sort((left, right) => {
        if (right.engineCount !== left.engineCount) return right.engineCount - left.engineCount;
        if (right.authorityScore !== left.authorityScore) return right.authorityScore - left.authorityScore;
        return left.rank - right.rank;
    });
}

function analyzeEmotionalSignals(text = '') {
    const normalized = String(text || '').trim();
    const lowered = normalized.toLowerCase();
    const emotionHits = includesAny(lowered, EMOTION_TERMS);
    const positiveHits = includesAny(lowered, POSITIVE_TERMS);
    const negativeHits = includesAny(lowered, NEGATIVE_TERMS);
    const uncertaintyHits = includesAny(lowered, UNCERTAINTY_TERMS);
    const punctuationBursts = (normalized.match(/[!！?？]{2,}/g) || []).length;
    const uppercaseBursts = (normalized.match(/\b[A-Z]{4,}\b/g) || []).length;

    const emotionality = clamp(
        emotionHits.length * 18
        + punctuationBursts * 12
        + uppercaseBursts * 10
        + (positiveHits.length + negativeHits.length) * 6,
        0,
        100
    );

    const polarityBalance = positiveHits.length - negativeHits.length;
    const polarity = polarityBalance > 0 ? 'positive' : polarityBalance < 0 ? 'negative' : 'neutral';
    const label = emotionality >= 70
        ? 'high'
        : emotionality >= 40
            ? 'medium'
            : 'low';

    return {
        emotionality: round(emotionality, 1),
        label,
        polarity,
        emotionHits,
        uncertaintyHits,
        positiveHits: positiveHits.length,
        negativeHits: negativeHits.length,
        punctuationBursts,
        uppercaseBursts,
    };
}

function pickExcerpt(content = '', keywords = [], maxLength = 220) {
    const cleaned = String(content || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';

    const normalizedKeywords = Array.from(new Set(
        (Array.isArray(keywords) ? keywords : [])
            .map((item) => String(item || '').trim())
            .filter((item) => item.length >= 2)
    ));

    const lowered = cleaned.toLowerCase();
    let hitIndex = -1;

    for (const keyword of normalizedKeywords) {
        const index = lowered.indexOf(keyword.toLowerCase());
        if (index >= 0 && (hitIndex < 0 || index < hitIndex)) {
            hitIndex = index;
        }
    }

    if (hitIndex < 0) {
        return cleaned.slice(0, maxLength);
    }

    const start = Math.max(0, hitIndex - Math.floor(maxLength / 3));
    const excerpt = cleaned.slice(start, start + maxLength);
    const prefix = start > 0 ? '...' : '';
    const suffix = start + maxLength < cleaned.length ? '...' : '';
    return `${prefix}${excerpt}${suffix}`;
}

function getVerdictFromScore(score = 50, supportWeight = 0, contradictWeight = 0, sourceCount = 0) {
    if (sourceCount < 2 && Math.abs(score - 50) < 18) {
        return 'unverified';
    }

    if (score >= 78) return 'likely_true';
    if (score >= 60) return 'lean_true';
    if (score >= 45) return 'mixed';
    if (score >= 28) return 'lean_false';
    return contradictWeight > supportWeight ? 'likely_false' : 'mixed';
}

function getVerdictLabel(verdict = 'mixed', language = 'en') {
    const zh = {
        likely_true: '较大概率为真',
        lean_true: '偏向真实',
        mixed: '证据冲突',
        lean_false: '偏向存疑',
        likely_false: '较大概率为假',
        unverified: '暂未证实',
    };
    const en = {
        likely_true: 'Likely True',
        lean_true: 'Leaning True',
        mixed: 'Mixed Evidence',
        lean_false: 'Leaning False',
        likely_false: 'Likely False',
        unverified: 'Unverified',
    };

    return (language === 'zh' ? zh : en)[verdict] || (language === 'zh' ? zh.mixed : en.mixed);
}

function computeCredibilitySignals({
    weightedSupport = 0,
    weightedContradict = 0,
    weightedMixed = 0,
    sourceCount = 0,
    uniqueDomains = 0,
    uniqueEngines = 0,
    averageAuthority = 0,
    emotionality = 0,
    multiEngineHits = 0,
    authoritativeSourceCount = 0,
}) {
    const assessableWeight = weightedSupport + weightedContradict + weightedMixed;
    const evidenceWeight = Math.min(1, 0.45 + (sourceCount / 6));
    const directionalGap = assessableWeight > 0
        ? (weightedSupport - weightedContradict) / assessableWeight
        : 0;
    const supportRatio = assessableWeight > 0 ? weightedSupport / assessableWeight : 0;
    const contradictRatio = assessableWeight > 0 ? weightedContradict / assessableWeight : 0;

    const evidenceScore = clamp(50 + (directionalGap * 58 * evidenceWeight), 0, 100);
    const authorityScore = clamp(averageAuthority + authoritativeSourceCount * 3, 0, 100);
    const diversityScore = clamp(uniqueDomains * 16 + uniqueEngines * 14 + multiEngineHits * 8, 0, 100);
    const consistencyScore = assessableWeight > 0
        ? clamp(Math.max(supportRatio, contradictRatio) * 100, 0, 100)
        : 0;
    const emotionScore = clamp(100 - emotionality, 0, 100);

    let finalScore = (
        evidenceScore * 0.68
        + authorityScore * 0.12
        + diversityScore * 0.08
        + consistencyScore * 0.07
        + emotionScore * 0.05
    );

    if (weightedContradict > weightedSupport * 1.2) {
        finalScore -= 8;
    } else if (weightedSupport > weightedContradict * 1.4 && sourceCount >= 3) {
        finalScore += 4;
    }

    if (sourceCount < 2) {
        finalScore = Math.min(finalScore, 64);
    }

    if (uniqueEngines < 2) {
        finalScore -= 4;
    }

    finalScore = clamp(finalScore, 0, 100);

    return {
        score: round(finalScore),
        verdict: getVerdictFromScore(finalScore, weightedSupport, weightedContradict, sourceCount),
        metrics: {
            evidenceScore: round(evidenceScore),
            authorityScore: round(authorityScore),
            diversityScore: round(diversityScore),
            consistencyScore: round(consistencyScore),
            emotionScore: round(emotionScore),
        },
        weights: {
            support: round(weightedSupport, 2),
            contradict: round(weightedContradict, 2),
            mixed: round(weightedMixed, 2),
        },
    };
}

module.exports = {
    analyzeEmotionalSignals,
    computeCredibilitySignals,
    detectLanguage,
    getHostname,
    getVerdictLabel,
    mergeRankedSearchResults,
    normalizeUrl,
    pickExcerpt,
    scoreSourceAuthority,
};

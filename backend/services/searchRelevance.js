'use strict';

const STOP_WORDS = new Set(('a an the and or of to in on at for from by with is are was were be been being ' +
    'it its this that these those as how what when where why which who can could would should do does did ' +
    'i me my we our you your please find search about 的 了 和 与 或 在 是 有 如何 怎么 什么 请 帮我 搜索 查找 ' +
    '吗 呢 吧 啊 呀 哦 嘛 啦 一下 请问 是否').split(/\s+/u));
const TRACKING_PARAMS = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|yclid|_ga|_gl|igshid)$/i;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

function cleanText(text) {
    return String(text ?? '').normalize('NFKC').toLowerCase()
        .replace(/<[^>]*>/gu, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gu, ' ');
}

function shouldPreserveHanTag(word, parts) {
    if (!/^\p{Script=Han}{2,3}$/u.test(word) || STOP_WORDS.has(word)) return false;
    if (word.length === 2) return true;
    if ([...word].some((ch) => CHINESE_DIGIT_MAP[ch] !== undefined || ch === '第' || ch === '几' || ch === '十')) {
        return false;
    }
    return parts.some((part) => part.length === 1);
}

/** Stable unique tokens; preserve explicit 2-3 char Han tags and use bigrams without Intl segmentation. */
function extractSearchTerms(text) {
    const normalized = cleanText(text);
    const tokens = [];
    const spans = normalized.split(/[\s,，、；;：:()（）【】[\]「」"'“”]+/u).filter(Boolean);
    for (const span of spans) {
        if (segmenter) {
            const parts = Array.from(segmenter.segment(span), (part) => part.isWordLike ? part.segment : '').filter(Boolean);
            const pureHanChunks = span.match(/\p{Script=Han}+/gu) || [];
            if (pureHanChunks.length === 1 && pureHanChunks[0] === span && shouldPreserveHanTag(span, parts)) {
                tokens.push(span);
                continue;
            }
            for (const part of parts) tokens.push(part);
        } else {
            for (const word of span.match(/[\p{L}\p{N}]+/gu) || []) tokens.push(word);
        }
    }
    const terms = [];
    for (const word of tokens) {
        if (!word || STOP_WORDS.has(word)) continue;
        if (!segmenter && /^\p{Script=Han}+$/u.test(word) && word.length > 3) {
            for (let index = 0; index < word.length - 1; index += 1) {
                const pair = word.slice(index, index + 2);
                if (!STOP_WORDS.has(pair)) terms.push(pair);
            }
        } else terms.push(word);
    }

    return [...new Set(terms)];
}

const QUERY_DIMENSIONS = [
    { pattern: /(?:比较|对比|\bcompare\b|\bversus\b|\bvs\.?\b)/iu, label: '优缺点 性能 成本', english: 'comparison performance cost' },
    { pattern: /(?:原因|为什么|为何|\bcause\b|\bwhy\b|\breason\b)/iu, label: '原因 机制', english: 'causes mechanism' },
    { pattern: /(?:影响|后果|\bimpact\b|\beffect\b|\bconsequence\b)/iu, label: '影响 后果', english: 'impact consequences' },
    { pattern: /(?:风险|安全|隐患|\brisk\b|\bsafety\b)/iu, label: '风险 安全', english: 'risks safety' },
    { pattern: /(?:趋势|未来|预测|展望|\btrend\b|\bfuture\b|\bforecast\b)/iu, label: '趋势 最新进展', english: 'trends developments' },
    { pattern: /(?:证据|研究|数据|研究结果|\bevidence\b|\bstudy\b|\bdata\b)/iu, label: '研究 数据 证据', english: 'research evidence data' },
];

function parseSearchQuery(query) {
    const original = String(query || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const sites = [];
    const excludedSites = [];
    const operators = [];
    const text = original.replace(/(?:^|\s)(-?site:)([^\s]+)/giu, (_, operator, value) => {
        const host = value.toLowerCase().replace(/^www\./u, '').replace(/\/$/u, '');
        if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(host)) {
            throw new Error('Invalid site: filter. Use a hostname such as site:example.com.');
        }
        (operator.startsWith('-') ? excludedSites : sites).push(host);
        operators.push(`${operator.toLowerCase()}${host}`);
        return ' ';
    }).trim();
    const excludedTerms = [];
    const positiveText = text.replace(/(?:^|\s)-("[^"]+"|[^\s]+)/gu, (_, value) => {
        excludedTerms.push(cleanText(value.replace(/^"|"$/gu, '')));
        operators.push(`-${value}`);
        return ' ';
    }).replace(/\s+/gu, ' ').trim();
    const quotedPhrases = [...positiveText.matchAll(/["“]([^"”]+)["”]/gu)].map(match => cleanText(match[1]));
    // Conservative phrase hints, not named-entity recognition or a truth judgement.
    const nameHints = [...positiveText.matchAll(/\b[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*(?:\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*){1,3}\b/gu)]
        .map(match => match[0]).filter(value => extractSearchTerms(value).length === value.split(/\s+/u).length)
        .filter(value => /\s/u.test(value)).map(cleanText);
    const terms = extractSearchTerms(positiveText).filter(term => !/^(?:19|20)\d{2}$/u.test(term));
    return { original, text: positiveText, sites, excludedSites, excludedTerms, operators,
        terms: terms.length ? terms : extractSearchTerms(positiveText),
        phrases: [...new Set([...quotedPhrases, ...nameHints].map(cleanText))] };
}

function matchesSearchConstraints(result, intent) {
    const url = normalizeSearchUrl(result.url || result.link);
    if (!url) return false;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./u, '');
    const within = domain => host === domain || host.endsWith(`.${domain}`);
    if (intent.sites.length && !intent.sites.some(within)) return false;
    if (intent.excludedSites.some(within)) return false;
    const text = cleanText(`${result.title || result.name || ''} ${result.content || result.snippet || result.description || ''}`);
    return !intent.excludedTerms.some(term => matchesTerm(text, term));
}

function assessSearchMatch(result, query) {
    const intent = parseSearchQuery(query);
    const text = cleanText(`${result.title || result.name || ''} ${result.content || result.snippet || result.description || ''}`);
    const textView = prepareFuzzyText(text);
    const matchedTerms = intent.terms.filter(term => matchesTerm(text, term));
    const missingTerms = intent.terms.filter(term => !matchesTerm(text, term));
    const missingPhrases = intent.phrases.filter(phrase => !matchesTerm(text, phrase));
    const coverage = intent.terms.length ? matchedTerms.length / intent.terms.length : 0;
    const hasMultiCharSubject = intent.terms.some((term) => !isSingleHanTerm(term));
    let fuzzyScoreSum = 0;
    let fuzzyWeightSum = 0;
    let hasStrongFuzzyAnchor = false;
    for (const term of intent.terms) {
        const weight = hasMultiCharSubject && isSingleHanTerm(term) ? 0.35 : 1;
        fuzzyWeightSum += weight;
        if (matchesTerm(text, term)) {
            fuzzyScoreSum += weight;
            if (!hasMultiCharSubject || !isSingleHanTerm(term)) hasStrongFuzzyAnchor = true;
            continue;
        }
        const match = scoreTermMatch(textView, term);
        if (match.score >= 0.6) {
            fuzzyScoreSum += weight * match.score;
            if (match.strong && (!hasMultiCharSubject || !isSingleHanTerm(term))) {
                hasStrongFuzzyAnchor = true;
            }
        }
    }
    const fuzzyCoverage = hasStrongFuzzyAnchor && fuzzyWeightSum ? fuzzyScoreSum / fuzzyWeightSum : 0;
    const url = normalizeSearchUrl(result.url || result.link);
    const isIndex = Boolean(url && /\/(?:category|tag|tags|archive|archives)(?:\/|$)/iu.test(new URL(url).pathname))
        || /\b(?:archives|page \d+ of \d+)\b/iu.test(result.title || '');
    const matchType = coverage >= 0.65 && !missingPhrases.length && !isIndex ? 'direct'
        : (coverage >= 0.3 || fuzzyCoverage >= 0.3) ? 'background' : 'weak';
    return { matchType, coverage, matchedTerms, missingTerms, missingPhrases, isIndex };
}

function buildRelaxedSearchQueries(query) {
    const intent = parseSearchQuery(query);
    if (intent.terms.length < 4) return [];
    const constraints = intent.operators.join(' ');
    const years = [...new Set(intent.text.match(/(?<!\p{N})(?:19|20)\d{2}(?!\p{N})/gu) || [])];
    const multiTerms = [];
    const contentSingleHan = [];
    const unitSingleHan = [];
    for (const term of intent.terms) {
        if (/^(?:19|20)\d{2}$/u.test(term)) continue;
        if (isSingleHanTerm(term)) {
            if (GENERIC_HAN_CHARS.has(term)) unitSingleHan.push(term);
            else contentSingleHan.push(term);
        } else {
            multiTerms.push(term);
        }
    }
    const corePool = [...multiTerms, ...contentSingleHan, ...unitSingleHan];
    if (!corePool.length) return [];
    const threeTerms = years.length
        ? [years[0], ...corePool].slice(0, 3)
        : corePool.slice(0, 3);
    const twoTerms = years.length
        ? [years[0], corePool[0]].filter(Boolean)
        : corePool.slice(0, 2);
    const formatQuery = (terms) => `${constraints} ${terms.join(' ')}`.trim();
    const relaxed = [threeTerms, twoTerms]
        .filter((terms) => terms.length >= 2)
        .map(formatQuery);
    return [...new Set(relaxed)].filter((value) => value && value.toLowerCase() !== intent.original.toLowerCase());
}

function extractMultiTagTokens(intent) {
    if (!intent || intent.phrases.length) return [];
    if (/[?？。!！;；\n]/u.test(intent.original)) return [];
    if (QUERY_DIMENSIONS.some((dimension) => dimension.pattern.test(intent.original))) return [];
    const rawParts = intent.text
        .split(/[\s,，、/|]+/u)
        .map((token) => token.trim())
        .filter(Boolean);
    if (rawParts.some((token) => /^(?:how|what|when|where|why|who|which|can|could|would|should|is|are|was|were|do|does|did|如何|怎么|为什么|为何|请问|是否|吗|呢|的)$/iu.test(token))) {
        return [];
    }
    const uniqueTags = [...new Set(rawParts.filter((token) => token.length <= 24 && !STOP_WORDS.has(token.toLowerCase())))];
    const substantiveTags = uniqueTags.filter((tag) => !/^(?:19|20)\d{2}$/u.test(tag));
    return substantiveTags.length >= 4 ? uniqueTags : [];
}

function buildMultiTagQueries(query, maxSubQueries = 3) {
    const intent = parseSearchQuery(query);
    const tags = extractMultiTagTokens(intent);
    if (tags.length < 4 || maxSubQueries < 1) return [];
    const constraints = intent.operators.join(' ');
    const format = (pair) => `${constraints} ${pair.join(' ')}`.trim();
    const queries = [];
    for (let index = 0; index < tags.length; index += 2) {
        const pair = index + 1 < tags.length
            ? [tags[index], tags[index + 1]]
            : [tags[0], tags[index]];
        queries.push(format(pair));
    }
    if (tags.length >= 5) {
        queries.push(format([tags[tags.length - 2], tags[tags.length - 1]]));
        queries.push(format([tags[1], tags[tags.length - 1]]));
    } else if (tags.length === 4) {
        queries.push(format([tags[0], tags[tags.length - 1]]));
    }
    return [...new Set(queries)]
        .filter((value) => value && value.toLowerCase() !== intent.original.toLowerCase())
        .slice(0, maxSubQueries);
}

function buildSearchFollowups(query) {
    const intent = parseSearchQuery(query);
    const constraints = intent.operators.join(' ');
    const multiTagQueries = buildMultiTagQueries(query, 4);
    const candidates = [];
    if (intent.phrases.length) candidates.push(`${constraints} ${intent.phrases.map(phrase => `"${phrase}"`).join(' ')} ${intent.terms.join(' ')}`.trim());
    // Keep all subject terms and operators; never silently broaden a site restriction.
    candidates.push(`${constraints} ${intent.terms.join(' ')}`.trim());
    if (multiTagQueries.length) {
        candidates.push(...multiTagQueries, ...buildRelaxedSearchQueries(query));
    } else {
        candidates.push(...buildRelaxedSearchQueries(query));
    }
    return [...new Set(candidates)].filter(value => value && value.toLowerCase() !== intent.original.toLowerCase());
}

function expandSearchQueries(query, options = {}) {
    const original = String(query || '').replace(/\s+/gu, ' ').trim();
    if (!original) return [];
    const maxQueries = Math.min(8, Math.max(1, Math.floor(Number(options.maxQueries) || 4)));
    const phrases = original.split(/[?？;；。\n]+/u).map(part => part.trim()).filter(part => part.length >= 4);
    const queries = [original];
    for (const dimension of QUERY_DIMENSIONS) {
        if (queries.length >= maxQueries) break;
        if (dimension.pattern.test(original)) {
            const intent = parseSearchQuery(original);
            const focused = `${original} ${/\p{Script=Han}/u.test(original) ? dimension.label : dimension.english}`;
            if (!queries.includes(focused)) queries.push(focused);
        }
    }
    for (const phrase of phrases) {
        if (phrase !== original && queries.length < maxQueries) {
            const constraints = parseSearchQuery(original).operators.join(' ');
            queries.push(`${constraints} ${parseSearchQuery(phrase).text}`.trim());
        }
    }
    for (const subQuery of buildMultiTagQueries(original, maxQueries - queries.length)) {
        if (queries.length >= maxQueries) break;
        if (!queries.includes(subQuery)) queries.push(subQuery);
    }
    return [...new Set(queries)].slice(0, maxQueries);
}

/** Preserve semantic parameters and non-default ports; reject credentials/non-web URLs. */
function normalizeSearchUrl(value) {
    try {
        const url = new URL(String(value ?? '').trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return url.href;
    } catch {
        return '';
    }
}

const WORD_BOUNDARY_CHAR = '[\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{N}\\p{M}_]';
const CHINESE_DIGIT_MAP = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const GENERIC_HAN_CHARS = new Set([...'市省区县镇村年月日天周时分秒的第版网吧站']);
const UNINFLECTED_S_WORDS = new Set(['news', 'this', 'does', 'was', 'has', 'his', 'its', 'yes', 'gas', 'bus', 'plus', 'less', 'pass', 'mass', 'glass', 'class', 'process', 'access', 'success', 'status', 'focus', 'linux', 'macos']);

function isSingleHanTerm(term) {
    return term.length === 1 && /\p{Script=Han}/u.test(term);
}

function chineseNumberToArabic(token) {
    if (!token) return null;
    if (token === '十') return 10;
    if (token.includes('十')) {
        const [tensPart, onesPart] = token.split('十');
        const tens = tensPart ? CHINESE_DIGIT_MAP[tensPart] : 1;
        const ones = onesPart ? CHINESE_DIGIT_MAP[onesPart] : 0;
        if (tens === undefined || ones === undefined) return null;
        return tens * 10 + ones;
    }
    return token.length === 1 && CHINESE_DIGIT_MAP[token] !== undefined ? CHINESE_DIGIT_MAP[token] : null;
}

function normalizeChineseNumerals(text) {
    return String(text || '')
        .replace(/([零〇一二三四五六七八九]{4})(?=年)/gu, (match) =>
            [...match].map((ch) => CHINESE_DIGIT_MAP[ch]).join(''))
        .replace(/第([二三四五六七八九]?十[一二三四五六七八九]?|[零〇一二两三四五六七八九])/gu, (match, num) => {
            const value = chineseNumberToArabic(num);
            return value === null ? match : `第${value}`;
        })
        .replace(/([二三四五六七八九]?十[一二三四五六七八九]?|[零〇一二两三四五六七八九])(?=(?:天|日|周|星期|礼拜|个月|月|年|小时|分钟|秒|届|期|季|集|章|节|℃|度|公里|千米|毫米|倍|级))/gu, (match, num) => {
            const value = chineseNumberToArabic(num);
            return value === null ? match : String(value);
        });
}

function normalizeFuzzyText(text) {
    return normalizeChineseNumerals(cleanText(text));
}

function lightStem(word) {
    if (!word || word.length < 4 || !/^[a-z]+$/u.test(word) || UNINFLECTED_S_WORDS.has(word)) return word;
    let stem = word;
    if (stem.endsWith('ies') && stem.length > 5) stem = `${stem.slice(0, -3)}y`;
    else if (stem.endsWith('ied') && stem.length > 5) stem = `${stem.slice(0, -3)}y`;
    else if (/(?:ations|itions)$/u.test(stem) && stem.length - 6 >= 4) stem = stem.slice(0, -6);
    else if (/(?:ation|ition)$/u.test(stem) && stem.length - 5 >= 4) stem = stem.slice(0, -5);
    else if (/(?:tions|sions|ments)$/u.test(stem) && stem.length - 5 >= 4) stem = stem.slice(0, -5);
    else if (/(?:tion|sion|ment|ness)$/u.test(stem) && stem.length - 4 >= 4) stem = stem.slice(0, -4);
    else if (stem.endsWith('ing') && stem.length - 3 >= 4) stem = stem.slice(0, -3);
    else if (stem.endsWith('ed') && stem.length - 2 >= 4) stem = stem.slice(0, -2);
    else if (stem.endsWith('es') && !/(?:ss|us|is)$/u.test(stem.slice(0, -2)) && stem.length - 2 >= 4) stem = stem.slice(0, -2);
    else if (stem.endsWith('s') && !/(?:ss|us|is)$/u.test(stem) && stem.length - 1 >= 4) stem = stem.slice(0, -1);
    if (stem !== word && /([bcdfghjklmnpqrtvwx])\1$/u.test(stem) && stem.length - 1 >= 4) {
        stem = stem.slice(0, -1);
    }
    if (stem.length >= 6 && stem.endsWith('e')) stem = stem.slice(0, -1);
    return stem.length >= 4 ? stem : word;
}

function boundedEditDistance(a, b, maxDist) {
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > maxDist) return maxDist + 1;
    let prev = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
        const curr = [i];
        let rowMin = i;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            curr.push(val);
            if (val < rowMin) rowMin = val;
        }
        if (rowMin > maxDist) return maxDist + 1;
        prev = curr;
    }
    return prev[lb];
}

function extractAsciiFuzzyTokens(normalizedText) {
    const exactWords = new Set();
    const stems = new Set();
    const allWords = [];
    const seenAll = new Set();
    const recordWord = (token) => {
        if (!token) return;
        exactWords.add(token);
        if (token.length >= 4 && /^[a-z]+$/u.test(token)) {
            stems.add(lightStem(token));
            if (!seenAll.has(token)) {
                seenAll.add(token);
                allWords.push(token);
            }
        }
    };
    for (const match of normalizedText.matchAll(/[a-z0-9]+(?:[.\-_/:][a-z0-9]+)*/gu)) {
        const raw = match[0];
        const compact = raw.replace(/[.\-_/:]+/gu, '');
        if (compact.length >= 2) recordWord(compact);
        for (const sub of raw.split(/[.\-_/:]+/gu)) {
            if (sub.length >= 2) recordWord(sub);
            const alphaDigit = /^([a-z]{2,})(\d+)$/u.exec(sub);
            if (alphaDigit) {
                recordWord(alphaDigit[1]);
                exactWords.add(alphaDigit[2]);
            }
        }
    }
    for (const merged of normalizedText.matchAll(/([a-z]{2,})\s+(\d{1,3}|js|ts|py|go|rs|ng)(?![a-z0-9])/gu)) {
        recordWord(`${merged[1]}${merged[2]}`);
    }
    return { exactWords, stems, allWords };
}

function prepareFuzzyText(text) {
    const clean = cleanText(text);
    const normalized = normalizeChineseNumerals(clean);
    return { text: clean, normalized, words: extractAsciiFuzzyTokens(normalized) };
}

function scoreHanTermMatch(normalizedText, normTerm) {
    if (!normalizedText || !normTerm) return { score: 0, strong: false };
    const chars = [...normTerm];
    if (chars.length === 1) return { score: 0, strong: false };
    if (chars.length === 2) {
        if (/\p{N}/u.test(normTerm)) return { score: 0, strong: false };
        const [c0, c1] = chars;
        const p0 = [];
        for (let i = normalizedText.indexOf(c0); i !== -1 && p0.length < 8; i = normalizedText.indexOf(c0, i + 1)) p0.push(i);
        const p1 = [];
        for (let i = normalizedText.indexOf(c1); i !== -1 && p1.length < 8; i = normalizedText.indexOf(c1, i + 1)) p1.push(i);
        if (p0.length && p1.length) {
            let minDist = Infinity;
            for (const a of p0) for (const b of p1) minDist = Math.min(minDist, Math.abs(a - b));
            return minDist <= 6 ? { score: 0.65, strong: true } : { score: 0.48, strong: false };
        }
        if ((p0.length && !GENERIC_HAN_CHARS.has(c0)) || (p1.length && !GENERIC_HAN_CHARS.has(c1))) {
            return { score: 0.22, strong: false };
        }
        return { score: 0, strong: false };
    }
    const validBigrams = [];
    for (let i = 0; i < chars.length - 1; i++) {
        const a = chars[i];
        const b = chars[i + 1];
        if (/\p{N}/u.test(a) && /\p{N}/u.test(b)) continue;
        if (/\p{N}/u.test(a) && i > 0 && /\p{N}/u.test(chars[i - 1])) continue;
        validBigrams.push(`${a}${b}`);
    }
    if (validBigrams.length) {
        let matchedBigrams = 0;
        for (const bigram of validBigrams) {
            if (matchesTerm(normalizedText, bigram)) matchedBigrams++;
        }
        if (matchedBigrams > 0) {
            return { score: 0.5 + 0.35 * (matchedBigrams / validBigrams.length), strong: true };
        }
    }
    const hanChars = [...new Set(chars.filter((ch) => /\p{Script=Han}/u.test(ch) && !GENERIC_HAN_CHARS.has(ch)))];
    const matchedChars = hanChars.filter((ch) => normalizedText.includes(ch));
    if (hanChars.length >= 2 && matchedChars.length >= 2 && matchedChars.length / hanChars.length >= 0.5) {
        return { score: 0.38, strong: false };
    }
    return { score: 0, strong: false };
}

function scoreTermMatch(textView, term) {
    if (!textView?.text || !term) return { score: 0, strong: false };
    if (matchesTerm(textView.text, term)) return { score: 1, strong: true };
    const normTerm = normalizeFuzzyText(term);
    if (normTerm !== term && matchesTerm(textView.normalized, normTerm)) return { score: 0.92, strong: true };
    if (/\p{Script=Han}/u.test(normTerm)) return scoreHanTermMatch(textView.normalized, normTerm);

    const compactTerm = normTerm.replace(/[.\-_/:]+/gu, '');
    if (compactTerm && textView.words.exactWords.has(compactTerm)) return { score: 0.92, strong: true };
    if (compactTerm.length < 4 || /^\d+$/u.test(compactTerm)) return { score: 0, strong: false };

    const termStem = lightStem(compactTerm);
    if (termStem && textView.words.stems.has(termStem)) return { score: 0.78, strong: true };
    if (!/^[a-z]+$/u.test(compactTerm)) return { score: 0, strong: false };

    for (const word of textView.words.allWords) {
        if (compactTerm.length >= 5 && word.length >= 5) {
            const shorterLen = Math.min(compactTerm.length, word.length);
            const longerLen = Math.max(compactTerm.length, word.length);
            if (shorterLen / longerLen >= 0.6 && (word.startsWith(compactTerm) || compactTerm.startsWith(word))) {
                return { score: 0.68, strong: true };
            }
        }
        if (compactTerm.length >= 7 && word.length >= 7
            && word[0] === compactTerm[0] && word[1] === compactTerm[1]
            && boundedEditDistance(compactTerm, word, 2) <= 2) {
            return { score: 0.68, strong: true };
        }
        if (compactTerm.length >= 5 && word.length >= 5
            && word[0] === compactTerm[0]
            && boundedEditDistance(compactTerm, word, 1) <= 1) {
            return { score: 0.68, strong: true };
        }
    }
    return { score: 0, strong: false };
}

function matchesTerm(text, term) {
    if (!text || !term) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (/\p{Script=Han}/u.test(term)) {
        const prefix = /^\p{N}|^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}_]/u.test(term)
            ? `(?<!${WORD_BOUNDARY_CHAR})` : '';
        const suffix = /[\p{N}\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}_]$/u.test(term)
            ? `(?!${WORD_BOUNDARY_CHAR})` : '';
        if (!prefix && !suffix) return text.includes(term);
        return new RegExp(`${prefix}${escaped}${suffix}`, 'u').test(text);
    }
    return new RegExp(`(?<!${WORD_BOUNDARY_CHAR})${escaped}(?!${WORD_BOUNDARY_CHAR})`, 'u').test(text);
}

/** 0..1: subject coverage dominates; explicit dates/quotes/rank are soft signals. */
function scoreSearchRelevance(result, query) {
    if (!result || typeof result !== 'object') return 0;
    const allTerms = parseSearchQuery(query).terms;
    const subjectTerms = allTerms.filter((term) => !/^(?:19|20)\d{2}$/u.test(term));
    const terms = subjectTerms.length ? subjectTerms : allTerms;
    if (!terms.length) return 0;
    const titleView = prepareFuzzyText(result.title || result.name);
    const contentView = prepareFuzzyText(result.content || result.snippet || result.description);
    const url = cleanText(normalizeSearchUrl(result.url || result.link));
    const hasMultiCharSubject = terms.some((term) => !isSingleHanTerm(term));
    let coverage = 0;
    let totalWeight = 0;
    let urlCoverage = 0;
    let hasStrongAnchor = false;
    for (const term of terms) {
        const singleHan = isSingleHanTerm(term);
        const weight = hasMultiCharSubject && singleHan ? 0.35 : 1;
        totalWeight += weight;
        const titleMatch = scoreTermMatch(titleView, term);
        const contentMatch = titleMatch.score >= 1 ? titleMatch : scoreTermMatch(contentView, term);
        const bestScore = Math.max(titleMatch.score, 0.85 * contentMatch.score);
        if (bestScore > 0) {
            coverage += weight * bestScore;
            if ((!hasMultiCharSubject || !singleHan) && (titleMatch.strong || contentMatch.strong)) {
                hasStrongAnchor = true;
            }
        }
        urlCoverage += matchesTerm(url, term) ? weight : 0;
    }
    coverage = hasStrongAnchor && totalWeight ? coverage / totalWeight : 0;
    const weightedUrlCoverage = totalWeight ? urlCoverage / totalWeight : 0;
    if (!coverage) return 0.08 * weightedUrlCoverage;
    const text = `${titleView.text} ${contentView.text}`;
    const intentText = parseSearchQuery(query).text;
    const years = [...new Set(intentText.match(/(?<!\p{N})(?:19|20)\d{2}(?!\p{N})/gu) || [])];
    const yearBonus = years.length && years.some((year) => matchesTerm(text, year) || matchesTerm(`${titleView.normalized} ${contentView.normalized}`, year)) ? 0.025 : 0;
    const quotes = [...cleanText(query).matchAll(/["“]([^"”]+)["”]/gu)].map((match) => match[1]);
    const quoteBonus = quotes.length && quotes.some((quote) => text.includes(quote)) ? 0.025 : 0;
    const rank = Number(result.rank);
    const rankBonus = Number.isFinite(rank) && rank >= 1 ? 0.025 / Math.sqrt(rank) : 0;
    return Math.min(1, 0.9 * coverage ** 1.35 + 0.025 * weightedUrlCoverage + yearBonus + quoteBonus + rankBonus);
}

function boundedNumber(value, fallback, min, max) {
    return Number.isFinite(Number(value)) && value !== null
        ? Math.min(max, Math.max(min, Number(value))) : fallback;
}

/** Inputs and original one-based engine ranks are never mutated. */
function rankSearchResults(results, query, options = {}) {
    const limit = Math.floor(boundedNumber(options.limit, 5, 0, 100));
    const maxPerDomain = Math.floor(boundedNumber(options.maxPerDomain, 2, 1, 100));
    const minScore = boundedNumber(options.minScore, 0.24, 0, 1);
    const intent = parseSearchQuery(query);
    const candidates = (Array.isArray(results) ? results : []).flatMap((result, index) => {
        if (!result || typeof result !== 'object') return [];
        const url = normalizeSearchUrl(result.url || result.link);
        if (!url || !matchesSearchConstraints(result, intent)) return [];
        const relevanceScore = scoreSearchRelevance(result, query);
        const match = assessSearchMatch(result, query);
        return relevanceScore > 0 && relevanceScore >= minScore
            ? [{ result: { ...result, url, relevanceScore, ...match }, index }] : [];
    });
    const matchOrder = { direct: 0, background: 1, weak: 2 };
    candidates.sort((left, right) => matchOrder[left.result.matchType] - matchOrder[right.result.matchType]
        || Number(left.result.isIndex) - Number(right.result.isIndex)
        || right.result.relevanceScore - left.result.relevanceScore || left.index - right.index);
    // Merge provenance before applying output/domain budgets. Never invent ranks
    // from the position in a globally ranked list.
    const merged = new Map();
    for (const { result } of candidates) {
        if (!merged.has(result.url)) merged.set(result.url, { ...result, rankings: [] });
    }
    for (const result of (Array.isArray(results) ? results : [])) {
        if (!result || typeof result !== 'object') continue;
        const existing = merged.get(normalizeSearchUrl(result.url || result.link));
        if (!existing) continue;
        const observations = Array.isArray(result.rankings) ? result.rankings : [{
            engine: result.engine || '', query: result.query || '',
            rank: result.rank, score: result.score ?? null, relevanceScore: scoreSearchRelevance(result, query),
        }];
        existing.rankings.push(...observations.map(item => ({ ...item })));
    }
    const domains = new Map();
    const picked = new Set();
    const ranked = [];
    const tryPick = (result) => {
        if (picked.has(result.url)) return false;
        const domain = new URL(result.url).hostname.replace(/^www\./u, '');
        if ((domains.get(domain) || 0) >= maxPerDomain) return false;
        result.engines = [...new Set(result.rankings.map(item => item.engine).filter(Boolean))];
        result.engineCount = result.engines.length;
        domains.set(domain, (domains.get(domain) || 0) + 1);
        picked.add(result.url);
        ranked.push(result);
        return true;
    };
    const ordered = [...merged.values()];
    const multiTags = extractMultiTagTokens(intent);
    if (multiTags.length >= 4 && ordered.length > 1) {
        const coveredTags = new Set();
        const coverMatched = (result) => {
            for (const term of result.matchedTerms || []) coveredTags.add(term.toLowerCase());
        };
        for (const result of ordered) {
            if (ranked.length >= limit || result.matchType !== 'direct') break;
            if (tryPick(result)) coverMatched(result);
        }
        const firstBackground = ordered.find((item) => item.matchType === 'background');
        if (ranked.length < limit && firstBackground && tryPick(firstBackground)) coverMatched(firstBackground);
        for (const tag of intent.terms) {
            if (ranked.length >= limit) break;
            const lower = tag.toLowerCase();
            if (coveredTags.has(lower)) continue;
            const candidate = ordered.find((item) => !picked.has(item.url)
                && item.matchType === 'background'
                && (item.matchedTerms || []).some((term) => term.toLowerCase() === lower));
            if (candidate && tryPick(candidate)) coverMatched(candidate);
        }
    }
    for (const result of ordered) {
        if (ranked.length >= limit) break;
        tryPick(result);
    }
    return ranked;
}

module.exports = { rankSearchResults, scoreSearchRelevance, normalizeSearchUrl, extractSearchTerms, expandSearchQueries,
    parseSearchQuery, matchesSearchConstraints, assessSearchMatch, buildSearchFollowups, buildRelaxedSearchQueries, buildMultiTagQueries,
    extractMultiTagTokens };
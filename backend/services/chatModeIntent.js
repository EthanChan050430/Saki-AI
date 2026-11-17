'use strict';

// Chat mode is the fast path: it sends the persona plus conversation history and
// no agent prompt or tool catalog. The standalone capabilities Chat mode keeps
// (image generation, claim verification, web search) are recognised here before
// that single model call, so they never need the full agent loop.

const IMAGE_NOUN_RE = /(?:图片|图像|照片|插画|插图|海报|壁纸|头像|image|picture|photo|illustration|artwork|wallpaper|avatar|poster)/iu;
const IMAGE_LEAD_VERB_RE = /^(?:请|麻烦|帮我|帮忙|给我|能否|可以|please)?\s*(?:生成|画|绘制|做|设计|draw|generate|create|make|paint|design|sketch)/iu;
const IMAGE_MEASURE_RE = /^(?:请|麻烦|帮我|帮忙|给我|能否|可以)?\s*(?:画|绘制|draw|paint|sketch|生成|generate|create|make)\s*(?:一|1)?\s*(?:张|幅|个|副|只|条|片|组)/iu;
// Diagrams and tables are text work, not drawing-model work.
const IMAGE_EXCLUDE_RE = /(?:流程图|架构图|思维导图|示意图|路线图|图表|表格|diagram|flowchart|flow chart|chart|graph|mermaid|table)/iu;

const VERIFY_RE = /(?:核实|查证|辟谣|事实核查|真伪|真假|是真是假|真还是假|真实性|是真的吗|是真的么|是不是真的|真的假的|属实吗|可不可信|可信吗|靠谱吗|谣言|fact[- ]?check|verify (?:this|the|that) ?(?:claim|story|news)?|debunk|is (?:it|this) (?:true|real|fake))/iu;
const VERIFY_OBJECT_RE = /(?:验证|确认)(?:一下|下)?(?:这|那)?(?:条|个|则)?(?:消息|新闻|说法|传闻|信息|内容|报道|来源)/iu;

const SEARCH_VERB_RE = /(?:搜索|搜一下|搜一搜|搜搜|查一下|查一查|查查|查找|帮我查|上网查|联网查|网上查|search|look up|google)/iu;
const REALTIME_TOPIC_RE = /(?:最新|新闻|头条|热点|热搜|天气|气温|降雨|预报|股价|汇率|市值|比分|赛况|赛果|行情|油价|金价|多少钱|价格|发售|发布日期|上映|奖项|\b(?:latest|news|headline|weather|forecast|price|stock|exchange rate|score|release date|current)\b)/iu;
const GREETING_RE = /^(?:你好|您好|嗨|哈喽|早上好|中午好|下午好|晚上好|晚安|在吗|谢谢|感谢|好的|好呀|嗯+|哦+|哈哈+|呵呵+|hi|hello|hey|thanks|thank you|ok|okay|lol)[\s!！。.?？~]*$/iu;

function messageText(message = {}) {
    if (!message || typeof message !== 'object') return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.parts)) {
        return message.parts
            .filter((part) => part && part.type === 'text')
            .map((part) => String(part.content || ''))
            .join('\n');
    }
    return '';
}

function isImageRequest(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (IMAGE_EXCLUDE_RE.test(raw)) return false;
    if (/^(?:\/image|\/img)\b/iu.test(raw)) return true;
    if (/^请生成图片[:：]/u.test(raw)) return true;
    if (IMAGE_LEAD_VERB_RE.test(raw)) {
        if (IMAGE_NOUN_RE.test(raw)) return true;
        if (IMAGE_MEASURE_RE.test(raw)) return true;
        // A bare leading "画/绘制/draw/paint/sketch" is a drawing request too,
        // unless the message talks about code, files or diagrams.
        if (/^(?:请|麻烦|帮我|帮忙|给我|please)?\s*(?:画|绘制|draw|paint|sketch)/iu.test(raw)
            && !/(?:代码|程序|函数|接口|文件|目录|终端|命令|code|function|script|file|directory|terminal)/iu.test(raw)) {
            return true;
        }
    }
    return false;
}

function isVerificationRequest(text = '') {
    const raw = String(text || '').trim();
    return Boolean(raw) && (VERIFY_RE.test(raw) || VERIFY_OBJECT_RE.test(raw));
}

function isSearchRequest(text = '') {
    const raw = String(text || '').trim();
    if (!raw || GREETING_RE.test(raw)) return false;
    if (SEARCH_VERB_RE.test(raw) || REALTIME_TOPIC_RE.test(raw)) return true;
    // "现在几点 / 今天几号" style questions also need fresh, local knowledge.
    return /(?:今天|今日|现在)[^。！？?]{0,8}(?:多少|几|哪|什么|怎么样|如何)/u.test(raw);
}

function extractImagePrompt(text = '') {
    return String(text || '')
        .replace(/^\s*\/image\b\s*/iu, '')
        .replace(/^\s*\/img\b\s*/iu, '')
        .replace(/^\s*请生成图片[:：]\s*/u, '')
        .trim();
}

function extractClaim(text = '') {
    let claim = String(text || '').trim();
    claim = claim.replace(/^(?:请|麻烦|帮我|帮忙|能不能|能否|可以)?\s*(?:帮我)?\s*(?:核实|查证|验证|确认)(?:一下|下)?[：:，,、\s]*/u, '');
    claim = claim.replace(/^(?:这条|这个|这则)?(?:消息|新闻|说法|传闻|信息|报道)[：:，,、\s]*/u, '');
    claim = claim.replace(/[，,、\s]*(?:这|那)?(?:是|是不是)?真的(?:吗|么)?[？?]?$/u, '');
    claim = claim.replace(/[，,、\s]*(?:真的假的|属不属实|属实吗|可信吗|靠谱吗|有依据吗|有证据吗)[？?]?$/u, '');
    claim = claim.replace(/[，,、\s]*(?:帮我|请)?(?:核实|查证|验证|确认)(?:一下|下)?[？?]?$/u, '');
    return claim.replace(/^[：:，,、\s]+|[：:，,、\s]+$/gu, '').trim();
}

/**
 * Classifies the standalone capability a chat-mode message needs.
 * @param {string} message
 * @returns {{kind: 'image'|'verify'|'search'|'none', prompt?: string, claim?: string, query?: string}}
 */
function detectChatModeIntent(message = '') {
    const text = String(message || '').trim();
    if (!text) return { kind: 'none' };
    if (isImageRequest(text)) {
        return { kind: 'image', prompt: extractImagePrompt(text) || text };
    }
    if (isVerificationRequest(text)) {
        return { kind: 'verify', claim: extractClaim(text) || text };
    }
    if (isSearchRequest(text)) {
        return { kind: 'search', query: text };
    }
    return { kind: 'none' };
}

/**
 * Keeps only the newest turns within a message and character budget so the fast
 * chat path stays cheap on long conversations.
 */
function selectChatHistory(history = [], { maxMessages = 18, maxChars = 14000 } = {}) {
    const list = Array.isArray(history) ? history : [];
    const selected = [];
    let chars = 0;
    for (let index = list.length - 1; index >= 0 && selected.length < maxMessages; index -= 1) {
        const message = list[index];
        if (!message) continue;
        const size = messageText(message).length;
        if (selected.length && chars + size > maxChars) break;
        selected.push(message);
        chars += size;
    }
    return selected.reverse();
}

module.exports = {
    detectChatModeIntent,
    selectChatHistory,
    isImageRequest,
    isVerificationRequest,
    isSearchRequest,
    extractImagePrompt,
    extractClaim,
    messageText,
};

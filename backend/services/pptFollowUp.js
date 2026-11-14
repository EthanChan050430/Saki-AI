const { revisePresentation, revisionPrompt, validateSlide } = require('./pptRevision');
const {
    prepareSlideImageSlotHtml,
    injectSlideSlotSrcHtml,
    removeSlideImageSlotHtml,
} = require('./pptImages');

function stripSlideText(html = '') {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Find the most recent message containing a completed PPT presentation with slides.
 */
function findLatestCompletedPptMessage(messages = []) {
    if (!Array.isArray(messages)) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        const pptData = msg?.pptData;
        if (
            pptData
            && pptData.status === 'completed'
            && Array.isArray(pptData.steps)
            && pptData.steps.some(step => Boolean(step?.content))
        ) {
            return msg;
        }
    }
    return null;
}

/**
 * Normalize content slides (steps that have rendered HTML) with 1-based slide numbers.
 */
function getContentSlidesWithNumbers(steps = []) {
    if (!Array.isArray(steps)) return [];
    const slides = [];
    for (let idx = 0; idx < steps.length; idx += 1) {
        const step = steps[idx];
        if (!step || !step.content) continue;
        const slideNumber = slides.length + 1;
        const stepId = step.id != null ? step.id : idx;
        const html = String(step.content || '');
        const imgCount = (html.match(/<img\b/gi) || []).length;
        slides.push({
            stepIndex: idx,
            slideNumber,
            stepId,
            title: step.title || `第 ${slideNumber} 页`,
            hasImage: imgCount > 0,
            imageCount: imgCount,
            textPreview: stripSlideText(html).slice(0, 180),
        });
    }
    return slides;
}

/**
 * Summarize a PPT deck compactly for conversational context injection.
 */
function summarizePptDeckForContext(pptData = {}) {
    const slides = getContentSlidesWithNumbers(pptData?.steps || []);
    if (!slides.length) return '';
    const header = `[Completed PPT: "${pptData.pptTitle || 'Presentation'}" (${slides.length} slides)]`;
    const lines = slides.map(s => `P${s.slideNumber}: ${s.title}${s.hasImage ? ' [has image]' : ''} — ${s.textPreview.slice(0, 90)}`);
    return [header, ...lines].join('\n');
}

/**
 * Detect whether a user's follow-up message intends to modify an existing completed PPT.
 */
function detectPptFollowUpIntent(message = '', hasCompletedPpt = false, { usePpt = false } = {}) {
    if (!hasCompletedPpt) return false;
    const text = String(message || '').trim();
    if (!text) return false;

    const explicitSlideRef = /(?:\bp\s*\d+\b|第\s*[0-9一二三四五六七八九十两]+\s*页|\bslide\s*\d+\b|封面页?|目录页?|结尾页?|最后一页|这[一]?页|那[一]?页|每[一]?页|各页|全部页面|整套|整份)/i.test(text);

    // Explicit request to create a brand-new deck on a topic (not editing an existing page)
    const explicitNewDeck = !explicitSlideRef && (
        /(?:重新|另[外外]?|再|帮我|请)?(?:制作|生成|做|新建)(?:一份|一套|一个|个)(?:全新的|新的|别的|其他|关于).{0,40}(?:ppt|演示文稿|幻灯片)/i.test(text)
        || /(?:start|create|make|generate|build)\s+(?:a\s+)?(?:brand\s+)?new\s+(?:ppt|presentation|slide\s*deck)\s+(?:about|on|for)\b/i.test(text)
    );
    if (explicitNewDeck) return false;

    // Pure analytical questions without edit verbs should go to normal Q&A
    const hasEditVerb = /(?:加|添加|加上|补充|补[一两0-9]*[张幅个]|插入|多加|放|配上|配[图张]|配[一两三四五六七八九十0-9]*[张幅个]|画|绘|搜[图索]|找[一两0-9]*[张幅个]?图|改|修改|编辑|调整|更新|优化|精简|删|去掉|移除|替换|换[成个上]?|重[做写画排版]|美化|统一|改版|换风格|add|insert|include|put|edit|modify|change|update|revise|improve|simplify|redesign|replace|remove|delete|illustrate|draw|search)/i.test(text);
    const mentionsTargetVisualOrDeck = /(?:ppt|幻灯片|演示文稿|图片|配图|插图|照片|剧照|图表|排版|布局|配色|风格|主题|字体|文字|内容|标题|slide|deck|image|picture|photo|illustration|layout|style|theme)/i.test(text);

    if (!hasEditVerb) return false;

    if (explicitSlideRef && (mentionsTargetVisualOrDeck || hasEditVerb)) {
        return true;
    }

    if (/(?:ppt|幻灯片|演示文稿)/i.test(text) && (hasEditVerb || mentionsTargetVisualOrDeck)) {
        return true;
    }

    if (/(?:多加|增加|补充|添加|插入|配上|配[一两三四五六七八九十0-9]*[张幅个]|找[一两0-9]*[张幅个]|换上).{0,16}(?:图片|配图|插图|照片|剧照|示意图)/i.test(text)) {
        return true;
    }

    if (usePpt && hasEditVerb && mentionsTargetVisualOrDeck) {
        return true;
    }

    return false;
}

const CN_DIGIT_MAP = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function parseChineseOrArabicNumber(token = '') {
    const clean = String(token || '').trim();
    if (/^\d+$/.test(clean)) return parseInt(clean, 10);
    if (CN_DIGIT_MAP[clean]) return CN_DIGIT_MAP[clean];
    if (clean.startsWith('十') && clean.length === 2 && CN_DIGIT_MAP[clean[1]]) {
        return 10 + CN_DIGIT_MAP[clean[1]];
    }
    return null;
}

/**
 * Parse referenced 1-based slide numbers from a natural language request.
 */
function parseSlideNumbersFromText(message = '', totalSlides = 0) {
    if (!totalSlides) return [];
    const text = String(message || '');
    const nums = new Set();

    // Ranges like P3-P5, P3~5, 第2到4页, 第2到第4页, 第2-4页
    const rangeRegex = /(?:p|slide|第)\s*([0-9]+|[一二三四五六七八九十]+)\s*(?:-|~|到|至|and|to)\s*(?:p|slide|第)?\s*([0-9]+|[一二三四五六七八九十]+)\s*页?/gi;
    for (const match of text.matchAll(rangeRegex)) {
        const a = parseChineseOrArabicNumber(match[1]);
        const b = parseChineseOrArabicNumber(match[2]);
        if (a && b) {
            const start = Math.max(1, Math.min(a, b));
            const end = Math.min(totalSlides, Math.max(a, b));
            for (let k = start; k <= end; k += 1) nums.add(k);
        }
    }

    const singleRegex = /(?:\bp\s*([0-9]{1,2})\b|\bslide\s*([0-9]{1,2})\b|第\s*([0-9]{1,2}|[一二三四五六七八九十两]+)\s*页)/gi;
    for (const match of text.matchAll(singleRegex)) {
        const val = parseChineseOrArabicNumber(match[1] || match[2] || match[3]);
        if (val && val >= 1 && val <= totalSlides) nums.add(val);
    }

    if (/封面页?/i.test(text) && totalSlides >= 1) nums.add(1);
    if (/结尾页?|最后一页/i.test(text) && totalSlides >= 1) nums.add(totalSlides);

    return Array.from(nums).sort((a, b) => a - b);
}

function inferImageMode({ message = '', preferredMode = '', canSearchImages = true, canDrawImages = false, uploadedImages = [] }) {
    if (preferredMode === 'uploaded' && uploadedImages.length > 0) {
        return 'uploaded';
    }
    const explicitlyWantsDraw = /(?:画一?张|ai\s*绘|ai\s*画|绘画|手绘|插画|生成.*图)/i.test(message);
    if (preferredMode === 'draw' || explicitlyWantsDraw) {
        if (canDrawImages) return 'draw';
        return canSearchImages ? 'search' : (uploadedImages.length > 0 ? 'uploaded' : 'none');
    }
    if (preferredMode === 'search') {
        if (canSearchImages) return 'search';
        return canDrawImages ? 'draw' : (uploadedImages.length > 0 ? 'uploaded' : 'none');
    }
    if (uploadedImages.length > 0) return 'uploaded';
    if (canSearchImages) return 'search';
    if (canDrawImages) return 'draw';
    return 'none';
}

function summarizeAttachmentsForPlan(attachments = []) {
    const uploadedImages = [];
    const referenceDocs = [];
    for (const att of Array.isArray(attachments) ? attachments : []) {
        if (!att) continue;
        const name = String(att.name || att.filename || 'attachment').trim();
        if (att.isImage && att.source) {
            uploadedImages.push({
                index: uploadedImages.length,
                name,
                source: att.source,
            });
        } else if (!att.isImage && att.content) {
            referenceDocs.push({
                name,
                excerpt: String(att.content || '').trim().slice(0, 3500),
            });
        }
    }
    return { uploadedImages, referenceDocs };
}

/**
 * Deterministic regex/heuristic fallback planner when LLM planning is absent or invalid.
 */
function extractDeterministicFollowUpPlan({
    message = '',
    pptData = {},
    canSearchImages = true,
    canDrawImages = false,
    activeSlideNumber = null,
    attachments = [],
}) {
    const contentSlides = getContentSlidesWithNumbers(pptData?.steps || []);
    if (!contentSlides.length) {
        return { summary: '', globalTheme: '', operations: [] };
    }

    const { uploadedImages, referenceDocs } = summarizeAttachmentsForPlan(attachments);
    const explicitNumbers = parseSlideNumbersFromText(message, contentSlides.length);
    const hasUploadedImage = uploadedImages.length > 0;
    const wantsImages = hasUploadedImage || /(?:图片|配图|插图|照片|剧照|画一?张|加图|多加.*图|image|picture|photo|illustration)/i.test(message);
    const wantsGlobalAll = /(?:全部|所有|整套|整份|每[一]?页|各页|多加一些)/i.test(message);
    const wantsContentRevise = referenceDocs.length > 0 || /(?:精简|调整|改[版成写亮暗少简洁]|修改|重[写做排]|删[除掉]|去[掉除]|排版|布局|配色|风格|主题|字体|对齐|拥挤|对比|数据|图表|参照|根据|结合|补充内容|layout|style|theme|simplify|redesign|revise|content)/i.test(message);

    const imageMode = inferImageMode({ message, canSearchImages, canDrawImages, uploadedImages });
    const deckTitle = String(pptData.pptTitle || '').trim();

    let targetSlides = [];
    if (explicitNumbers.length > 0) {
        targetSlides = contentSlides.filter(s => explicitNumbers.includes(s.slideNumber));
    } else if (!wantsGlobalAll && activeSlideNumber != null) {
        const activeTarget = contentSlides.find(s => s.slideNumber === Number(activeSlideNumber));
        if (activeTarget) targetSlides = [activeTarget];
    }

    if (!targetSlides.length) {
        if (wantsGlobalAll && wantsImages && !wantsContentRevise) {
            const bodyWithoutImages = contentSlides.filter(s => s.slideNumber > 1 && !s.hasImage);
            const anyWithoutImages = contentSlides.filter(s => !s.hasImage);
            const pool = bodyWithoutImages.length ? bodyWithoutImages : (anyWithoutImages.length ? anyWithoutImages : contentSlides.slice(1));
            targetSlides = pool.slice(0, Math.min(4, Math.max(1, pool.length)));
        } else if (wantsGlobalAll) {
            targetSlides = contentSlides;
        } else if (wantsImages && !wantsContentRevise) {
            const bodyWithoutImages = contentSlides.filter(s => s.slideNumber > 1 && !s.hasImage);
            const anyWithoutImages = contentSlides.filter(s => !s.hasImage);
            const pool = bodyWithoutImages.length ? bodyWithoutImages : (anyWithoutImages.length ? anyWithoutImages : contentSlides.slice(1));
            targetSlides = pool.slice(0, Math.min(4, Math.max(1, pool.length)));
        } else {
            targetSlides = contentSlides.slice(0, Math.min(3, contentSlides.length));
        }
    }

    let action = 'revise-content';
    if (wantsImages && wantsContentRevise) action = 'revise-and-image';
    else if (wantsImages) action = 'add-image';

    if (action !== 'revise-content' && imageMode === 'none') {
        action = 'revise-content';
    }

    const operations = targetSlides.map((slide, idx) => ({
        slideNumber: slide.slideNumber,
        stepIndex: slide.stepIndex,
        stepId: slide.stepId,
        slideTitle: slide.title,
        action,
        instruction: String(message || '').trim() || (hasUploadedImage ? `将参考图片合理配入第 ${slide.slideNumber} 页并优化排版` : ''),
        imageMode: action === 'revise-content' ? 'none' : imageMode,
        uploadedImageIndex: action !== 'revise-content' && imageMode === 'uploaded'
            ? (idx % Math.max(1, uploadedImages.length))
            : null,
        imageQuery: action === 'revise-content'
            ? ''
            : (imageMode === 'uploaded'
                ? (uploadedImages[idx % uploadedImages.length]?.name || slide.title)
                : `${deckTitle} ${slide.title}`.trim()),
    }));

    return {
        summary: `计划修改 ${operations.map(op => `P${op.slideNumber}`).join('、')}`,
        globalTheme: '',
        operations,
    };
}

function parseJsonFromLlm(raw = '') {
    const text = String(raw || '').trim();
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;
    try {
        return JSON.parse(candidate);
    } catch {
        const objMatch = candidate.match(/\{[\s\S]*\}/);
        if (!objMatch) return null;
        try {
            return JSON.parse(objMatch[0]);
        } catch {
            return null;
        }
    }
}

/**
 * Use the configured LLM to plan slide-level PPT follow-up modifications, with deterministic fallback.
 */
async function planPptFollowUpOperations({
    message = '',
    pptData = {},
    activeSlideNumber = null,
    attachments = [],
    canSearchImages = true,
    canDrawImages = false,
    callLlmJson,
}) {
    const contentSlides = getContentSlidesWithNumbers(pptData?.steps || []);
    if (!contentSlides.length) {
        return { summary: '', globalTheme: '', operations: [] };
    }

    const { uploadedImages, referenceDocs } = summarizeAttachmentsForPlan(attachments);
    const explicitNumbers = parseSlideNumbersFromText(message, contentSlides.length);
    const fallback = extractDeterministicFollowUpPlan({
        message,
        pptData,
        activeSlideNumber,
        attachments,
        canSearchImages,
        canDrawImages,
    });

    if (typeof callLlmJson !== 'function') {
        return fallback;
    }

    const slideInventory = contentSlides.map(s => (
        `- P${s.slideNumber} (title="${s.title}", hasImage=${s.hasImage}): ${s.textPreview}`
    )).join('\n');

    const attachmentContextLines = [
        uploadedImages.length
            ? `用户上传图片列表：\n${uploadedImages.map(img => `- uploadedImageIndex=${img.index}: ${img.name}`).join('\n')}`
            : '',
        referenceDocs.length
            ? `用户附带参考文档：\n${referenceDocs.map(doc => `《${doc.name}》内容摘要：\n${doc.excerpt.slice(0, 1200)}`).join('\n\n')}`
            : '',
    ].filter(Boolean).join('\n\n');

    const allowedModes = [
        uploadedImages.length ? '"uploaded"' : '',
        canSearchImages ? '"search"' : '',
        canDrawImages ? '"draw"' : '',
        '"none"',
    ].filter(Boolean).join(' / ');

    const prompt = `你是一个专业PPT精修与智能配图 Agent。用户正在查看一套已完成的PPT，并给出了修改要求（可能附带参考图片或文件）。请你自主决定需要修改哪些页面、是否需要结合文档更新文案、以及采用哪种配图策略（直接使用用户上传图片 / 联网搜图 / AI 绘图）。

PPT标题：${pptData.pptTitle || '演示文稿'}
当前统一视觉规范：${pptData.theme || '未指定'}
${activeSlideNumber ? `用户当前正在预览的页面：P${activeSlideNumber}` : ''}
可用配图能力：
- 用户上传图片(uploaded)：${uploadedImages.length ? `已上传 ${uploadedImages.length} 张` : '无'}
- 联网搜图(search)：${canSearchImages ? '可用' : '不可用'}
- AI绘图(draw)：${canDrawImages ? '可用' : '不可用'}

现有幻灯片清单（P1 至 P${contentSlides.length}）：
${slideInventory}

${attachmentContextLines ? `${attachmentContextLines}\n\n` : ''}用户修改需求：
${message}

规划规则：
1. 若用户指定了具体页码（如 P6、第3页），只修改这些页面；若用户未指定页码且当前正在预览 P${activeSlideNumber || 1}（且未要求整套/多页/全局修改），默认优先修改当前页 P${activeSlideNumber || 1}；若用户要求“多加一些图片/整套修改”，请挑选 3-4 页最适合配图理解且当前 hasImage=false 的正文页。
2. action 可选值：
   - "add-image"：为页面插入或替换一张贴合内容的配图（保持原有文字与核心数据，自动调整为左文右图免遮挡）。
   - "revise-content"：修改页面文案、排版结构、字体配色或融入参考文档内容，不额外插图。
   - "revise-and-image"：既按需求改写版式/内容，又配入新图。
3. imageMode 只能是 ${allowedModes}。
   - 若用户上传了图片并适合直接放入幻灯片，请优先使用 "uploaded" 并填写对应的 "uploadedImageIndex"（0 起）。
   - 若需要真实世界照片/影视剧照/产品实物，请自主选择 "search"；若适合概念插画/结构隐喻/抽象视觉，请自主选择 "draw"；无需配图时为 "none"。
4. imageQuery 填写简洁精准的搜图关键词或绘图主体描述（不要写操作指令）。

请严格只返回 JSON 对象：
{
  "summary": "一句话概述本次修改与配图方案",
  "globalTheme": "",
  "operations": [
    {
      "slideNumber": ${activeSlideNumber || 6},
      "action": "add-image",
      "instruction": "具体改版与排版优化要求",
      "imageMode": "${uploadedImages.length ? 'uploaded' : (canSearchImages ? 'search' : 'draw')}",
      "uploadedImageIndex": ${uploadedImages.length ? 0 : null},
      "imageQuery": "简洁关键词或画面描述"
    }
  ]
}`;

    try {
        const raw = await callLlmJson(prompt);
        const parsed = parseJsonFromLlm(raw);
        const rawOps = Array.isArray(parsed?.operations) ? parsed.operations : [];
        const slideMap = new Map(contentSlides.map(s => [s.slideNumber, s]));
        const seen = new Set();
        const normalizedOps = [];

        for (const op of rawOps) {
            const slideNum = parseInt(op?.slideNumber, 10);
            const target = slideMap.get(slideNum);
            if (!target || seen.has(slideNum)) continue;
            if (explicitNumbers.length > 0 && !explicitNumbers.includes(slideNum)) continue;
            seen.add(slideNum);

            let action = ['add-image', 'revise-content', 'revise-and-image'].includes(op?.action)
                ? op.action
                : 'revise-content';
            let resolvedImgMode = action === 'revise-content'
                ? 'none'
                : inferImageMode({
                    message,
                    preferredMode: op?.imageMode,
                    canSearchImages,
                    canDrawImages,
                    uploadedImages,
                });
            if (action !== 'revise-content' && resolvedImgMode === 'none') {
                action = 'revise-content';
            }

            const upIdxRaw = Number.isInteger(op?.uploadedImageIndex) ? op.uploadedImageIndex : 0;
            const uploadedIdx = resolvedImgMode === 'uploaded' && uploadedImages.length
                ? Math.max(0, Math.min(uploadedImages.length - 1, upIdxRaw))
                : null;

            normalizedOps.push({
                slideNumber: slideNum,
                stepIndex: target.stepIndex,
                stepId: target.stepId,
                slideTitle: target.title,
                action,
                instruction: String(op?.instruction || message).trim() || message.trim(),
                imageMode: resolvedImgMode,
                uploadedImageIndex: uploadedIdx,
                imageQuery: action === 'revise-content'
                    ? ''
                    : (resolvedImgMode === 'uploaded'
                        ? (uploadedImages[uploadedIdx]?.name || target.title)
                        : (String(op?.imageQuery || '').trim() || `${pptData.pptTitle || ''} ${target.title}`.trim())),
            });
        }

        if (explicitNumbers.length > 0) {
            for (const fbOp of fallback.operations) {
                if (!seen.has(fbOp.slideNumber)) {
                    seen.add(fbOp.slideNumber);
                    normalizedOps.push(fbOp);
                }
            }
            normalizedOps.sort((a, b) => a.slideNumber - b.slideNumber);
        }

        if (!normalizedOps.length) {
            return fallback;
        }

        return {
            summary: String(parsed?.summary || fallback.summary).trim(),
            globalTheme: String(parsed?.globalTheme || '').trim(),
            operations: normalizedOps,
        };
    } catch {
        return fallback;
    }
}

/**
 * Assemble standalone printable HTML wrapper matching runPPTLoop output.
 */
function buildPptDocumentHtml(steps = []) {
    const allHtml = (Array.isArray(steps) ? steps : [])
        .filter(s => Boolean(s?.content))
        .map(s => s.content)
        .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; padding: 40px; display: flex; flex-direction: column; align-items: center; }
        .slide { 
            background: white; 
            width: 960px;
            height: 540px;
            margin: 0 auto 40px; 
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            page-break-after: always;
            flex-shrink: 0;
            box-sizing: border-box;
        }
        .slide * { box-sizing: border-box; }
        .slide p, .slide li { 
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
        }
        .slide .grid > div, .slide .flex > div {
          max-height: 380px; 
          overflow: hidden;
        }
        .slide [class*="text-transparent"] {
          color: #4f46e5 !important;
          background-clip: initial !important;
          -webkit-background-clip: initial !important;
          background-image: none !important;
        }
        @media print {
            body { padding: 0; background: white; block-size: auto; }
            .slide { box-shadow: none; border-radius: 0; margin: 0; width: 297mm; height: 167mm; }
        }
    </style>
</head>
<body>
    <div class="slides-container" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
        ${allHtml}
    </div>
</body>
</html>`;
}

/**
 * Execute a planned sequence of PPT slide edits and/or image insertions while streaming progress.
 */
async function applyPptFollowUpPlan({
    pptData,
    plan,
    attachments = [],
    runtimeConfig = {},
    canSearchImages = true,
    canDrawImages = false,
    callSlideLlm,
    resolveImageSource,
    parseSlideResponse,
    onProgress,
    chatId = 'ppt',
    targetMessageId = 'ppt',
    isAborted = () => false,
}) {
    let workingDeck = JSON.parse(JSON.stringify(pptData || {}));
    if (!Array.isArray(workingDeck.steps) || workingDeck.status !== 'completed') {
        throw new Error('Presentation must be completed before applying follow-up edits.');
    }
    // Clear stale assembled HTML before editing so intermediate progress events do not double deck payload size
    workingDeck.finalHtml = '';

    const { uploadedImages, referenceDocs } = summarizeAttachmentsForPlan(attachments);
    const docsReferenceBlock = referenceDocs.length
        ? `\n\n[用户附带参考文档资料]\n${referenceDocs.map(d => `### ${d.name}\n${d.excerpt}`).join('\n\n')}`
        : '';

    // Ensure every content step has a stable id so revisePresentation works cleanly even on older decks
    workingDeck.steps = workingDeck.steps.map((step, idx) => (
        step?.content && step.id == null ? { ...step, id: idx } : step
    ));

    if (plan?.globalTheme) {
        workingDeck.theme = plan.globalTheme;
    }

    const operations = Array.isArray(plan?.operations) ? plan.operations : [];
    const results = [];

    const emitProgress = async (deckStatus = 'running') => {
        if (typeof onProgress === 'function') {
            await onProgress({ ...workingDeck, status: deckStatus });
        }
    };

    for (const op of operations) {
        if (isAborted()) break;
        const stepIdx = workingDeck.steps.findIndex((s, i) => (
            s?.content && (s.id != null ? String(s.id) === String(op.stepId) : i === op.stepIndex)
        ));
        if (stepIdx < 0) continue;

        const targetStep = workingDeck.steps[stepIdx];
        const stepId = targetStep.id != null ? targetStep.id : stepIdx;

        targetStep.status = 'running';
        targetStep.subStage = op.action === 'add-image'
            ? (op.imageMode === 'draw' ? 'drawing-image' : 'searching-image')
            : 'thinking';
        targetStep.streamProgress = 0;
        await emitProgress('running');

        let slideRevised = false;
        let imageInserted = false;
        let resolvedImageMode = '';
        let resolvedImageQuery = '';
        let opNote = '';

        // 1. Content / Layout revision via LLM if requested
        if ((op.action === 'revise-content' || op.action === 'revise-and-image') && typeof callSlideLlm === 'function') {
            const extraImageConstraint = op.action === 'revise-and-image'
                ? ' Ensure a clean left-text / right-image layout (right zone x=520..900 reserved for an illustration) and preserve all existing facts.'
                : ' Preserve existing images unless explicitly asked to remove or replace them.';
            const prompt = revisionPrompt(
                workingDeck,
                stepId,
                `${op.instruction}${plan?.globalTheme ? ` Apply global visual style: ${plan.globalTheme}.` : ''}${extraImageConstraint}${docsReferenceBlock}`
            );

            try {
                let raw = '';
                let accumulatedRaw = '';
                let lastEmit = 0;
                let lastEmittedSubStage = workingDeck.steps[stepIdx].subStage || '';
                raw = await callSlideLlm(prompt, (partialText) => {
                    if (isAborted() || typeof parseSlideResponse !== 'function') return;
                    accumulatedRaw += String(partialText || '');
                    const parsed = parseSlideResponse(accumulatedRaw);
                    const nextSubStage = parsed.isHtmlStreaming ? 'coding' : 'thinking';
                    if (parsed.thinking) workingDeck.steps[stepIdx].thinking = parsed.thinking;
                    workingDeck.steps[stepIdx].subStage = nextSubStage;
                    workingDeck.steps[stepIdx].streamProgress = parsed.htmlChars || 0;
                    const now = Date.now();
                    const stageChanged = nextSubStage !== lastEmittedSubStage;
                    if (stageChanged || now - lastEmit >= 2500) {
                        lastEmit = now;
                        lastEmittedSubStage = nextSubStage;
                        emitProgress('running').catch(() => {});
                    }
                });

                if (!isAborted()) {
                    const parsedFinal = typeof parseSlideResponse === 'function'
                        ? parseSlideResponse(raw)
                        : { html: raw, thinking: workingDeck.steps[stepIdx].thinking || '' };
                    const candidateHtml = parsedFinal?.html || '';
                    validateSlide(candidateHtml);
                    const nextDeck = revisePresentation(
                        { ...workingDeck, status: 'completed' },
                        stepId,
                        {
                            content: candidateHtml,
                            thinking: parsedFinal.thinking || workingDeck.steps[stepIdx].thinking || `已按要求优化第 ${op.slideNumber} 页`,
                        },
                        false
                    );
                    workingDeck = {
                        ...workingDeck,
                        steps: nextDeck.steps,
                        revision: nextDeck.revision,
                    };
                    workingDeck.steps[stepIdx].status = 'running';
                    slideRevised = true;
                }
            } catch (revErr) {
                opNote = `版式修改降级保留原稿 (${revErr.message})`;
            }
        }

        // 2. Image search / drawing / uploaded insertion if requested
        if (!isAborted() && (op.action === 'add-image' || op.action === 'revise-and-image')) {
            try {
                const currentHtml = workingDeck.steps[stepIdx].content;
                const prepared = prepareSlideImageSlotHtml(currentHtml, {
                    slotId: 'hero',
                    ensureSlot: true,
                    alt: targetStep.title,
                });

                let resolved = null;
                if (op.imageMode === 'uploaded' && uploadedImages.length > 0) {
                    const imgEntry = uploadedImages[op.uploadedImageIndex ?? 0] || uploadedImages[0];
                    if (imgEntry?.source) {
                        resolved = {
                            source: imgEntry.source,
                            mode: 'uploaded',
                            query: imgEntry.name,
                        };
                    }
                }

                if (!resolved && typeof resolveImageSource === 'function') {
                    const preferred = op.imageMode === 'draw' ? 'draw' : 'search';
                    workingDeck.steps[stepIdx].subStage = preferred === 'draw' ? 'drawing-image' : 'searching-image';
                    await emitProgress('running');

                    resolved = await resolveImageSource({
                        requestedMode: op.imageMode === 'uploaded' ? 'auto' : (op.imageMode || 'auto'),
                        query: op.imageQuery || `${workingDeck.pptTitle || ''} ${targetStep.title}`.trim(),
                        fallbackQuery: `${workingDeck.pptTitle || ''} ${targetStep.title}`.trim(),
                        config: runtimeConfig,
                        canSearchImages,
                        canDrawImages,
                        chatId: chatId || 'ppt',
                        slideTag: `${targetMessageId}_p${op.slideNumber}_r${Date.now()}`,
                    });
                }

                if (resolved?.source) {
                    const updatedHtml = injectSlideSlotSrcHtml(
                        prepared.html,
                        prepared.slotId,
                        resolved.source,
                        resolved.query || targetStep.title
                    );
                    const modeText = resolved.mode === 'uploaded'
                        ? '用户附带图片'
                        : (resolved.mode === 'draw' ? 'AI绘图' : '联网搜图');
                    const nextThinking = slideRevised
                        ? (workingDeck.steps[stepIdx].thinking || '')
                        : `${workingDeck.steps[stepIdx].thinking ? `${workingDeck.steps[stepIdx].thinking}\n` : ''}已通过${modeText}补充配图（${resolved.query || targetStep.title}），并自动调整左文右图安全边距避免遮挡。`;

                    if (slideRevised) {
                        workingDeck.steps[stepIdx].content = updatedHtml;
                        workingDeck.steps[stepIdx].thinking = nextThinking;
                    } else {
                        const nextDeck = revisePresentation(
                            { ...workingDeck, status: 'completed' },
                            stepId,
                            { content: updatedHtml, thinking: nextThinking },
                            false
                        );
                        workingDeck = {
                            ...workingDeck,
                            steps: nextDeck.steps,
                            revision: nextDeck.revision,
                        };
                    }
                    workingDeck.steps[stepIdx].imageStatus = 'completed';
                    workingDeck.steps[stepIdx].imageMode = resolved.mode;
                    workingDeck.steps[stepIdx].imageQuery = resolved.query;
                    imageInserted = true;
                    resolvedImageMode = resolved.mode;
                    resolvedImageQuery = resolved.query || op.imageQuery;
                } else {
                    workingDeck.steps[stepIdx].content = removeSlideImageSlotHtml(prepared.html, prepared.slotId);
                    opNote = opNote || '未检索到可用的高匹配度图片，已保留原页面内容';
                }
            } catch (imgErr) {
                opNote = opNote || `配图处理失败: ${imgErr.message}`;
            }
        }

        workingDeck.steps[stepIdx].status = 'completed';
        workingDeck.steps[stepIdx].subStage = 'done';
        await emitProgress('running');

        results.push({
            slideNumber: op.slideNumber,
            stepId,
            title: targetStep.title,
            action: op.action,
            slideRevised,
            imageInserted,
            imageMode: resolvedImageMode,
            imageQuery: resolvedImageQuery,
            note: opNote,
        });
    }

    workingDeck.status = 'completed';
    workingDeck.finalHtml = buildPptDocumentHtml(workingDeck.steps);

    const summaryLines = results.map(r => {
        const changes = [];
        if (r.slideRevised) changes.push('优化版式与内容');
        if (r.imageInserted) {
            const modeLabel = r.imageMode === 'uploaded'
                ? '插入上传图片'
                : (r.imageMode === 'draw' ? 'AI 绘图配图' : '联网搜图配图');
            changes.push(`${modeLabel}（${r.imageQuery || r.title}）`);
        }
        if (!changes.length) changes.push(r.note || '保持原样');
        return `- **P${r.slideNumber}《${r.title}》**：${changes.join('，')}${r.note && (r.slideRevised || r.imageInserted) ? `（${r.note}）` : ''}`;
    });

    const changedCount = results.filter(r => r.slideRevised || r.imageInserted).length;
    const summaryMarkdown = changedCount > 0
        ? `已完成对 PPT《${workingDeck.pptTitle || '演示文稿'}》的修改（共更新 ${changedCount} 页）：\n${summaryLines.join('\n')}\n\n可点击下方入口全屏查看效果；每页修改均支持在左侧「AI 改版」栏点击 **恢复上一版** 随时撤销。`
        : `已检查 PPT《${workingDeck.pptTitle || '演示文稿'}》，但本次未能成功应用修改：\n${summaryLines.join('\n') || '- 请检查搜图/绘图或对话模型配置后重试。'}`;

    return {
        pptData: workingDeck,
        results,
        summaryMarkdown,
    };
}

module.exports = {
    findLatestCompletedPptMessage,
    getContentSlidesWithNumbers,
    summarizePptDeckForContext,
    detectPptFollowUpIntent,
    parseSlideNumbersFromText,
    extractDeterministicFollowUpPlan,
    planPptFollowUpOperations,
    buildPptDocumentHtml,
    applyPptFollowUpPlan,
};

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { revisePresentation } = require('../services/pptRevision');
const {
    findLatestCompletedPptMessage,
    getContentSlidesWithNumbers,
    summarizePptDeckForContext,
    detectPptFollowUpIntent,
    parseSlideNumbersFromText,
    extractDeterministicFollowUpPlan,
    planPptFollowUpOperations,
    applyPptFollowUpPlan,
} = require('../services/pptFollowUp');

function createCompletedDeck() {
    return {
        pptTitle: '身体互换影视题材研究',
        theme: 'Editorial business dark navy & coral accent',
        status: 'completed',
        finalHtml: '<html><body>existing</body></html>',
        revision: 0,
        steps: [
            {
                id: 0,
                title: '换位之间，看见自己',
                status: 'completed',
                thinking: '封面设计',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><h1>身体互换影视题材研究</h1></div></div>',
            },
            {
                id: 1,
                title: '研究背景：为什么反复吸引观众',
                status: 'completed',
                thinking: '第二页已配图',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><p>已有配图说明</p><img src="data:image/png;base64,AAA" /></div></div>',
            },
            {
                id: 2,
                title: '题材谱系：类型地图',
                status: 'completed',
                thinking: '第三页排版',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><h2>类型地图</h2><p>喜剧、奇幻、悬疑三大分支</p></div></div>',
            },
            {
                id: 3,
                title: '吸引力机制一：身份错位反差',
                status: 'completed',
                thinking: '第四页排版',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><h2>身份错位</h2><p>性别、年龄、阶级互换带来戏剧冲突</p></div></div>',
            },
            {
                id: 4,
                title: '吸引力机制二：换位共情体验',
                status: 'completed',
                thinking: '第五页排版',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><h2>换位共情</h2><p>理解他人困境</p></div></div>',
            },
            {
                id: 5,
                title: '吸引力机制三：禁忌与窥视心理',
                status: 'completed',
                thinking: '第六页排版',
                content: '<div class="slide" style="position:relative;width:960px;height:540px;"><div class="p-16"><h2>禁忌释放</h2><p>越界规则带来新鲜刺激</p></div></div>',
            },
            {
                title: 'PPT 制作完成',
                status: 'completed',
                content: '',
            },
        ],
    };
}

describe('pptFollowUp', () => {
    test('findLatestCompletedPptMessage locates most recent completed presentation', () => {
        const deck = createCompletedDeck();
        const messages = [
            { id: 'u1', role: 'user', content: '做个PPT' },
            { id: 'a1', role: 'assistant', pptData: { status: 'running', steps: [{ content: '' }] } },
            { id: 'a2', role: 'assistant', pptData: deck },
            { id: 'u2', role: 'user', content: 'P6加图片' },
        ];
        const found = findLatestCompletedPptMessage(messages);
        assert.equal(found?.id, 'a2');
        assert.equal(findLatestCompletedPptMessage([{ id: 'x', role: 'user', content: 'hi' }]), null);
    });

    test('detectPptFollowUpIntent distinguishes modifications from pure Q&A and brand-new decks', () => {
        assert.equal(detectPptFollowUpIntent('P6可以加一些图片来让人 更容易理解', true), true);
        assert.equal(detectPptFollowUpIntent('PPT内多加一些图片来让人更容易理解', true), true);
        assert.equal(detectPptFollowUpIntent('把第3页和第5页改得更简洁一些', true), true);
        assert.equal(detectPptFollowUpIntent('把第4页配一张合适的插图', true), true);
        assert.equal(detectPptFollowUpIntent('给P4找张剧照配图', true), true);
        assert.equal(detectPptFollowUpIntent('整套PPT换成暖色风格', true, { usePpt: true }), true);

        assert.equal(detectPptFollowUpIntent('P6可以加一些图片', false), false);
        assert.equal(detectPptFollowUpIntent('总结一下这份PPT的核心观点', true), false);
        assert.equal(detectPptFollowUpIntent('帮我重新制作一份全新的关于火星探测的PPT', true, { usePpt: true }), false);
    });

    test('parseSlideNumbersFromText handles single slides, ranges, Chinese numerals and landmarks', () => {
        assert.deepEqual(parseSlideNumbersFromText('P6可以加一些图片', 9), [6]);
        assert.deepEqual(parseSlideNumbersFromText('把第2到第4页和最后一页精简一下', 9), [2, 3, 4, 9]);
        assert.deepEqual(parseSlideNumbersFromText('封面页换个配色，再修改P3-P5', 9), [1, 3, 4, 5]);
    });

    test('summarizePptDeckForContext and getContentSlidesWithNumbers accurately index P1..PN', () => {
        const deck = createCompletedDeck();
        const slides = getContentSlidesWithNumbers(deck.steps);
        assert.equal(slides.length, 6);
        assert.equal(slides[1].hasImage, true);
        assert.equal(slides[5].slideNumber, 6);
        const summary = summarizePptDeckForContext(deck);
        assert.match(summary, /P6: 吸引力机制三：禁忌与窥视心理/);
    });

    test('planPptFollowUpOperations handles explicit page image additions and LLM fallback', async () => {
        const deck = createCompletedDeck();
        const p6Plan = await planPptFollowUpOperations({
            message: 'P6可以加一些图片来让人 更容易理解',
            pptData: deck,
            canSearchImages: true,
            canDrawImages: false,
            callLlmJson: async () => 'not valid json',
        });
        assert.deepEqual(p6Plan.operations.map(o => o.slideNumber), [6]);
        assert.equal(p6Plan.operations[0].action, 'add-image');
        assert.equal(p6Plan.operations[0].imageMode, 'search');

        const multiImagePlan = extractDeterministicFollowUpPlan({
            message: 'PPT内多加一些图片来让人更容易理解',
            pptData: deck,
            canSearchImages: true,
            canDrawImages: true,
        });
        // Skips P1 (cover) and P2 (already has image), targets P3..P6
        assert.deepEqual(multiImagePlan.operations.map(o => o.slideNumber), [3, 4, 5, 6]);
        assert.equal(multiImagePlan.operations.every(o => o.action === 'add-image'), true);
    });

    test('applyPptFollowUpPlan adds images cleanly with undo support and edits content safely', async () => {
        const deck = createCompletedDeck();
        const plan = {
            summary: '修改 P3 与 P6',
            globalTheme: '',
            operations: [
                {
                    slideNumber: 6,
                    stepIndex: 5,
                    stepId: 5,
                    slideTitle: '吸引力机制三：禁忌与窥视心理',
                    action: 'add-image',
                    instruction: '为 P6 补充影视配图',
                    imageMode: 'search',
                    imageQuery: 'Your Name movie scene body swap',
                },
                {
                    slideNumber: 3,
                    stepIndex: 2,
                    stepId: 2,
                    slideTitle: '题材谱系：类型地图',
                    action: 'revise-content',
                    instruction: '改成三栏卡片布局',
                    imageMode: 'none',
                    imageQuery: '',
                },
            ],
        };

        const progressSnapshots = [];
        const applied = await applyPptFollowUpPlan({
            pptData: deck,
            plan,
            canSearchImages: true,
            canDrawImages: false,
            callSlideLlm: async (_prompt, onToken) => {
                onToken('<THINKING>调整为三栏布局</THINKING>');
                return '<THINKING>调整为三栏布局</THINKING><SLIDE_HTML><div class="slide p-12"><h2>类型地图（三栏版）</h2></div></SLIDE_HTML>';
            },
            resolveImageSource: async ({ query }) => ({
                source: 'data:image/png;base64,NEWIMGDATA',
                mode: 'search',
                query,
            }),
            parseSlideResponse: (raw) => {
                const t = raw.match(/<THINKING>([\s\S]*?)<\/THINKING>/i)?.[1]?.trim() || '';
                const h = raw.match(/<SLIDE_HTML>([\s\S]*?)<\/SLIDE_HTML>/i)?.[1]?.trim() || '';
                return { thinking: t, html: h, isHtmlStreaming: /<SLIDE_HTML>/i.test(raw), htmlChars: h.length };
            },
            onProgress: async (snapshot) => {
                progressSnapshots.push(snapshot.status);
            },
        });

        assert.equal(applied.pptData.status, 'completed');
        assert.match(applied.pptData.steps[5].content, /NEWIMGDATA/);
        assert.equal(applied.pptData.steps[5].revisions.length, 1);
        assert.match(applied.pptData.steps[2].content, /三栏版/);
        // Untouched slide stays identical
        assert.equal(applied.pptData.steps[3].content, deck.steps[3].content);
        // finalHtml is rebuilt and contains revised slide
        assert.match(applied.pptData.finalHtml, /三栏版/);
        assert.match(applied.summaryMarkdown, /P6/);
        assert.match(applied.summaryMarkdown, /P3/);
        assert.ok(progressSnapshots.length >= 4);

        // Undo P6 restores pre-image content cleanly
        const restored = revisePresentation(applied.pptData, 5, null, true);
        assert.equal(restored.steps[5].content, deck.steps[5].content);
    });

    test('sidebar agent mode targets activeSlideNumber and incorporates uploaded image & reference files', async () => {
        const deck = createCompletedDeck();
        const attachments = [
            { name: 'reference-photo.png', isImage: true, source: 'data:image/png;base64,UPLOADEDIMG123' },
            { name: 'notes.md', isImage: false, content: '补充核心观点：观众通过安全边界共情角色。' },
        ];

        const plan = await planPptFollowUpOperations({
            message: '结合文档精简文案，并放进这张参考图',
            pptData: deck,
            activeSlideNumber: 4,
            attachments,
            canSearchImages: true,
            canDrawImages: true,
            callLlmJson: async () => 'fallback',
        });

        assert.deepEqual(plan.operations.map(o => o.slideNumber), [4]);
        assert.equal(plan.operations[0].imageMode, 'uploaded');
        assert.equal(plan.operations[0].action, 'revise-and-image');

        let seenPrompt = '';
        const applied = await applyPptFollowUpPlan({
            pptData: deck,
            plan,
            attachments,
            canSearchImages: true,
            canDrawImages: false,
            callSlideLlm: async (prompt) => {
                seenPrompt = prompt;
                return '<THINKING>融合参考资料优化第四页</THINKING><SLIDE_HTML><div class="slide p-12"><h2>身份错位</h2><p>安全边界共情角色</p></div></SLIDE_HTML>';
            },
            parseSlideResponse: (raw) => ({
                thinking: raw.match(/<THINKING>([\s\S]*?)<\/THINKING>/i)?.[1]?.trim() || '',
                html: raw.match(/<SLIDE_HTML>([\s\S]*?)<\/SLIDE_HTML>/i)?.[1]?.trim() || '',
            }),
        });

        assert.match(seenPrompt, /安全边界共情角色/);
        assert.match(applied.pptData.steps[3].content, /安全边界共情角色/);
        assert.match(applied.pptData.steps[3].content, /UPLOADEDIMG123/);
        assert.match(applied.summaryMarkdown, /插入上传图片/);
    });
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    detectChatModeIntent,
    selectChatHistory,
    extractClaim,
    extractImagePrompt,
} = require('../services/chatModeIntent');

test('detects image generation in common Chinese and English phrasings', () => {
    assert.equal(detectChatModeIntent('请生成图片：一只在月光下的猫').kind, 'image');
    assert.equal(detectChatModeIntent('帮我画一张赛博朋克城市').kind, 'image');
    assert.equal(detectChatModeIntent('画个可爱的小狐狸').kind, 'image');
    assert.equal(detectChatModeIntent('/image a glass of iced coffee').kind, 'image');
    assert.equal(detectChatModeIntent('generate an image of a red panda').kind, 'image');
    assert.equal(detectChatModeIntent('draw a lighthouse at dusk').kind, 'image');
});

test('does not treat diagrams, tables or how-to questions as image generation', () => {
    assert.equal(detectChatModeIntent('画一个流程图说明登录流程').kind === 'image', false);
    assert.equal(detectChatModeIntent('帮我画一个架构图').kind === 'image', false);
    assert.equal(detectChatModeIntent('怎么生成图片？').kind === 'image', false);
    assert.equal(detectChatModeIntent('写一段代码画一个圆').kind === 'image', false);
    assert.equal(detectChatModeIntent('生成一张表格').kind === 'image', false);
});

test('extracts the drawing prompt from slash-command and prefix forms', () => {
    assert.equal(extractImagePrompt('/image 一只柴犬'), '一只柴犬');
    assert.equal(extractImagePrompt('请生成图片：星空下的灯塔'), '星空下的灯塔');
    assert.equal(extractImagePrompt('帮我画一张赛博朋克城市'), '帮我画一张赛博朋克城市');
});

test('detects claim verification and extracts the claim', () => {
    assert.equal(detectChatModeIntent('帮我核实：日本排放核废水是真的吗').kind, 'verify');
    assert.equal(extractClaim('帮我核实：日本排放核废水是真的吗'), '日本排放核废水');
    assert.equal(detectChatModeIntent('这条新闻是真是假').kind, 'verify');
    assert.equal(detectChatModeIntent('请查证一下这个说法').kind, 'verify');
    assert.equal(detectChatModeIntent('fact check this claim about the moon landing').kind, 'verify');
    assert.equal(detectChatModeIntent('帮我验证这条消息').kind, 'verify');
});

test('does not treat ordinary statements as verification requests', () => {
    assert.equal(detectChatModeIntent('这个蛋糕真的很好吃').kind, 'none');
    assert.equal(detectChatModeIntent('验证一下这段代码能不能跑').kind, 'none');
});

test('detects search requests and skips greetings', () => {
    assert.equal(detectChatModeIntent('搜索一下今天上海的天气').kind, 'search');
    assert.equal(detectChatModeIntent('今天有什么新闻').kind, 'search');
    assert.equal(detectChatModeIntent('最新的 iPhone 价格是多少').kind, 'search');
    assert.equal(detectChatModeIntent('search the latest node release').kind, 'search');
    assert.equal(detectChatModeIntent('你好呀').kind, 'none');
    assert.equal(detectChatModeIntent('帮我写一首关于春天的诗').kind, 'none');
    assert.equal(detectChatModeIntent('我现在有点累，想聊聊天').kind, 'none');
    assert.equal(detectChatModeIntent('最近我总觉得压力很大').kind, 'none');
});

test('verification wins over search and image wins over both', () => {
    assert.equal(detectChatModeIntent('帮我查证最新新闻是不是真的').kind, 'verify');
    assert.equal(detectChatModeIntent('画一张今天新闻的图').kind, 'image');
});

test('selectChatHistory keeps the newest turns within the budget', () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        parts: [{ type: 'text', content: `message-${index}` }],
    }));
    const selected = selectChatHistory(history, { maxMessages: 6, maxChars: 10000 });
    assert.equal(selected.length, 6);
    assert.equal(selected.at(-1).parts[0].content, 'message-29');
    assert.equal(selected[0].parts[0].content, 'message-24');

    const tight = selectChatHistory(history, { maxMessages: 30, maxChars: 120 });
    assert.ok(tight.length < 30);
    assert.equal(tight.at(-1).parts[0].content, 'message-29');
});

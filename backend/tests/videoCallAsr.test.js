const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createVideoCallAsr, resolvePython } = require('../services/videoCallAsr');

const SCRIPT = join(__dirname, '..', 'services', 'videoCallAsr.py');
const python = resolvePython();
const pythonWorks = spawnSync(python, ['-c', 'pass'], { stdio: 'ignore' }).status === 0;

// A stand-in worker that speaks the real line protocol without loading a model,
// so the transport, timeouts, cancellation and restart paths stay testable.
const STUB = `
import base64, json, sys
print(json.dumps({"ready": True, "device": "cpu", "model": "stub", "loadMs": 1}), flush=True)
for line in sys.stdin:
    if not line.strip():
        continue
    job = json.loads(line)
    value = base64.b64decode(job["audio"]).decode("utf-8", "replace")
    if value == "FAIL":
        print(json.dumps({"id": job["id"], "error": True}), flush=True)
        continue
    if value == "CRASH":
        sys.exit(3)
    print(json.dumps({"id": job["id"], "text": "echo:" + value}), flush=True)
`;

function stubWorker(t) {
    const directory = mkdtempSync(join(tmpdir(), 'saki-asr-'));
    const path = join(directory, 'stub.py');
    writeFileSync(path, STUB);
    const saved = process.env.SAKI_ASR_SCRIPT;
    process.env.SAKI_ASR_SCRIPT = path;
    const asr = createVideoCallAsr();
    t.after(() => {
        asr.stop();
        if (saved === undefined) delete process.env.SAKI_ASR_SCRIPT;
        else process.env.SAKI_ASR_SCRIPT = saved;
        rmSync(directory, { recursive: true, force: true });
    });
    return asr;
}

const audio = value => Buffer.from(value);

test('worker readiness is cached and reported, transcripts round-trip', { skip: !pythonWorks && 'python unavailable' }, async t => {
    const asr = stubWorker(t);
    assert.equal(asr.status(), undefined);
    assert.deepEqual(asr.readiness(), { state: 'starting' });
    const [first, second] = await Promise.all([asr.warm(), asr.warm()]);
    assert.deepEqual(first, { device: 'cpu', model: 'stub', loadMs: 1 });
    assert.equal(first, second, 'concurrent warm-up must share one worker');
    assert.equal(asr.status().model, 'stub');
    assert.deepEqual(asr.readiness(), { state: 'ready', ...first });
    const controller = new AbortController();
    assert.equal(await asr.transcribe(audio('hello'), 'zh', controller.signal), 'echo:hello');
});

test('worker errors reject, abort resolves empty and never rejects', { skip: !pythonWorks && 'python unavailable' }, async t => {
    const asr = stubWorker(t);
    await assert.rejects(asr.transcribe(audio('FAIL'), 'zh', new AbortController().signal));
    const controller = new AbortController();
    const pending = asr.transcribe(audio('hello'), 'zh', controller.signal);
    controller.abort();
    assert.equal(await pending, '');
    assert.equal(await asr.transcribe(audio('after'), 'zh', new AbortController().signal), 'echo:after');
});

test('a crashed worker fails pending jobs and respawns for the next call', { skip: !pythonWorks && 'python unavailable' }, async t => {
    const asr = stubWorker(t);
    await asr.warm();
    await assert.rejects(asr.transcribe(audio('CRASH'), 'zh', new AbortController().signal));
    assert.equal(asr.status(), undefined, 'status must not outlive the worker');
    assert.equal(await asr.transcribe(audio('again'), 'zh', new AbortController().signal), 'echo:again');
});

function cleanWorker(t, env = {}) {
    const child = spawn(python, ['-u', SCRIPT, '--clean'], {
        stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env },
    });
    const rows = createInterface({ input: child.stdout });
    const replies = [];
    rows.on('line', line => replies.push(JSON.parse(line)));
    t.after(() => child.kill());
    return {
        replies,
        async send(text, language) {
            const before = replies.length;
            child.stdin.write(JSON.stringify({ text, language }) + '\n');
            for (let attempt = 0; attempt < 200 && replies.length === before; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            return replies.at(-1)?.text;
        },
    };
}

const cleanWorks = pythonWorks && spawnSync(python, ['-c', 'import opencc'], { stdio: 'ignore' }).status === 0;

test('transcripts are tidied and Whisper artefacts are dropped', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    const worker = cleanWorker(t);
    // Whisper spaces Chinese tokens apart and mixes half-width punctuation in.
    assert.equal(await worker.send('嗨嗨,我来了今天想先聊什么呀', 'zh'), '嗨嗨，我来了今天想先聊什么呀');
    assert.equal(await worker.send('今天 天气 不错', 'zh'), '今天天气不错');
    // Silence and noise make Whisper copy its prompt or label the audio instead.
    assert.equal(await worker.send('以下是中英文混合的对话内容', 'zh'), '');
    assert.equal(await worker.send('中文用简体中文并带标点', 'zh'), '');
    assert.equal(await worker.send('English words keep their original spelling', 'zh'), '');
    assert.equal(await worker.send('[BLANK_AUDIO]', 'zh'), '');
    assert.equal(await worker.send('(music)', 'zh'), '');
    assert.equal(await worker.send('谢谢观看', 'zh'), '');
    assert.equal(await worker.send('。。。', 'zh'), '');
    // Real speech that merely resembles the filtered phrases survives.
    assert.equal(await worker.send('谢谢你刚才的帮忙', 'zh'), '谢谢你刚才的帮忙');
    assert.equal(await worker.send('Hello there, how are you?', 'en'), 'Hello there, how are you?');
});

test('commas Whisper welds to a language switch are removed, real ones are not', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    const worker = cleanWorker(t);
    // The comma the Chinese punctuation model inserts around English words reads
    // as a pause and splits the sentence, so it is dropped.
    assert.equal(await worker.send('帮我把这个，JSON文件转成，Excel，表格', 'zh'), '帮我把这个JSON文件转成Excel表格');
    assert.equal(await worker.send('OK, 我觉得这个， design, 挺好的', 'zh'), 'OK我觉得这个design挺好的');
    assert.equal(await worker.send('版本是，1.0.3，你commit之后push一下', 'zh'), '版本是1.0.3你commit之后push一下');
    // Commas between two Chinese phrases are genuine pauses and must survive.
    assert.equal(await worker.send('我想吃火锅，你能推荐一家吗？', 'zh'), '我想吃火锅，你能推荐一家吗？');
    assert.equal(await worker.send('好的，我知道了。', 'zh'), '好的，我知道了。');
});

test('traditional Chinese is converted and kana spacing collapses', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    const worker = cleanWorker(t);
    assert.equal(await worker.send('這個問題很嚴重', 'zh'), '这个问题很严重');
    assert.equal(await worker.send('こんにちは 元気ですか', 'ja'), 'こんにちは元気ですか');
});

// Whisper prefers the homophone 亚斯 for the domain word 雅思, which is exactly the
// complaint this custom vocabulary fixes.
test('homophone domain words are corrected by default', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    const worker = cleanWorker(t);
    assert.equal(await worker.send('我下个月要考亚斯', 'zh'), '我下个月要考雅思');
    assert.equal(await worker.send('亚思考试报名了吗', 'zh'), '雅思考试报名了吗');
    assert.equal(await worker.send('明天上午有亚斯课', 'zh'), '明天上午有雅思课');
    // A correct transcript is left alone.
    assert.equal(await worker.send('我雅思考了六点五分', 'zh'), '我雅思考了六点五分');
    // Unrelated speech containing neither key is untouched.
    assert.equal(await worker.send('我想申请英国的研究生', 'zh'), '我想申请英国的研究生');
});

test('custom replacements are configurable and can be switched off', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    const custom = cleanWorker(t, { SAKI_ASR_REPLACE: '托付=托福,退特=推特' });
    assert.equal(await custom.send('这个专业对托付成绩有要求吗', 'zh'), '这个专业对托福成绩有要求吗');
    // The default pair is gone once the variable is overridden.
    assert.equal(await custom.send('我要考亚斯', 'zh'), '我要考亚斯');
    const disabled = cleanWorker(t, { SAKI_ASR_REPLACE: '' });
    assert.equal(await disabled.send('我要考亚斯', 'zh'), '我要考亚斯');
});

test('hotwords normalise their separators for the decoder', { skip: !cleanWorks && 'opencc unavailable' }, async t => {
    // The clean pass does not decode, so only the parser is observable here: a
    // malformed list must not crash the worker or leak into the transcript.
    const worker = cleanWorker(t, { SAKI_ASR_HOTWORDS: '雅思, 托福;Saki' });
    assert.equal(await worker.send('雅思托福Saki', 'zh'), '雅思托福Saki');
});

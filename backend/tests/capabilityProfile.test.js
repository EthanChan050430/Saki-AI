const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCapabilityProfile,
    getDrawingCapabilityState,
    getQqBridgeCapabilityState,
    getTtsCapabilityState,
} = require('../services/capabilityProfile');

test('drawing capability state reflects configured providers', () => {
    assert.equal(getDrawingCapabilityState({ drawingProvider: 'none' }), 'disabled in settings');
    assert.equal(
        getDrawingCapabilityState({ drawingProvider: 'stable-diffusion', drawingModel: 'sdxl' }),
        'enabled via Stable Diffusion (sdxl)'
    );
    assert.equal(
        getDrawingCapabilityState({ drawingProvider: 'custom', customDrawingModel: 'flux-dev' }),
        'enabled via custom image API (flux-dev)'
    );
});

test('tts and qq capability state report setup clearly', () => {
    assert.equal(
        getTtsCapabilityState({ ttsProvider: 'gpt-sovits', sovitsGptModel: 'foo.ckpt' }),
        'enabled via GPT-SoVITS with local voice assets'
    );
    assert.equal(
        getQqBridgeCapabilityState({
            thirdPartyChats: {
                qqbot: {
                    enabled: true,
                    appId: '123',
                    clientSecret: 'abc',
                },
            },
        }),
        'configured and can bridge chats to QQ'
    );
});

test('capability profile distinguishes current and optional features', () => {
    const profile = buildCapabilityProfile({
        config: {
            musicEnabled: false,
            drawingProvider: 'none',
            ttsProvider: 'browser',
        },
        searchEnabled: true,
        mcpEnabled: false,
        shouldUseMemory: false,
        permissionMode: 'default',
        sandboxPath: 'C:/sandbox',
        mcpToolCount: 0,
    });

    assert.match(profile, /Available right now in this chat:/);
    assert.match(profile, /Web access: enabled for live web lookup in this chat\./);
    assert.match(profile, /Memory: available, but not active in this chat/);
    assert.match(profile, /Drawing: disabled in settings\./);
    assert.match(profile, /Instrumental music: disabled in settings\./);
    assert.match(profile, /QQ bridge: optional integration, currently disabled\./);
    assert.match(profile, /Permissions: terminal and file tools stay inside the sandbox \(C:\/sandbox\) by default/);
});

test('capability profile reports enabled mcp and memory states', () => {
    const profile = buildCapabilityProfile({
        config: {
            musicEnabled: true,
            drawingProvider: 'stable-diffusion',
            drawingModel: 'dreamshaper',
            ttsProvider: 'gpt-sovits',
            sovitsRefAudio: 'ref.wav',
        },
        searchEnabled: false,
        mcpEnabled: true,
        shouldUseMemory: true,
        permissionMode: 'full-access',
        sandboxPath: 'C:/sandbox',
        mcpToolCount: 3,
    });

    assert.match(profile, /Web access: disabled for live search in this chat, but direct URL browsing is still available\./);
    assert.match(profile, /Memory: enabled in this chat\./);
    assert.match(profile, /MCP: enabled in this chat with 3 loaded MCP tools\./);
    assert.match(profile, /Drawing: enabled via Stable Diffusion \(dreamshaper\)\./);
    assert.match(profile, /Instrumental music: enabled for short instrumental MIDI sketches/);
    assert.match(profile, /Voice output: enabled via GPT-SoVITS with local voice assets\./);
    assert.match(profile, /Permissions: terminal and file tools can reach the broader workspace\./);
});

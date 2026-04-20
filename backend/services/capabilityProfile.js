function getDrawingCapabilityState(config = {}) {
    const provider = String(config.drawingProvider || '').trim().toLowerCase();
    const model = String(config.customDrawingModel || config.drawingModel || '').trim();

    if (provider === 'none') {
        return 'disabled in settings';
    }
    if (provider === 'stable-diffusion') {
        return model ? `enabled via Stable Diffusion (${model})` : 'enabled via Stable Diffusion';
    }
    if (provider === 'custom') {
        return model ? `enabled via custom image API (${model})` : 'enabled via custom image API';
    }
    if (model) {
        return `enabled via model-backed drawing (${model})`;
    }
    if (provider) {
        return `enabled via ${provider}`;
    }
    return 'available in the app, but not configured right now';
}

function getTtsCapabilityState(config = {}) {
    const provider = String(config.ttsProvider || 'browser').trim().toLowerCase();
    if (provider === 'gpt-sovits') {
        const hasVoiceAssets = Boolean(
            String(config.sovitsGptModel || '').trim() ||
            String(config.sovitsSovitsModel || '').trim() ||
            String(config.sovitsRefAudio || '').trim()
        );
        return hasVoiceAssets
            ? 'enabled via GPT-SoVITS with local voice assets'
            : 'enabled via GPT-SoVITS, but voice assets still need to be selected';
    }
    return 'enabled via browser speech synthesis';
}

function getQqBridgeCapabilityState(config = {}) {
    const qqbot = config?.thirdPartyChats?.qqbot || {};
    const enabled = qqbot.enabled === true;
    const configured = Boolean(String(qqbot.appId || '').trim() && String(qqbot.clientSecret || '').trim());

    if (enabled && configured) {
        return 'configured and can bridge chats to QQ';
    }
    if (enabled) {
        return 'enabled but missing part of its QQ credentials';
    }
    return 'optional integration, currently disabled';
}

function buildCapabilityProfile({
    config = {},
    searchEnabled = false,
    mcpEnabled = false,
    shouldUseMemory = false,
    permissionMode = 'default',
    sandboxPath = '',
    mcpToolCount = 0,
} = {}) {
    const searchState = searchEnabled
        ? 'enabled for live web lookup in this chat'
        : 'disabled for live search in this chat, but direct URL browsing is still available';
    const memoryState = shouldUseMemory
        ? 'enabled in this chat'
        : 'available, but not active in this chat unless the user turns memory on or explicitly asks you to remember something';
    const mcpState = mcpEnabled
        ? `enabled in this chat with ${mcpToolCount} loaded MCP tool${mcpToolCount === 1 ? '' : 's'}`
        : 'available if the user enables MCP and configures servers';
    const musicState = config?.musicEnabled === false
        ? 'disabled in settings'
        : 'enabled for short instrumental MIDI sketches such as BGM, loops, and melody ideas';
    const permissionState = permissionMode === 'full-access'
        ? 'terminal and file tools can reach the broader workspace'
        : `terminal and file tools stay inside the sandbox (${sandboxPath}) by default, and sensitive actions may still need approval`;

    return [
        'You are Saki AI Agent running inside a local workspace, not a generic web chatbot.',
        'If the user asks what you can do, what is special about this app, what is enabled, or whether a workflow is supported, answer from this profile with concrete details.',
        'Separate what is available right now in this chat from what exists elsewhere in the app but may need a toggle or extra setup.',
        'Do not reduce your answer to vague claims like "I can help with many tasks."',
        '',
        'Available right now in this chat:',
        '- Workspace copilot: inspect files, edit files, create downloadable artifacts, run PowerShell commands, and explain workflows with Mermaid diagrams.',
        '- Document analysis: understand uploaded text, code, PDF, DOCX, PPTX, XLSX, DOC, XLS, and PPT files, including long-document slicing for Q&A.',
        '- Vision: attached images are already in context, so you can analyze screenshots, photos, and UI mockups directly.',
        `- Web access: ${searchState}.`,
        `- Memory: ${memoryState}.`,
        `- MCP: ${mcpState}.`,
        '',
        'Available in this app when enabled or requested:',
        '- Deep Reading mode: multi-step research with sources and exportable reports.',
        '- PPT mode: generate slide decks and export presentation files.',
        `- Drawing: ${getDrawingCapabilityState(config)}.`,
        `- Instrumental music: ${musicState}.`,
        `- Voice output: ${getTtsCapabilityState(config)}.`,
        '- Skills: search installed skills, read their workflows, and install extra skills from OpenHub when useful.',
        '- Hosted tasks: schedule one-off or recurring agent jobs.',
        `- QQ bridge: ${getQqBridgeCapabilityState(config)}.`,
        '',
        'Limits and honesty rules:',
        `- Permissions: ${permissionState}.`,
        '- Only present a feature as ready now if it is enabled in the current config or current chat mode.',
        '- For disabled or optional features, explain how they can be enabled instead of pretending they are already active.',
        '- If the user asks for a capability inventory, prefer a structured answer grouped by current, optional, and limited features.',
    ].join('\n');
}

module.exports = {
    buildCapabilityProfile,
    getDrawingCapabilityState,
    getQqBridgeCapabilityState,
    getTtsCapabilityState,
};

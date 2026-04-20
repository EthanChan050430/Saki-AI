const NON_CHAT_MODEL_PATTERN = /\b(embed(ding)?|whisper|tts|speech|transcription|translation|moderation|rerank)\b|dall-e|gpt-image|glm-image|cogview|stable-diffusion|sdxl/i;

function normalizeCustomApiBaseUrl(baseUrl = '') {
    let normalized = String(baseUrl || '').trim();
    if (!normalized) return '';

    normalized = normalized.replace(/\/+$/, '');
    normalized = normalized.replace(/\/chat\/completions$/i, '');
    normalized = normalized.replace(/\/responses$/i, '');
    normalized = normalized.replace(/\/models$/i, '');
    normalized = normalized.replace(/\/images\/generations$/i, '');
    normalized = normalized.replace(/\/audio\/(speech|transcriptions|translations)$/i, '');

    if (!/\/v\d+$/i.test(normalized)) {
        normalized = `${normalized}/v1`;
    }

    return normalized.replace(/\/+$/, '');
}

function normalizeCustomChatCompletionsUrl(baseUrl = '') {
    const normalizedBaseUrl = normalizeCustomApiBaseUrl(baseUrl);
    return normalizedBaseUrl ? `${normalizedBaseUrl}/chat/completions` : '';
}

function collectModelItems(payload = {}) {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.models)) return payload.models;
    if (Array.isArray(payload?.result)) return payload.result;
    return Array.isArray(payload) ? payload : [];
}

function resolveModelName(item) {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return '';

    return String(
        item.id
        || item.name
        || item.model
        || item.model_id
        || item.slug
        || ''
    ).trim();
}

function resolveModelLabel(item, fallback = '') {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return fallback;

    return String(
        item.label
        || item.name
        || item.id
        || item.model
        || fallback
    ).trim();
}

function isLikelyChatCapableCustomModel(modelName = '') {
    const normalized = String(modelName || '').trim().toLowerCase();
    if (!normalized) return false;
    return !NON_CHAT_MODEL_PATTERN.test(normalized);
}

function extractCustomApiModels(payload = {}) {
    const seen = new Set();

    return collectModelItems(payload)
        .map(item => {
            const name = resolveModelName(item);
            if (!name) return null;

            const capabilities = item && typeof item === 'object'
                ? (item.capabilities || (Array.isArray(item.modalities) ? { modalities: item.modalities } : {}))
                : {};

            return {
                id: name,
                name,
                label: resolveModelLabel(item, name),
                vendor: item && typeof item === 'object' ? String(item.owned_by || item.vendor || '') : '',
                capabilities,
            };
        })
        .filter(Boolean)
        .filter(model => {
            const key = `${model.name}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .filter(model => isLikelyChatCapableCustomModel(model.name))
        .sort((a, b) => a.label.localeCompare(b.label));
}

module.exports = {
    extractCustomApiModels,
    isLikelyChatCapableCustomModel,
    normalizeCustomApiBaseUrl,
    normalizeCustomChatCompletionsUrl,
};

const axios = require('axios');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8, 0xFF]);
const GIF87A_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89A_SIGNATURE = Buffer.from('GIF89a', 'ascii');
const BMP_SIGNATURE = Buffer.from([0x42, 0x4D]);
const RETRYABLE_IMAGE_STATUSES = new Set([202, 404, 409, 423, 425, 429, 500, 502, 503, 504]);
const HIGH_RES_DRAW_MODEL_PATTERN = /(gpt-image|dall-e|glm-image|glmimage|cogview|glm-cogview)/i;

function getHeaderValue(headers, name) {
    if (!headers || !name) return '';

    if (typeof headers.get === 'function') {
        return String(headers.get(name) || '');
    }

    const target = String(name || '').toLowerCase();
    const entry = Object.entries(headers).find(([key]) => String(key || '').toLowerCase() === target);
    return entry ? String(entry[1] || '') : '';
}

function normalizeCustomDrawingBaseUrl(baseUrl = '') {
    let normalized = String(baseUrl || '').trim();
    if (!normalized) return '';

    normalized = normalized.replace(/\/+$/, '');
    normalized = normalized.replace(/\/images\/generations$/i, '');

    if (!/\/v\d+$/i.test(normalized)) {
        normalized = `${normalized}/v1`;
    }

    return normalized.replace(/\/+$/, '');
}

function prefersHighResDrawModel(modelId = '') {
    return HIGH_RES_DRAW_MODEL_PATTERN.test(String(modelId || '').trim().toLowerCase());
}

function hasExplicitSizeMention(text = '', width = 0, height = 0) {
    const source = String(text || '').toLowerCase();
    if (!source.trim() || !width || !height) return false;

    const sizePatterns = [
        `${width}x${height}`,
        `${width} x ${height}`,
        `${width}×${height}`,
        `${width} * ${height}`,
        `${width}*${height}`,
        `${width} by ${height}`,
        `${width}px`,
        `${width} px`,
        `${height}px`,
        `${height} px`,
        `size ${width}`,
        `size=${width}`,
        `尺寸${width}`,
        `尺寸 ${width}`,
        `分辨率${width}`,
        `分辨率 ${width}`,
        `宽${width}`,
        `高${height}`,
    ];

    return sizePatterns.some(pattern => source.includes(pattern));
}

function resolveDrawDimensions(options = {}) {
    const provider = String(options.provider || '').trim().toLowerCase();
    const modelId = String(options.modelId || '').trim();
    const requestedWidth = Number(options.requestedWidth);
    const requestedHeight = Number(options.requestedHeight);
    const fallbackWidth = Math.max(256, Number(options.fallbackWidth) || 512);
    const fallbackHeight = Math.max(256, Number(options.fallbackHeight) || 512);
    const requestContext = String(options.requestContext || '').trim();

    const hasRequestedSize = Number.isFinite(requestedWidth) && Number.isFinite(requestedHeight);
    let width = hasRequestedSize ? Math.max(256, requestedWidth) : fallbackWidth;
    let height = hasRequestedSize ? Math.max(256, requestedHeight) : fallbackHeight;
    let upgradedToHighResDefault = false;

    if (provider === 'custom' && prefersHighResDrawModel(modelId)) {
        const explicitSizeMention = hasExplicitSizeMention(requestContext, width, height);
        if (!hasRequestedSize || ((width === 512 && height === 512) && !explicitSizeMention)) {
            width = 1024;
            height = 1024;
            upgradedToHighResDefault = true;
        }
    }

    return {
        width,
        height,
        upgradedToHighResDefault,
    };
}

function detectImageMimeFromBuffer(buffer = Buffer.alloc(0)) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';

    if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return 'image/png';
    }

    if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
        return 'image/jpeg';
    }

    if (buffer.subarray(0, 6).equals(GIF87A_SIGNATURE) || buffer.subarray(0, 6).equals(GIF89A_SIGNATURE)) {
        return 'image/gif';
    }

    if (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'image/webp';
    }

    if (buffer.subarray(0, 2).equals(BMP_SIGNATURE)) {
        return 'image/bmp';
    }

    const headText = buffer.subarray(0, 512).toString('utf8').trimStart();
    if (headText.startsWith('<svg') || (headText.startsWith('<?xml') && headText.includes('<svg'))) {
        return 'image/svg+xml';
    }

    return '';
}

function sanitizeDeclaredImageMime(mime = '') {
    const normalized = String(mime || '').trim().toLowerCase();
    if (!normalized) return '';
    return /^image\/[a-z0-9.+-]+$/i.test(normalized) ? normalized : '';
}

function buildImageDataUri(buffer = Buffer.alloc(0), declaredMime = '') {
    if (!Buffer.isBuffer(buffer) || buffer.length < 64) return '';

    const mime = detectImageMimeFromBuffer(buffer) || sanitizeDeclaredImageMime(declaredMime);
    if (!mime) return '';

    return `data:${mime};base64,${buffer.toString('base64')}`;
}

function extractImageSource(value = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    const markdownMatch = trimmed.match(/^!\[[^\]]*\]\((.+)\)$/s);
    if (markdownMatch?.[1]) {
        return markdownMatch[1].trim();
    }

    if (trimmed.startsWith('data:image/')) return trimmed;
    if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && !trimmed.includes('\n') && !trimmed.includes(' ')) {
        return trimmed;
    }

    return '';
}

function parseImageDataUri(value = '') {
    const raw = String(value || '').trim();
    const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;

    const mime = match[1].toLowerCase();
    const payload = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(payload, 'base64');

    return {
        mime,
        buffer,
    };
}

function imageExtensionForMime(mime = '') {
    const normalized = String(mime || '').trim().toLowerCase();
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/gif') return 'gif';
    if (normalized === 'image/bmp') return 'bmp';
    if (normalized === 'image/svg+xml') return 'svg';
    return 'png';
}

function isValidImageDataUri(value = '') {
    const raw = String(value || '').trim();
    const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return false;

    try {
        const mime = match[1].toLowerCase();
        const payload = match[2].replace(/\s+/g, '');
        const buffer = Buffer.from(payload, 'base64');
        if (buffer.length < 64) return false;

        if (mime === 'image/png') {
            return buffer.subarray(0, 8).equals(PNG_SIGNATURE);
        }
        if (mime === 'image/jpeg' || mime === 'image/jpg') {
            return buffer.subarray(0, 3).equals(JPEG_SIGNATURE);
        }
        if (mime === 'image/webp') {
            return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        }
        if (mime === 'image/gif') {
            return buffer.subarray(0, 6).equals(GIF87A_SIGNATURE) || buffer.subarray(0, 6).equals(GIF89A_SIGNATURE);
        }
        if (mime === 'image/bmp') {
            return buffer.subarray(0, 2).equals(BMP_SIGNATURE);
        }
        if (mime === 'image/svg+xml') {
            return buffer.subarray(0, 512).toString('utf8').includes('<svg');
        }

        return true;
    } catch {
        return false;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadImageUrlAsDataUri(imageUrl, options = {}) {
    const targetUrl = String(imageUrl || '').trim();
    if (!targetUrl) {
        throw new Error('Image URL is empty.');
    }
    if (targetUrl.startsWith('data:image/')) {
        if (!isValidImageDataUri(targetUrl)) {
            throw new Error('Image data URI is invalid.');
        }
        return targetUrl;
    }

    const httpClient = options.httpClient || axios;
    const attempts = Math.max(1, Number(options.attempts) || 4);
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 1200);
    const timeout = Math.max(1000, Number(options.timeout) || 30000);
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const response = await httpClient.get(targetUrl, {
                responseType: 'arraybuffer',
                timeout,
                validateStatus: () => true,
                headers: {
                    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                },
            });

            if (response.status < 200 || response.status >= 300) {
                const error = new Error(`Image fetch failed with status ${response.status}.`);
                error.status = response.status;
                throw error;
            }

            const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || []);
            const declaredMime = getHeaderValue(response.headers, 'content-type').split(';')[0].trim();
            const dataUri = buildImageDataUri(buffer, declaredMime);

            if (dataUri && isValidImageDataUri(dataUri)) {
                return dataUri;
            }

            throw new Error(
                `Fetched image is invalid or incomplete (${buffer.length} bytes${declaredMime ? `, declared ${declaredMime}` : ''}).`
            );
        } catch (error) {
            lastError = error;
            const status = Number(error?.status) || Number(error?.response?.status) || 0;
            const shouldRetry = attempt < attempts - 1 && (RETRYABLE_IMAGE_STATUSES.has(status) || status === 0);
            if (!shouldRetry) {
                break;
            }
            await sleep(retryDelayMs * (attempt + 1));
        }
    }

    throw lastError || new Error('Failed to download image.');
}

module.exports = {
    buildImageDataUri,
    detectImageMimeFromBuffer,
    downloadImageUrlAsDataUri,
    extractImageSource,
    imageExtensionForMime,
    isValidImageDataUri,
    normalizeCustomDrawingBaseUrl,
    parseImageDataUri,
    prefersHighResDrawModel,
    resolveDrawDimensions,
};

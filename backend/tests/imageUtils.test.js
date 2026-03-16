const test = require('node:test');
const assert = require('node:assert/strict');

const {
    downloadImageUrlAsDataUri,
    extractImageSource,
    imageExtensionForMime,
    isValidImageDataUri,
    normalizeCustomDrawingBaseUrl,
    parseImageDataUri,
    resolveDrawDimensions,
} = require('../services/imageUtils');

function createFakeJpegBuffer() {
    const buffer = Buffer.alloc(96, 0);
    buffer[0] = 0xFF;
    buffer[1] = 0xD8;
    buffer[2] = 0xFF;
    buffer[3] = 0xE0;
    buffer.write('JFIF', 6, 'ascii');
    return buffer;
}

test('normalizeCustomDrawingBaseUrl accepts root, /v1, and endpoint URLs', () => {
    assert.equal(normalizeCustomDrawingBaseUrl('https://api.example.com'), 'https://api.example.com/v1');
    assert.equal(normalizeCustomDrawingBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
    assert.equal(
        normalizeCustomDrawingBaseUrl('https://api.example.com/v1/images/generations'),
        'https://api.example.com/v1'
    );
});

test('downloadImageUrlAsDataUri prefers the actual image bytes over a wrong content-type header', async () => {
    const jpegBuffer = createFakeJpegBuffer();
    const httpClient = {
        async get() {
            return {
                status: 200,
                headers: {
                    'content-type': 'image/png',
                },
                data: jpegBuffer,
            };
        },
    };

    const dataUri = await downloadImageUrlAsDataUri('https://example.com/generated-image', {
        attempts: 1,
        httpClient,
    });

    assert.match(dataUri, /^data:image\/jpeg;base64,/);
    assert.equal(isValidImageDataUri(dataUri), true);
});

test('downloadImageUrlAsDataUri retries when the first fetch is not ready yet', async () => {
    const jpegBuffer = createFakeJpegBuffer();
    let calls = 0;
    const httpClient = {
        async get() {
            calls += 1;
            if (calls === 1) {
                return {
                    status: 404,
                    headers: {},
                    data: Buffer.alloc(0),
                };
            }

            return {
                status: 200,
                headers: {
                    'content-type': 'image/png',
                },
                data: jpegBuffer,
            };
        },
    };

    const dataUri = await downloadImageUrlAsDataUri('https://example.com/generated-image', {
        attempts: 2,
        retryDelayMs: 1,
        httpClient,
    });

    assert.equal(calls, 2);
    assert.match(dataUri, /^data:image\/jpeg;base64,/);
});

test('extractImageSource pulls the raw URL out of markdown image syntax', () => {
    assert.equal(
        extractImageSource('![Image](data:image/png;base64,abc123)'),
        'data:image/png;base64,abc123'
    );
    assert.equal(
        extractImageSource('https://example.com/test.png'),
        'https://example.com/test.png'
    );
});

test('parseImageDataUri decodes image buffers and maps MIME types to file extensions', () => {
    const dataUri = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(80)]).toString('base64')}`;
    const parsed = parseImageDataUri(dataUri);

    assert.equal(parsed?.mime, 'image/png');
    assert.equal(Buffer.isBuffer(parsed?.buffer), true);
    assert.equal(imageExtensionForMime(parsed?.mime), 'png');
});

test('resolveDrawDimensions upgrades GLM CogView default 512 sizing to 1024 when the user did not ask for 512', () => {
    const size = resolveDrawDimensions({
        provider: 'custom',
        modelId: 'GLM-CogView3-Flash',
        requestedWidth: 512,
        requestedHeight: 512,
        requestContext: '画一个白裙小女孩，动漫风格',
    });

    assert.deepEqual(size, {
        width: 1024,
        height: 1024,
        upgradedToHighResDefault: true,
    });
});

test('resolveDrawDimensions keeps 512 when the user explicitly requested 512x512', () => {
    const size = resolveDrawDimensions({
        provider: 'custom',
        modelId: 'GLM-CogView3-Flash',
        requestedWidth: 512,
        requestedHeight: 512,
        requestContext: '请生成一张 512x512 的头像图',
    });

    assert.deepEqual(size, {
        width: 512,
        height: 512,
        upgradedToHighResDefault: false,
    });
});

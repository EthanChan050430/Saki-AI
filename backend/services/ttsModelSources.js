const fileName = 'sherpa-onnx-wasm-main-tts.data';
const size = 138068830;
const sha256 = '2fc20c60263d89c146fa3a71336d9c6d9bd62d57caa44f10e1f1a764e4149392';

function secureUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        url.hash = '';
        return url;
    } catch {
        return null;
    }
}

function oneDriveDownloadUrl(value) {
    const url = secureUrl(value);
    if (!url) return '';
    const host = url.hostname;
    if (host !== '1drv.ms' && host !== 'onedrive.live.com' && !host.endsWith('.sharepoint.com')) return '';
    url.searchParams.set('download', '1');
    return url.href;
}

function getTtsModelSources(env = process.env) {
    return {
        github: 'https://github.com/EthanChan050430/Saki-AI/releases/download/tts-model-v1/' + fileName,
        google: 'https://drive.usercontent.google.com/download?id=1rPs3MVBRnxmWeF0QqQ7WIDBLK65KYh3x&export=download&confirm=t',
        onedrive: oneDriveDownloadUrl(env.SAKI_TTS_ONEDRIVE_URL),
        pan123: (secureUrl(env.SAKI_TTS_123PAN_DIRECT_URL) || secureUrl(env.SAKI_TTS_123PAN_SHARE_URL))?.href || '',
    };
}

function getTtsModelDownloadUrl(source, env = process.env) {
    if (source === 'pan123') return secureUrl(env.SAKI_TTS_123PAN_DIRECT_URL)?.href || '';
    return getTtsModelSources(env)[source] || '';
}

async function fetchOneDrive(url, signal) {
    let current = new URL(url);
    let cookie = '';
    for (let hop = 0; hop < 8; hop += 1) {
        const response = await fetch(current, {
            signal,
            redirect: 'manual',
            headers: cookie ? { Cookie: cookie } : undefined,
        });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) return response;
        await response.body?.cancel();
        const next = new URL(location, current);
        if (next.protocol !== 'https:' || next.username || next.password) {
            throw new Error('OneDrive returned an invalid download redirect.');
        }
        // SharePoint supplies this cookie to anonymous visitors before serving the file.
        const guestCookie = response.headers.getSetCookie().find(value => value.startsWith('FedAuth='));
        cookie = next.origin === current.origin ? guestCookie?.split(';', 1)[0] || cookie : '';
        current = next;
    }
    throw new Error('Too many OneDrive download redirects.');
}

function getAutomaticTtsModelSources(env = process.env) {
    const { google, onedrive } = getTtsModelSources(env);
    const pan123 = getTtsModelDownloadUrl('pan123', env);
    return {
        ...(pan123 && { pan123: [pan123, './model-download/pan123'] }),
        ...(onedrive && { onedrive: ['./model-download/onedrive'] }),
        github: ['./model-download/github'],
        google: [google],
    };
}

function fetchTtsModelResponse(source, url, signal) {
    return source === 'onedrive' ? fetchOneDrive(url, signal) : fetch(url, { signal });
}

module.exports = { fileName, size, sha256, getTtsModelSources, getAutomaticTtsModelSources, getTtsModelDownloadUrl, fetchTtsModelResponse };

const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of ['.env', 'backend/.env']) {
    try { process.loadEnvFile(path.join(root, file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const port = process.env.PORT || process.env.SAKI_PORT || 5480;
const expectedPid = Number(process.argv[2]);
async function check(protocol) {
    return new Promise(resolve => {
        const request = require('node:' + protocol).get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500, rejectUnauthorized: false }, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try { const data = JSON.parse(body); resolve(response.statusCode === 200 && data.status === 'ok' && (!expectedPid || data.pid === expectedPid)); } catch { resolve(false); }
            });
        });
        request.on('timeout', () => request.destroy());
        request.on('error', () => resolve(false));
    });
}
(async () => { if (!(await check('http')) && !(await check('https'))) process.exitCode = 1; })();

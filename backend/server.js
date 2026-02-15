const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { parseFile } = require('./services/parser');
const { searchWeb } = require('./services/search');
const { crawlUrl } = require('./services/crawler');
const mcpManager = require('./services/mcp');
const taskScheduler = require('./services/taskScheduler');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const DATA_DIR = path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const FILES_DIR = path.join(DATA_DIR, 'files');
const MEMORIES_DIR = path.join(DATA_DIR, 'memories');
const TRASH_DIR = path.join(DATA_DIR, 'Trash');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MCP_CONFIG_FILE = path.join(DATA_DIR, 'mcp_config.json');
const GLOBAL_CONFIG_FILE = path.join(DATA_DIR, 'global_config.json');

// Serve uploads directory as static
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper to determine if a file is a binary/office format requiring special parsing
function isBinaryOfficeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = ['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'];
    return binaryExts.includes(ext);
}

function isImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExts.includes(ext);
}

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(SESSIONS_DIR);
fs.ensureDirSync(REPORTS_DIR);
fs.ensureDirSync(FILES_DIR);
fs.ensureDirSync(MEMORIES_DIR);
fs.ensureDirSync(TRASH_DIR);

const upload = multer({ dest: UPLOADS_DIR });

// --- Trash Utils ---
async function moveToTrash(filePath) {
    if (!(await fs.exists(filePath))) return false;
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return false;

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const trashFileName = `${fileName}.${timestamp}`;
    const trashPath = path.join(TRASH_DIR, trashFileName);

    // Store metadata about original path
    const metaPath = path.join(TRASH_DIR, `${trashFileName}.json`);
    await fs.writeJson(metaPath, {
        originalPath: filePath,
        fileName: fileName,
        deletedAt: new Date().toISOString()
    });

    await fs.move(filePath, trashPath);
    return trashFileName;
}

// --- History Utils ---
async function getHistory() {
    try {
        if (await fs.exists(HISTORY_FILE)) {
            const content = await fs.readFile(HISTORY_FILE, 'utf8');
            if (!content || content.trim() === '') return [];
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('Error reading history file, resetting to empty array:', e);
        // If it's corrupted, we might want to back it up or just reset it
        await fs.writeJson(HISTORY_FILE, [], { spaces: 2 });
    }
    return [];
}

async function saveHistory(history) {
    await fs.writeJson(HISTORY_FILE, history, { spaces: 2 });
}

// --- Routes ---

app.get('/api/hosted-tasks', async (req, res) => {
    try {
        const tasks = await taskScheduler.listTasks();
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hosted-tasks', async (req, res) => {
    try {
        const task = await taskScheduler.addTask(req.body);
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hosted-tasks/:id/run', async (req, res) => {
    try {
        await taskScheduler.triggerTaskNow(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id/history', async (req, res) => {
    try {
        await taskScheduler.clearTaskHistory(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id/history/:index', async (req, res) => {
    try {
        await taskScheduler.deleteResult(req.params.id, parseInt(req.params.index));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id', async (req, res) => {
    try {
        await taskScheduler.deleteTask(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const folder = req.query.folder || '';
        // Prevent directory traversal
        if (folder.includes('..')) {
             return res.status(400).json({ error: 'Invalid path' });
        }
        
        const targetDir = path.join(FILES_DIR, folder);
        
        // Ensure the directory exists and is within FILES_DIR
        if (!targetDir.startsWith(FILES_DIR)) {
             return res.status(403).json({ error: 'Access denied' });
        }

        if (!await fs.exists(targetDir)) {
             return res.status(404).json({ error: 'Directory not found' });
        }

        const files = await fs.readdir(targetDir, { withFileTypes: true });
        const list = await Promise.all(files.map(async f => {
            const filePath = path.join(targetDir, f.name);
            const stats = await fs.stat(filePath);
            return {
                name: f.name,
                path: path.posix.join(folder, f.name), // Relative path
                isDirectory: f.isDirectory(),
                size: f.isDirectory() ? '-' : (stats.size / 1024).toFixed(2) + ' KB',
                time: stats.mtime.toLocaleString()
            };
        }));
        
        // Sort: directories first, then files
        list.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/preview', async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    try {
        if (name.includes('..')) return res.status(400).json({ error: 'Invalid path' });
        
        const filePath = path.join(FILES_DIR, name);
        if (!filePath.startsWith(FILES_DIR)) return res.status(403).json({ error: 'Access denied' });

        const isImage = isImageFile(filePath);
        if (isImage) {
            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            res.json({ isImage: true, content: `data:${mime};base64,${data.toString('base64')}` });
        } else {
            const content = await fs.readFile(filePath, 'utf8');
            res.json({ isImage: false, content });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Backward compatibility (optional, or remove old route)
app.get('/api/files/preview/:name', async (req, res) => {
    // For backward compatibility only
    try {
        const name = req.params.name;
        if (name.includes('..')) return res.status(400).json({ error: 'Invalid path' });
        const filePath = path.join(FILES_DIR, name);
        if (!filePath.startsWith(FILES_DIR)) return res.status(403).json({ error: 'Access denied' });

        const isImage = isImageFile(filePath);
        if (isImage) {
            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            res.json({ isImage: true, content: `data:${mime};base64,${data.toString('base64')}` });
        } else {
            const content = await fs.readFile(filePath, 'utf8');
            res.json({ isImage: false, content });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// --- Memory Routes ---

app.get('/api/memories', async (req, res) => {
    try {
        const files = await fs.readdir(MEMORIES_DIR);
        const list = await Promise.all(files.filter(f => f.endsWith('.txt')).map(async f => {
            const stats = await fs.stat(path.join(MEMORIES_DIR, f));
            const content = await fs.readFile(path.join(MEMORIES_DIR, f), 'utf8');
            return {
                name: f.replace('.txt', ''),
                fileName: f,
                size: (stats.size / 1024).toFixed(2) + ' KB',
                time: stats.mtime.toLocaleString(),
                preview: content.slice(0, 100) + (content.length > 100 ? '...' : '')
            };
        }));
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/memories', async (req, res) => {
    try {
        const { name, content } = req.body;
        if (!name || !content) {
            return res.status(400).json({ error: 'Name and content are required' });
        }
        // Allow more characters but keep it safe for filesystem
        const fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
        await fs.writeFile(path.join(MEMORIES_DIR, fileName), content, 'utf8');
        res.json({ success: true, fileName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/memories/:fileName', async (req, res) => {
    try {
        const filePath = path.join(MEMORIES_DIR, req.params.fileName);
        if (await fs.exists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            res.json({ content });
        } else {
            res.status(404).json({ error: 'Memory not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/memories/:name', async (req, res) => {
    const name = req.params.name;
    try {
        const files = await fs.readdir(MEMORIES_DIR);
        const fileToDelete = files.find(f => f === name || f.replace('.txt', '') === name);
        if (fileToDelete) {
            await moveToTrash(path.join(MEMORIES_DIR, fileToDelete));
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Memory not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files/save', async (req, res) => {
    try {
        const { name, content } = req.body;
        // name should be relative path
        if (name.includes('..')) return res.status(400).json({ error: 'Invalid path' });

        const filePath = path.join(FILES_DIR, name);
        if (!filePath.startsWith(FILES_DIR)) return res.status(403).json({ error: 'Access denied' });

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/files', async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        if (name.includes('..')) return res.status(400).json({ error: 'Invalid path' });
       
        const filePath = path.join(FILES_DIR, name);
         if (!filePath.startsWith(FILES_DIR)) return res.status(403).json({ error: 'Access denied' });
         
        await moveToTrash(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Trash Routes ---

app.get('/api/trash', async (req, res) => {
    try {
        const items = await fs.readdir(TRASH_DIR);
        const list = [];
        for (const item of items) {
            if (item.endsWith('.json')) {
                const meta = await fs.readJson(path.join(TRASH_DIR, item));
                const trashFileName = item.replace('.json', '');
                if (await fs.exists(path.join(TRASH_DIR, trashFileName))) {
                    const stats = await fs.stat(path.join(TRASH_DIR, trashFileName));
                    list.push({
                        trashId: trashFileName,
                        name: meta.fileName,
                        originalPath: meta.originalPath,
                        deletedAt: meta.deletedAt,
                        size: (stats.size / 1024).toFixed(2) + ' KB'
                    });
                }
            }
        }
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/trash/restore', async (req, res) => {
    try {
        const { trashId } = req.body;
        const metaPath = path.join(TRASH_DIR, `${trashId}.json`);
        const filePath = path.join(TRASH_DIR, trashId);

        if (!(await fs.exists(metaPath)) || !(await fs.exists(filePath))) {
            return res.status(404).json({ error: 'File removed from trash.' });
        }

        const meta = await fs.readJson(metaPath);
        await fs.ensureDir(path.dirname(meta.originalPath));
        await fs.move(filePath, meta.originalPath, { overwrite: true });
        await fs.remove(metaPath);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/trash/:trashId', async (req, res) => {
    try {
        const { trashId } = req.params;
        await fs.remove(path.join(TRASH_DIR, trashId));
        await fs.remove(path.join(TRASH_DIR, `${trashId}.json`));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/download', (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).send('Name is required');
    if (name.includes('..')) return res.status(400).send('Invalid path');

    const filePath = path.join(FILES_DIR, name);
    if (!filePath.startsWith(FILES_DIR)) return res.status(403).send('Access denied');

    res.download(filePath);
});

// Deprecated: kept for backward compatibility if needed, but the new one takes precedence if path is unambiguous
app.get('/api/files/download/:name', (req, res) => {
     // If name is simple, this might match.
     // Better just replace it or ensure this doesn't conflict. 
     // /api/files/download without param but with query string won't match /:name unless name is undefined? No.
     // Express routing: /:name is mandatory param.
     
     // So I can keep this as is, but frontend calls /download?name=... which hits the new route (if defined before/after correctly).
     // Wait, app.get('/api/files/download', ...) without :name.
     // This matches /api/files/download exactly.
     // app.get('/api/files/download/:name') matches /api/files/download/something.
     // They don't conflict.
     
    const filePath = path.join(FILES_DIR, req.params.name);
    if (!filePath.startsWith(FILES_DIR)) return res.status(403).send('Access denied');
    res.download(filePath);
});


app.post('/api/files/rollback', async (req, res) => {
    try {
        const { filePath, before, content, isDeletion } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing filePath.' });
        }

        const rollbackContent = before !== undefined ? before : content;
        const shouldDelete = rollbackContent === null;

        if (isDeletion === true) {
            // Rollback for create/edit: restore old content or delete if it never existed.
            if (shouldDelete) {
                await fs.remove(filePath);
            } else {
                await fs.outputFile(filePath, rollbackContent, 'utf8');
            }
        } else {
            // Rollback for delete or unknown: restore old content when available.
            if (rollbackContent === undefined) {
                return res.status(400).json({ error: 'Missing rollback content.' });
            }
            await fs.outputFile(filePath, rollbackContent, 'utf8');
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/history', async (req, res) => {
    res.json(await getHistory());
});

app.post('/api/history', async (req, res) => {
    const { chatId, messages, title } = req.body;
    
    // Save full message list to individual session file
    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    await fs.writeJson(sessionFilePath, { messages }, { spaces: 2 });

    // Update index file
    let history = await getHistory();
    const index = history.findIndex(h => h.id === chatId);
    const sessionSummary = { 
        id: chatId, 
        title: title || messages[0]?.content?.slice(0, 30) || '新对话', 
        updatedAt: new Date(),
        messagesCount: messages.length
    };
    
    if (index >= 0) {
        history[index] = { ...history[index], ...sessionSummary };
    } else {
        history.unshift(sessionSummary);
    }
    await saveHistory(history);
    res.json({ success: true });
});

app.get('/api/history/:id', async (req, res) => {
    const sessionFilePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    if (await fs.exists(sessionFilePath)) {
        const sessionData = await fs.readJson(sessionFilePath);
        res.json(sessionData);
    } else {
        res.json({ messages: [] });
    }
});

app.delete('/api/history/:id', async (req, res) => {
    const sessionFilePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    if (await fs.exists(sessionFilePath)) {
        await fs.remove(sessionFilePath);
    }

    let history = await getHistory();
    history = history.filter(h => h.id !== req.params.id && h.id != req.params.id);
    await saveHistory(history);
    res.json({ success: true });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');
    
    // Fix encoding: Multer originalname is often Latin1, converted to UTF-8
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const targetPath = path.join(UPLOADS_DIR, originalname);
    
    try {
        await fs.move(file.path, targetPath, { overwrite: true });
        
        let content = "";
        const isImage = isImageFile(targetPath);
        
        if (isImage) {
            content = "[Image File]";
        } else {
            content = await parseFile(targetPath, file.mimetype);
        }
        
        console.log(`File uploaded: ${originalname}, isImage: ${isImage}, parsed content length: ${content ? content.length : 0}`);
        
        res.json({ 
            filename: originalname, 
            path: targetPath,
            content: content || "(Empty content)",
            isImage: isImage
        });
    } catch (err) {
        console.error('Upload processing failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mcp/config', async (req, res) => {
    const config = req.body;
    await fs.writeJson(MCP_CONFIG_FILE, config, { spaces: 2 });
    res.send('Config saved');
});

app.get('/api/config', async (req, res) => {
    try {
        if (await fs.exists(GLOBAL_CONFIG_FILE)) {
            const config = await fs.readJson(GLOBAL_CONFIG_FILE).catch(() => ({}));
            res.json(config);
        } else {
            res.json({});
        }
    } catch (e) {
        res.json({});
    }
});

app.post('/api/config', async (req, res) => {
    const config = req.body;
    await fs.writeJson(GLOBAL_CONFIG_FILE, config, { spaces: 2 });
    res.json({ success: true });
});

app.get('/api/mcp/config', async (req, res) => {
    if (await fs.exists(MCP_CONFIG_FILE)) {
        return res.json(await fs.readJson(MCP_CONFIG_FILE));
    }
    res.json({});
});

app.get('/api/mcp/status', (req, res) => {
    res.json(mcpManager.getStatus());
});

// --- Stable Diffusion Status & Models ---
app.get('/api/sd/status', async (req, res) => {
    try {
        let sdUrl = (req.query.url || 'http://127.0.0.1:7860').trim().replace(/\/$/, '');
        // Normalize: if it points to an endpoint, strip it
        if (sdUrl.includes('/sdapi/v1')) {
            sdUrl = sdUrl.split('/sdapi/v1')[0];
        }
        
        const [modelsRes, lorasRes] = await Promise.all([
            axios.get(`${sdUrl}/sdapi/v1/sd-models`, { timeout: 3000 }),
            axios.get(`${sdUrl}/sdapi/v1/loras`, { timeout: 3000 }).catch(() => ({ data: [] }))
        ]);

        res.json({
            connected: true,
            models: modelsRes.data.map(m => m.title),
            loras: lorasRes.data.map(l => l.name),
            error: null
        });
    } catch (e) {
        res.json({
            connected: false,
            models: [],
            loras: [],
            error: e.message
        });
    }
});

// --- GPT-SoVITS Models & Status ---
app.get('/api/sovits/status', async (req, res) => {
    try {
        const sovitsUrl = (req.query.url || 'http://127.0.0.1:9880').replace(/\/$/, '');
        // We can just check the tts endpoint or a simple GET if available
        // According to api_v2.py, there's no dedicated health check, but we can try reaching the port
        await axios.get(`${sovitsUrl}/control?command=none`, { timeout: 1000 }).catch(e => {
            // control?command=none might 400 or 404 but if we get a response, it's alive
            if (e.response) return e.response;
            throw e;
        });
        res.json({ connected: true });
    } catch (e) {
        res.json({ connected: false });
    }
});

app.get('/api/sovits/models', async (req, res) => {
    try {
        // Correct path: c:\Users\EthanChan\Desktop\agent\GPT-SoVITS-v2pro-20250604
        const sovitsRoot = path.join(__dirname, '..', 'GPT-SoVITS-v2pro-20250604');
        
        const scanDir = async (dirName, ext) => {
            const dirPath = path.join(sovitsRoot, dirName);
            if (!await fs.exists(dirPath)) return [];
            const files = await fs.readdir(dirPath);
            return files
                .filter(f => f.endsWith(ext))
                .map(f => `${dirName}/${f}`.replace(/\\/g, '/'));
        };

        const gptModels = await scanDir('GPT_weights', '.ckpt');
        const sovitsModels = await scanDir('SoVITS_weights', '.pth');

        res.json({
            gpt: gptModels,
            sovits: sovitsModels
        });
    } catch (e) {
        console.error('Failed to scan SoVITS models:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- GPT-SoVITS Proxy to solve CORS ---
app.post('/api/sovits/proxy/tts', async (req, res) => {
    try {
        const { ttsUrl, ...payload } = req.body;
        const targetUrl = (ttsUrl || 'http://127.0.0.1:9880').replace(/\/$/, '') + '/tts';
        
        const response = await axios.post(targetUrl, payload, {
            responseType: 'arraybuffer',
            timeout: 60000
        });

        res.set('Content-Type', 'audio/wav');
        res.send(response.data);
    } catch (e) {
        console.error('SoVITS Proxy Error:', e.response?.data || e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sovits/proxy/set_weights', async (req, res) => {
    try {
        const { url, type, weights_path } = req.query;
        const endpoint = type === 'gpt' ? '/set_gpt_weights' : '/set_sovits_weights';
        const targetUrl = `${url.replace(/\/$/, '')}${endpoint}?weights_path=${encodeURIComponent(weights_path)}`;
        
        const response = await axios.get(targetUrl);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/mcp/init', async (req, res) => {
    try {
        const { mcpServers } = req.body;
        if (!mcpServers) {
            return res.status(400).json({ error: 'mcpServers config required' });
        }
        await mcpManager.initializeServers(mcpServers);
        res.json({ status: 'initializing', details: mcpManager.getStatus() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/models', async (req, res) => {
    let { ollamaUrl } = req.query;
    try {
        if (!ollamaUrl || ollamaUrl === 'undefined' || ollamaUrl === 'null') {
            ollamaUrl = 'http://localhost:11434';
        }
        
        let baseUrl = ollamaUrl.trim();
        if (!baseUrl.startsWith('http')) {
            baseUrl = `http://${baseUrl}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const endpoint = `${baseUrl}/api/tags`;
        console.log(`[API] Fetching models from: ${endpoint}`);
        
        const response = await axios.get(endpoint, { timeout: 8000 });
        const models = response.data.models.map(m => m.name);
        res.json(models);
    } catch (error) {
        console.error(`[API] Error fetching models from ${ollamaUrl}:`, error.message);
        // If it's a connection error to a custom IP, don't just fallback silently, let the user know via empty list or error
        res.json([]); 
    }
});

// Terminal execution
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : undefined;
    const cmd = isWin ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}` : command;
    
    exec(cmd, { shell, encoding: 'utf8' }, (error, stdout, stderr) => {
        res.json({ stdout, stderr, error: error ? error.message : null });
    });
});

// --- GitHub Device Flow ---
// 注意：请在这里替换为您在 GitHub Developer Settings 中创建的 OAuth App 的真实 Client ID
// 并且请务必在 App 设置中勾选 "Enable Device Flow"
const GITHUB_CLIENT_ID = "Ov23lie5SdoXMSqjlHdS"; 

app.post('/api/github/login/device', async (req, res) => {
    try {
        console.log(`[GitHub] Requesting device code for Client ID: ${GITHUB_CLIENT_ID}`);
        const response = await axios.post('https://github.com/login/device/code', {
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo read:user'
        }, {
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.error === 'not_found' || (response.status === 404)) {
            throw new Error('GitHub 返回 404，请确认您的 Client ID 是否正确且已在 GitHub 设置中开启 "Device Flow" 支持。');
        }
        
        res.json(response.data);
    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error('GitHub Device Code Error:', errorData);
        res.status(500).json({ 
            error: 'Failed to get device code', 
            details: errorData,
            hint: '请检查 backend/server.js 中的 GITHUB_CLIENT_ID 是否有效，并确保该 OAuth App 已开启 Device Flow。'
        });
    }
});

app.post('/api/github/login/poll', async (req, res) => {
    const { device_code } = req.body;
    try {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        }, {
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json' 
            },
            timeout: 15000 // 增加超时设置，防止请求一直挂起
        });
        
        if (response.data.error) {
            console.log(`[GitHub Poll] status: ${response.data.error}`);
        } else if (response.data.access_token) {
            console.log(`[GitHub Poll] Success: Token acquired`);
        }
        
        res.json(response.data);
    } catch (error) {
        // 捕获网络层面的错误（如超时、连接中断）
        const errorCode = error.code || 'UNKNOWN_ERROR';
        console.error(`[GitHub Poll] Network Error (${errorCode}):`, error.message);
        
        // 返回一个 authorization_pending 状态，让前端继续轮询而不是直接报错停止
        res.json({ error: 'authorization_pending', message: 'Network unstable, retrying...' });
    }
});

app.get('/api/github/models', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.json([]);
    try {
        const response = await axios.get('https://models.inference.ai.azure.com/models', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // Map to just names, filtering for chat models if possible or just returning all
        const models = response.data.map(m => m.name);
        res.json(models);
    } catch (error) {
        console.error('Failed to fetch GitHub models:', error.message);
        // Fallback to a sensible list if API fails but token is valid
        res.json(['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini']);
    }
});


// --- Agent Logic ---
async function callLLM(provider, model, ollamaUrl, prompt, config, streamCallback) {
    let baseUrl = '';
    // Use provider specific API key if available
    let apiKey = config?.[`${provider}ApiKey`] || config?.apiKey || '';
    let headers = { 'Content-Type': 'application/json' };
    let payload = {};

    // 1. Determine Endpoint & Headers
    if (provider === 'ollama') {
        let ollamaBase = (ollamaUrl || 'http://localhost:11434').trim();
        if (!ollamaBase.startsWith('http')) ollamaBase = `http://${ollamaBase}`;
        ollamaBase = ollamaBase.replace(/\/$/, '');
        
        const response = await axios.post(`${ollamaBase}/api/generate`, {
            model: model,
            prompt: prompt,
            stream: true
        }, { responseType: 'stream', timeout: 120000 });

        let fullText = "";
        return new Promise((resolve, reject) => {
            response.data.on('data', chunk => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.response) {
                            fullText += json.response;
                            if (streamCallback) streamCallback(json.response);
                        }
                    } catch (e) {}
                }
            });
            response.data.on('end', () => resolve(fullText));
            response.data.on('error', (err) => reject(err));
        });
    }

    // Default system prompt
    const systemPrompt = config?.systemPrompt || "You are a helpful assistant.";

    switch (provider) {
        case 'copilot':
            baseUrl = 'https://models.inference.ai.azure.com/chat/completions';
            apiKey = config?.copilotToken;
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'openai':
            baseUrl = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'deepseek':
            baseUrl = 'https://api.deepseek.com/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'zhipu':
            baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'gemini':
            baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'minimax':
            baseUrl = 'https://api.minimax.chat/v1/text/chatcompletion_v2';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'anthropic':
            baseUrl = 'https://api.anthropic.com/v1/messages';
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            break;
        case 'moonshot':
            baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'tongyi':
            baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'doubao':
            baseUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'custom':
            baseUrl = config?.apiBaseUrl || '';
            if (baseUrl && !baseUrl.endsWith('/chat/completions')) {
                baseUrl = baseUrl.replace(/\/$/, '') + '/chat/completions';
            }
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    if (!baseUrl) throw new Error(`Base URL for ${provider} is not configured.`);

    // 2. Prepare Payload
    if (provider === 'anthropic') {
        payload = {
            model: model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            stream: true
        };
    } else {
        payload = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            stream: true
        };
    }

    // 3. Execute Streaming Call
    const response = await axios.post(baseUrl, payload, {
        headers: headers,
        responseType: 'stream',
        timeout: 120000
    });

    let fullText = "";
    return new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                const l = line.trim();
                if (!l) continue;
                
                if (provider === 'anthropic') {
                    if (l.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(l.slice(6));
                            if (json.type === 'content_block_delta' && json.delta?.text) {
                                const text = json.delta.text;
                                fullText += text;
                                if (streamCallback) streamCallback(text);
                            }
                        } catch (e) {}
                    }
                } else {
                    if (l.startsWith('data: ')) {
                        const dataStr = l.slice(6);
                        if (dataStr === '[DONE]') continue;
                        try {
                            const json = JSON.parse(dataStr);
                            const text = json.choices[0]?.delta?.content || "";
                            fullText += text;
                            if (streamCallback) streamCallback(text);
                        } catch (e) {}
                    }
                }
            }
        });
        response.data.on('end', () => resolve(fullText));
        response.data.on('error', (err) => reject(err));
    });
}

async function runDeepReadingLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config }) {
    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'deepReading', deepReading: data })}\n\n`);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
        console.log(`[Deep Reading] Client disconnected. Aborting loop for chatId: ${chatId}`);
    });

    try {
        if (aborted) return;
        // Step 1: Task Breakdown
        sendUpdate({ status: 'running', steps: [{ title: '正在规划研究路径...', status: 'running' }] });
        
        const breakdownPrompt = `你是一个专家级的研究助手。请将以下用户任务拆解为 3-5 个逻辑严密的执行子任务。
用户输入: ${message}
返回格式必须是 JSON 数组: [{"title": "任务标题", "description": "任务描述"}]
只返回 JSON 代码块。`;

        const breakdownResult = await callLLM(provider, model, ollamaUrl, breakdownPrompt, config);
        if (aborted) return;
        const jsonMatch = breakdownResult.match(/\[[\s\S]*\]/);
        let steps = [];
        if (jsonMatch) {
            steps = JSON.parse(jsonMatch[0]).map((s, i) => ({ ...s, id: i, status: i === 0 ? 'running' : 'not-started', content: '' }));
        } else {
            steps = [{ id: 0, title: '深度解析', description: '对任务进行全方位深度解析', status: 'running', content: '' }];
        }
        
        sendUpdate({ steps });

        // Step 2 & 3: Information Retrieval & Reasoning (Iterate through steps)
        for (let i = 0; i < steps.length; i++) {
            if (aborted) return;
            steps[i].status = 'running';
            sendUpdate({ steps });

            // 对于每个步骤，先进行联网检索
            const stepTitle = steps[i].title;
            let stepContent = "";
            let sources = [];

            if (searchEnabled) {
                if (aborted) return;
                const searchQuery = `针对“${stepTitle}”，关于“${message}”的深度研究。`;
                const searchResults = await searchWeb(searchQuery);
                sources = searchResults.slice(0, 5).map(r => ({ title: r.title, url: r.link }));
                
                const browsePromises = searchResults.slice(0, 2).map(r => crawlUrl(r.link).catch(() => ""));
                const browsedTexts = await Promise.all(browsePromises);
                const combinedContext = browsedTexts.join('\n\n').slice(0, 10000);

                const reasoningPrompt = `你正在执行研究任务的第 ${i+1} 步: ${stepTitle}。
任务整体目标: ${message}
已掌握的联网信息:
${combinedContext}

请基于以上信息进行深度推理与验证，构建逻辑链。要求：
1. 识别并整合关键证据。
2. 如果存在矛盾点请指出。
3. 必须标明数据来源（如 [1], [2]）。
4. 杜绝无依据的推测。
5. 使用专业、客观的语气。
6. 支持使用 mermaid 语法绘制逻辑图或流程图 (使用 \`\`\`mermaid 块)。

请直接输出研究内容。`;

                await callLLM(provider, model, ollamaUrl, reasoningPrompt, config, (token) => {
                    if (aborted) return;
                    stepContent += token;
                    steps[i].content = stepContent;
                    sendUpdate({ steps });
                });
            } else {
                if (aborted) return;
                const simplePrompt = `请完成研究步骤: ${stepTitle}。任务目标: ${message}。请直接输出详细的研究分析。`;
                await callLLM(provider, model, ollamaUrl, simplePrompt, config, (token) => {
                    if (aborted) return;
                    stepContent += token;
                    steps[i].content = stepContent;
                    sendUpdate({ steps });
                });
            }

            steps[i].status = 'completed';
            steps[i].sources = sources;
            sendUpdate({ steps });
        }

        if (aborted) return;
        // Step 4: Report Generation
        const reportStep = { title: '正在生成最终研究报告...', status: 'running', content: '', type: 'report' };
        sendUpdate({ status: 'running', steps: [...steps, reportStep] });

        const finalContent = steps.map(s => `## ${s.title}\n${s.content}`).join('\n\n');
        const reportPrompt = `请将以下研究成果整理成一份专业且直观的研究报告。
${finalContent}

要求：
1. **自动生成符合行业规范的报告框架**：包含标题、摘要、核心发现、详细分析、结论和建议。
2. **学术与商业并重**：学术类请包含引用，商业类请突出关键结论。
3. **充分利用可视化**：广泛使用 Mermaid 语法绘制各种类型的图表（如流程图、时序图、饼图、象限图、思维导图等）。
   - **重要**：Mermaid 流程图的节点文字必须加双引号，例如 A["步骤一"]。
   - 确保 Mermaid 代码块以 \`\`\`mermaid 开始，以 \`\`\` 结束。
   - 保持逻辑清晰，不要过度复杂导致渲染崩溃。
4. **输出格式**：请直接输出完整的 Markdown 格式内容。不再需要输出 HTML 代码块。
5. **语言风格**：保持专业、客观且富有洞察力。`;

        let fullAssistantResponse = "";
        await callLLM(provider, model, ollamaUrl, reportPrompt, config, (token) => {
            if (aborted) return;
            fullAssistantResponse += token;
            reportStep.content += token;
            // 实时更新，但保持 status 为 running
            sendUpdate({ steps: [...steps, reportStep] });
        });

        if (aborted) return;

        // 核心修复：先更新内存对象状态，确保后续所有引用都正确
        reportStep.status = 'completed';
        reportStep.title = '报告撰写完成';
        reportStep.content = fullAssistantResponse; // 确保完整
        const finalSteps = [...steps, reportStep];
        
        // 解析内容 - 现在只关注 Markdown，不再提取 HTML
        const reportMarkdown = fullAssistantResponse.trim();
        const reportHtml = ""; // 不再生成 HTML

        // 立即发送一次状态更新，告知前端已完成
        sendUpdate({ 
            status: 'completed', 
            reportHtml, 
            reportMarkdown, 
            steps: finalSteps 
        });

        // --- 保存报告到本地文件系统 ---
        const reportFolderName = `report_${chatId}_${Date.now()}`;
        const currentReportPath = path.join(REPORTS_DIR, reportFolderName);
        try {
            await fs.ensureDir(currentReportPath);
            await fs.writeFile(path.join(currentReportPath, 'report.md'), reportMarkdown, 'utf8');
        } catch (err) {
            console.error('[Deep Reading] Failed to save report files:', err);
        }

        // Final persistence
        if (aborted) return;
        const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
        const sessionData = await fs.readJson(sessionFilePath).catch(() => ({ messages: [] }));
        
        const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
        const assistantMsg = { 
            role: 'assistant', 
            id: assistantMsgId, 
            content: "为您生成的深度研究报告已就绪。",
            deepReadingData: { 
                steps: finalSteps, 
                reportHtml, 
                reportMarkdown, 
                status: 'completed',
                savedPath: currentReportPath
            }
        };

        if (existingMsgIdx !== -1) {
            sessionData.messages[existingMsgIdx] = assistantMsg;
        } else {
            sessionData.messages.push(assistantMsg);
        }
        
        await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        res.write('data: [DONE]\n\n');
    } catch (error) {
        console.error('Deep Reading Error:', error);
        sendUpdate({ status: 'error', error: error.message });
        res.write(`data: ${JSON.stringify({ text: `发生错误: ${error.message}` })}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

async function runPPTLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config }) {
    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'ppt', pptData: data })}\n\n`);
        }
        
        // Optional: Periodic persistence if chatId is provided
        if (chatId && assistantMsgId && (data.steps || data.status)) {
            persistPPTState(data);
        }
    };

    const persistPPTState = async (updateData) => {
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await fs.readJson(sessionFilePath).catch(() => ({ messages: [] }));
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
            
            if (existingMsgIdx !== -1) {
                const msg = sessionData.messages[existingMsgIdx];
                msg.pptData = { 
                    ...(msg.pptData || {}), 
                    ...updateData,
                    // Special merging for steps to preserve data
                    steps: updateData.steps || msg.pptData.steps || []
                };
                if (updateData.pptTitle) msg.pptData.pptTitle = updateData.pptTitle;
                if (updateData.status) msg.pptData.status = updateData.status;

                await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
            }
        } catch (err) {
            console.warn('[PPT] Partial persistence failed:', err.message);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
        console.log(`[PPT] Client disconnected. Aborting loop for chatId: ${chatId}`);
    });

    try {
        if (aborted) return;
        
        // Initial entry in history
        await persistPPTState({ 
            status: 'running', 
            steps: [{ title: '正在规划PPT大纲...', status: 'running' }],
            pptTitle: '正在规划中...'
        });

        // Step 1: Planning
        sendUpdate({ status: 'running', steps: [{ title: '正在规划PPT大纲...', status: 'running' }] });
        
        const planPrompt = `你是一个专业的PPT架构师。请根据用户描述的任务制作一个PPT大纲。
用户需求: ${message}
${context ? "上下文信息: " + context : ""}

要求：
1. 确定PPT的总标题。
2. 拆解为 5-10 张幻灯片。
3. 请确保第一页（Index 0）是富有感染力的【封面页】，包含主标题和副标题。
4. 每页幻灯片除了标题，还要给出一个详细的【视觉设计建议】。
5. 返回格式必须是 JSON: {"title": "总标题", "slides": [{"title": "幻灯片标题", "description": "内容描述", "designHint": "如：使用左右分割布局，左侧大字标题，右侧要点卡片"}]}
只返回 JSON 代码块。`;

        let planResult = "";
        let planRetryCount = 0;
        const maxPlanRetries = 2;
        
        while (planRetryCount <= maxPlanRetries) {
            try {
                planResult = await callLLM(provider, model, ollamaUrl, planPrompt, config);
                break;
            } catch (err) {
                planRetryCount++;
                if (planRetryCount > maxPlanRetries || aborted) throw err;
                console.warn(`[PPT] Planning failed (trial ${planRetryCount}), retrying...`, err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (aborted) return;
        const jsonMatch = planResult.match(/```(?:json)?[\s\S]*?```|\{[\s\S]*\}/i);
        let plan = { title: "演示文稿", slides: [] };
        if (jsonMatch) {
            let raw = jsonMatch[0]
                .replace(/```(?:json)?/i, '')
                .replace(/```/g, '')
                .trim();

            const sanitizePlanJson = (input) => input
                .replace(/[“”]/g, '"')
                .replace(/[，]/g, ',')
                .replace(/[：]/g, ':')
                .replace(/"(title|slides|description|designHint)"\s*(?=[\[{\"])/g, '"$1": ')
                .replace(/,\s*([}\]])/g, '$1');

            try {
                plan = JSON.parse(raw);
            } catch (e) {
                try {
                    plan = JSON.parse(sanitizePlanJson(raw));
                } catch (err) {
                    console.warn('[PPT] Failed to parse plan JSON, using fallback.', err.message);
                    plan = { title: "演示文稿", slides: [{ title: '介绍', description: '关于项目的基本介绍' }] };
                }
            }
        } else {
            plan.slides = [{ title: '介绍', description: '关于项目的基本介绍' }];
        }
        
        const steps = plan.slides.map((s, i) => ({ 
            id: i, 
            title: s.title, 
            description: s.description, 
            designHint: s.designHint || '',
            status: i === 0 ? 'running' : 'not-started', 
            content: '',
            thinking: '' 
        }));
        
        sendUpdate({ pptTitle: plan.title, steps });

        // Step 2: Generate each slide
        for (let i = 0; i < steps.length; i++) {
            if (aborted) return;
            steps[i].status = 'running';
            sendUpdate({ steps });

            const slidePrompt = `作为顶级PPT设计师，请为第 ${i+1} 张幻灯片“${steps[i].title}”生成极具视觉冲击力的内容。
整体主题: ${plan.title}
本页描述: ${steps[i].description}
视觉建议: ${steps[i].designHint}
是否为首页: ${i === 0 ? '是' : '否'}

设计原则：
1. **垂直重心平衡**：
   - 如果是首页(封面)，必须使用 \`justify-center items-center text-center\`，让标题和副标题处于画面正中央。
   - 如果是内容页，标题在上方，但内容区应使用 \`flex-1 flex flex-col justify-center\` 确保内容不会全部挤在顶部。
2. **视觉美化**：
   - **背景**：不要只用纯白。尝试使用 \`bg-slate-50\`，或者带渐变的背景如 \`bg-gradient-to-br from-indigo-50 via-white to-cyan-50\`。
   - **装饰**：在角落添加大的半透明 SVG 图标或几何图形。
   - **卡片化**：内容区域可以使用 \`bg-white/80 backdrop-blur-sm shadow-xl rounded-3xl p-8 border border-white\` 这种玻璃拟态效果。
3. **排版与内容量控制**：
   - **内容守则**：每页幻灯片内容文字**禁止超过 200 字**。如果内容很多，必须使用分栏布局（Grid 2或3）。
   - 标题：\`text-5xl font-black text-slate-900 mb-8 tracking-tighter\`。
   - 正文：\`text-xl text-slate-600 leading-snug\` (注意：对于 540px 高度，2xl 往往太大，优先用 xl)。
   - 强调：使用不同的粗细或实色（如 \`text-indigo-600\`）。**禁止使用 \`bg-clip-text\` 或 \`text-transparent\`**。
   - **列表限制**：无序列表最多允许 5 个项目。

输出格式要求：
1. 思考过程（Thinking）：说明本页的视觉布局逻辑以及如何精简内容。
2. HTML内容：包裹在 <div class="slide">...</div> 中。
   - 必须包含 \`style="width: 960px; height: 540px;"\`。
   - 内部必须包含一个内边距容器 \`p-16\` (Safe Zone) 且设置 \`overflow-hidden\`。
   - 多卡片布局时，必须给卡片容器设置具体的 \`max-h-[350px] overflow-hidden\` 属性。
   - 使用 Tailwind CSS。
   - 如果内容较多，请减小字号到 \`text-lg\` 或 \`text-base\`。

示例 (首页):
\`\`\`html
<div class="slide relative w-[960px] h-[540px] bg-slate-900 flex items-center justify-center overflow-hidden text-white">
  <div class="absolute inset-0 opacity-20">
    <svg ...>背景纹理</svg>
  </div>
  <div class="relative z-10 text-center px-20">
    <div class="w-20 h-1 bg-blue-500 mx-auto mb-8"></div>
    <h1 class="text-6xl font-black mb-6">标题</h1>
    <p class="text-2xl text-blue-200">副标题/描述</p>
  </div>
</div>
\`\`\``;

            let fullResponse = "";
            let retryCount = 0;
            const maxRetries = 2;

            while (retryCount <= maxRetries) {
                try {
                    await callLLM(provider, model, ollamaUrl, slidePrompt, config, (token) => {
                        if (aborted) return;
                        fullResponse += token;
                        
                        // Real-time update logic
                        const htmlMatch = fullResponse.match(/```html([\s\S]*?)```/i);
                        let thinkingText = '';

                        if (htmlMatch) {
                            const beforeHtml = fullResponse.slice(0, htmlMatch.index || 0);
                            thinkingText = beforeHtml.replace(/^[\s\S]*?(思考过程|思考|Thinking)\s*[:：]/i, '').trim();
                        } else {
                            const thinkingMatch = fullResponse.match(/(思考过程|思考|Thinking)\s*[:：]([\s\S]*?)$/i);
                            if (thinkingMatch) thinkingText = (thinkingMatch[2] || '').trim();
                        }

                        // Clean up thinking text from known markers that LLMs sometimes hallucinate even in extraction
                        thinkingText = thinkingText
                            .replace(/^(思考过程|思考|Thinking|HTML内容|HTML设计)[:：\s]*/i, '')
                            .replace(/(思考过程|思考|Thinking|HTML内容|HTML设计)[:：\s]*$/i, '')
                            .trim();

                        if (thinkingText) steps[i].thinking = thinkingText;
                        if (htmlMatch) steps[i].content = htmlMatch[1].trim();
                        
                        sendUpdate({ steps });
                    });
                    break; // Success, exit retry loop
                } catch (llmError) {
                    retryCount++;
                    if (retryCount > maxRetries || aborted) {
                        console.error(`[PPT] Slide ${i+1} failed after retries:`, llmError.message);
                        steps[i].status = 'error';
                        steps[i].thinking = `出错了: ${llmError.message}`;
                        sendUpdate({ steps });
                        break;
                    }
                    console.warn(`[PPT] Slide ${i+1} trial ${retryCount} failed, retrying...`, llmError.message);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (steps[i].status !== 'error') {
                steps[i].status = 'completed';
            }
            sendUpdate({ steps });
        }

        if (aborted) return;
        
        // Final Finalization
        const finalStep = { title: '正在封装最终演示文稿...', status: 'running', content: '' };
        sendUpdate({ steps: [...steps, finalStep] });

        // Combine all slides into a single HTML
        const allHtml = steps.map(s => s.content).join('\n');
        const finalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; padding: 40px; display: flex; flex-direction: column; align-items: center; }
        .slide { 
            background: white; 
            width: 960px; /* Fixed standard width */
            height: 540px; /* Fixed 16:9 height */
            margin: 0 auto 40px; 
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* Prevent content overflow */
            position: relative;
            page-break-after: always;
            flex-shrink: 0;
            box-sizing: border-box;
        }
        /* Ensure all internal elements respect borders */
        .slide * { box-sizing: border-box; }
        .slide p, .slide li { 
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
        }
        .slide .grid > div, .slide .flex > div {
          max-height: 380px; 
          overflow: hidden;
        }
        .slide [class*="text-transparent"] {
          color: #4f46e5 !important;
          background-clip: initial !important;
          -webkit-background-clip: initial !important;
          background-image: none !important;
        }
        
        @media print {
            body { padding: 0; background: white; block-size: auto; }
            .slide { box-shadow: none; border-radius: 0; margin: 0; width: 297mm; height: 167mm; }
        }
    </style>
</head>
<body>
    <div class="slides-container" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
        ${allHtml}
    </div>
</body>
</html>`;

        finalStep.status = 'completed';
        finalStep.title = 'PPT 制作完成';
        
        sendUpdate({ 
            status: 'completed', 
            finalHtml, 
            steps: [...steps, finalStep] 
        });

        // Save to sessions/history
        const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
        const sessionData = await fs.readJson(sessionFilePath).catch(() => ({ messages: [] }));
        
        const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
        const assistantMsg = { 
            role: 'assistant', 
            id: assistantMsgId, 
            content: "您的PPT已制作完成，可以预览或下载。",
            pptData: { 
                pptTitle: plan.title,
                steps: [...steps, finalStep], 
                finalHtml, 
                status: 'completed'
            }
        };

        if (existingMsgIdx !== -1) {
            sessionData.messages[existingMsgIdx] = assistantMsg;
        } else {
            sessionData.messages.push(assistantMsg);
        }
        
        await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        res.write('data: [DONE]\n\n');
    } catch (error) {
        if (aborted) {
            console.log(`[PPT] Loop terminated due to client disconnection.`);
            return;
        }
        console.error('PPT Generation Error:', error);
        
        // Mark current step as error if it exists
        if (typeof steps !== 'undefined' && Array.isArray(steps)) {
            const runningStep = steps.find(s => s.status === 'running');
            if (runningStep) runningStep.status = 'error';
        }

        const errData = { status: 'error', error: error.message, steps: (typeof steps !== 'undefined' ? steps : []) };
        sendUpdate(errData);
        res.write(`data: ${JSON.stringify(errData)}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

async function getSystemInfo() {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const userProfile = os.homedir();
    const picturesPath = path.join(userProfile, 'Pictures');
    const documentsPath = path.join(userProfile, 'Documents');
    const downloadsPath = path.join(userProfile, 'Downloads');

    const userInfo = {
        username: os.userInfo().username,
        desktopPath,
        userProfile,
        picturesPath,
        documentsPath,
        downloadsPath
    };

    const cpus = os.cpus();
    const cpuInfo = {
        model: cpus[0].model,
        cores: cpus.length,
        speed: cpus[0].speed
    };

    const memInfo = {
        total: (os.totalmem() / (1024 ** 3)).toFixed(2) + ' GB',
        free: (os.freemem() / (1024 ** 3)).toFixed(2) + ' GB'
    };

    const sysInfo = {
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
    };

    let gpuInfo = 'Unknown';
    if (process.platform === 'win32') {
        try {
            const { execSync } = require('child_process');
            try {
                // Try wmic (legacy)
                gpuInfo = execSync('wmic path win32_VideoController get name', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(line => line.trim() && !line.toLowerCase().includes('name')).map(l => l.trim()).join(', ');
            } catch (e) {
                // Fallback to powershell (modern)
                gpuInfo = execSync('powershell -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').map(l => l.trim()).filter(l => l).join(', ');
            }
        } catch (e) {
            // Silently fail and keep 'Unknown' if both methods fail
        }
    }

    return {
        userInfo,
        cpuInfo,
        memInfo,
        sysInfo,
        gpuInfo
    };
}

async function runAgentLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, chatId, assistantMsgId, uploadedFiles, config, useMemory }) {
    const sysDetails = await getSystemInfo();
    const desktopPath = sysDetails.userInfo.desktopPath;
    
    // Initialize MCP if enabled
    if (mcpEnabled && config?.mcpConfig?.mcpServers) {
        await mcpManager.initializeServers(config.mcpConfig.mcpServers);
    } else {
        await mcpManager.closeAll();
    }

    if (useSd) {
        context += "\n\nCRITICAL: The user has enabled 'Intelligent Drawing Mode'. You MUST generate an image for the user in this turn using the 'draw' tool based on their request. If the user didn't specify exactly what to draw, use your best judgment to draw something relevant to the conversation. If the user has uploaded an image, focus on using it as a reference for the drawing.";
    }

    if (useMemory) {
        context += "\n\nKNOWLEDGE BASE ENABLED: You have access to the user's long-term memory/knowledge base. Use 'listMemories' to see titles and previews, 'searchMemories' to find specific information, and 'readMemory' to read full details. This contains user preferences, personal details, professional requirements, etc. Access it when you need personal context.";
    }

    // Cancellation support: Stop the loop and sub-requests if client disconnects
    let aborted = false;
    const loopAbortController = new AbortController();
    res.on('close', () => {
        aborted = true;
        loopAbortController.abort();
        console.log(`[Agent] Client disconnected. Aborting loop and requests for chatId: ${chatId}`);
    });

    // Preparation: Load images as base64 for multi-modal models
    const imageBase64s = [];
    const seenPaths = new Set();
    
    const addImage = async (file) => {
        const isImg = file.isImage || (file.path && isImageFile(file.path));
        if (isImg && file.path && !seenPaths.has(file.path)) {
            try {
                if (await fs.exists(file.path)) {
                    const data = await fs.readFile(file.path);
                    const ext = path.extname(file.path).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : 
                                 ext === '.webp' ? 'image/webp' : 
                                 ext === '.gif' ? 'image/gif' : 'image/jpeg';
                    imageBase64s.push({ mime, b64: data.toString('base64') });
                    seenPaths.add(file.path);
                    console.log(`[Agent] Attached image: ${file.name || path.basename(file.path)} (${data.length} bytes, ${mime})`);
                }
            } catch (e) {
                console.error(`Failed to read image ${file.path}:`, e.message);
            }
        }
    };

    // Load from history (for multimodal continuity)
    for (const msg of history || []) {
        if (msg.attachedFiles && Array.isArray(msg.attachedFiles)) {
            for (const file of msg.attachedFiles) await addImage(file);
        }
    }

    // Load from current request (most recent images)
    if (uploadedFiles && uploadedFiles.length > 0) {
        for (const file of uploadedFiles) await addImage(file);
    }

    // Detect environment info
    const envInfo = {
        os: `${sysDetails.sysInfo.type} ${sysDetails.sysInfo.release} (${sysDetails.sysInfo.arch})`,
        shell: process.platform === 'win32' ? 'PowerShell (Default)' : (process.env.SHELL || 'bash'),
        cwd: process.cwd(),
        node: process.version,
        platform: process.platform,
        cpu: `${sysDetails.cpuInfo.model} (${sysDetails.cpuInfo.cores} Cores)`,
        gpu: sysDetails.gpuInfo,
        memory: `${sysDetails.memInfo.free} free / ${sysDetails.memInfo.total} total`,
        username: sysDetails.userInfo.username,
        paths: {
            desktop: sysDetails.userInfo.desktopPath,
            pictures: sysDetails.userInfo.picturesPath,
            documents: sysDetails.userInfo.documentsPath,
            downloads: sysDetails.userInfo.downloadsPath,
            filesDefault: FILES_DIR
        }
    };

    // Assistant message state for real-time persistence
    const currentParts = [];
    const fullHistory = [...(history || [])];
    const assistantMsg = { role: 'assistant', parts: currentParts, id: assistantMsgId || Date.now() };
    fullHistory.push(assistantMsg);

    const persist = async () => {
        if (!chatId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            await fs.writeJson(sessionFilePath, { messages: fullHistory }, { spaces: 2 });
        } catch (e) {
            console.error('Persistence failed:', e);
        }
    };

    // Format chat history for context
    const formattedHistory = (history || []).map(msg => {
        let text = msg.content || "";
        if (msg.role === 'assistant' && msg.parts) {
            text = msg.parts.map(p => {
                if (p.type === 'text') return p.content;
                // Truncate massive observations (like base64 images) for prompt length
                let obs = p.observation || "";
                if (obs.length > 500) {
                    obs = obs.substring(0, 500) + "... [DATA TRUNCATED]";
                }
                return `Tool: ${p.data?.type}(${(p.data?.args || []).map(a => `"${a}"`).join(', ')})${obs ? `\nObservation: ${obs}` : ""}`;
            }).join('\n');
        }
        return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
    }).join('\n');

    const persona = config?.systemPrompt || "你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切。严禁输出 \"Tool\" 或 \"Thought\" 等前缀标记。请在回复开头和结尾带上 [expression:文件名.png] 格式的表情。";

    const mcpTools = mcpEnabled ? mcpManager.getAllTools() : [];
    const mcpToolsText = mcpTools.length > 0 
        ? mcpTools.map(t => `- mcp_${t.serverName}_${t.name}(${Object.keys(t.inputSchema.properties || {}).join(', ')}): ${t.description}`).join('\n')
        : '';

    let currentPrompt = `## Role
${persona}

## Thinking Framework
Before calling tools, always follow this thinking process (output in "Thought:"):
1. **Analyze**: What is the core objective?
2. **Review**: Check previous observations. Did a tool fail? Why?
3. **Plan**: outline the multi-step strategy. 
4. **Optimize**: Can I call multiple tools in this turn to save time? (e.g., list a directory and read a file together).

## Handling Errors & Failures
- If a tool returns an **Error**, do not apologize excessively. 
- **Analyze the error message** (e.g., "File not found" might mean you are in the wrong directory or used the wrong path).
- **Pivot**: Try a different tool or command (e.g., use 'listDir' or 'terminal("ls")' to find the correct path).
- NEVER give up until you have exhausted all logical options.

## Environment Context
- OS: ${envInfo.os}
- Platform: ${envInfo.platform}
- CWD: ${envInfo.cwd}
- Shell: ${envInfo.shell}
- CPU: ${envInfo.cpu}
- GPU: ${envInfo.gpu}
- Memory: ${envInfo.memory}
- User: ${envInfo.username}
- Desktop: ${envInfo.paths.desktop}
- manage_hosted_tasks(action, jsonConfigOrId): Manage recurring/scheduled tasks. action: 'add'|'delete'|'list'. For 'add', second arg is JSON string: {"task": "prompt", "scheduleType": "daily|weekly|monthly|once", "time": "HH:mm"|"YYYY-MM-DD HH:mm|d HH:mm", "desc": "description"}. For 'delete', second arg is taskId.
- Pictures: ${envInfo.paths.pictures}
- Documents: ${envInfo.paths.documents}
- Downloads: ${envInfo.paths.downloads}
- **Default Files Dir**: ${FILES_DIR} (Save user-created files here if no path is specified)

## Tool Usage & Efficiency
- **Search & Browse Combo**: For complex queries, use \`search\` to find relevant URLs, then use \`browse\` to read the specific content of the most promising ones. This is much more accurate than relying on snippets alone.
- **Combined Calls**: You can call multiple tools at once. Example: \`Tool: listDir(".") Tool: readFile("package.json")\`.
- **Code Editing**: Use \`editFile\` for range-based updates. It is much faster than overwriting the whole file.
- **Placeholder Prohibition**: NEVER output placeholder text like \`[uuid]\`, \`{uuid: url}\`, or \`"arg1"\` in a tool call. If you don't have the actual data for an argument yet, WAIT for the previous tool's observation before calling the next one.
- **Strict Format**: Tool calls MUST be on a new line and start with \`Tool:\`. DO NOT mention tool calls in your conversational text to avoid mis-triggering.
- **Terminal**: Use PowerShell compatible commands. For searching, prefer \`Get-ChildItem -Recurse -Filter "*phrase*"\` or \`Select-String\`.
- **Vision**: If images are attached, they are already in your context. Describe them directly; don't try to "read" them as text.
- **Visual Aids**: Use \`diagram\` or embed Mermaid code blocks (\`\`\`mermaid) in your response/observations to explain workflows, system architectures, or data structures. Visualizations significantly improve user understanding of complex topics.
- **MCP Tools**: MCP tools are prefixed with \`mcp_serverName_\`. Always use the full tool name when calling.

## Available tools:
${searchEnabled ? '- search(query): Search the web. Use this for up-to-date info or documentation.' : ''}
- browse(url): Fetch and read the text content of a specific webpage. Use this AFTER searching to get detailed information.
${(config?.drawingModel || config?.drawingProvider === 'stable-diffusion') ? `- draw(prompt, width, height): Generate an image. width and height are optional (default 512). If images are uploaded, they will be used as reference.` : ''}
- terminal(command): Run a PowerShell command. CWD is the project root.
- readFile(path): Read text content with line numbers.
- writeFile(path, content): Create or overwrite a file.
- editFile(path, startLine, endLine, content): Replace lines (1-indexed, inclusive). To insert, set endLine < startLine.
- deleteFile(path): Delete a file.
- listDir(path): List contents of a folder.
- diagram(mermaidCode): Generate and render a Mermaid diagram. DO NOT wrap the mermaidCode in backticks or markdown code blocks when calling this tool. Example: Tool: diagram("graph TD\nA-->B")
- respond(text): Final answer to the user in their language.
${useMemory ? '- listMemories(): List all items in your long-term memory/knowledge base with short previews.\n- searchMemories(query): Search for a specific string across all items in the knowledge base (searches both filenames and content).\n- readMemory(filename): Read the full content of a specific memory item.\n- saveMemory(name, content): Save important information to the long-term knowledge base. If the name exists, it will append.' : ''}
${mcpToolsText}

## Language Requirement
- **Thought**: Use the user's language.
- **Tool**: MUST be in English: \`Tool: tool_name("arg1", ...)\`.
- **Response**: Use the user's language.

## Conversation History:
${formattedHistory}

## Current Task:
User message: ${message}
${context}`;

    let loopCount = 0;
    const maxLoops = 100;

    while (loopCount < maxLoops) {
        if (aborted) return;
        loopCount++;
        let assistantResponse = "";
        
        if (provider === 'ollama') {
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;

            while (retryCount < maxRetries && !success) {
                if (aborted) return;
                try {
                    let baseUrl = (ollamaUrl || 'http://localhost:11434').trim();
                    if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
                    baseUrl = baseUrl.replace(/\/$/, '');
                    
                    const endpoint = `${baseUrl}/api/chat`;
                    console.log(`[Agent] Calling Ollama (Attempt ${retryCount + 1}/${maxRetries}): ${endpoint} (Model: ${model})`);
                    
                    const response = await axios.post(endpoint, {
                        model: model || 'llama3',
                        messages: [
                            { 
                                role: 'user', 
                                content: currentPrompt,
                                images: imageBase64s.length > 0 ? imageBase64s.map(img => img.b64) : undefined
                            }
                        ],
                        stream: true,
                        options: { 
                            stop: ["Observation:"],
                            num_ctx: 32768,
                            num_predict: 8192,
                            repeat_penalty: 1.1
                        }
                    }, { 
                        responseType: 'stream', 
                        timeout: 300000,
                        signal: loopAbortController.signal 
                    }); 

                    let hasHitTool = false;
                    
                    for await (const chunk of response.data) {
                        if (aborted) break;
                        const lines = chunk.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const data = JSON.parse(line);
                                const content = data.message?.content || "";
                                if (content) {
                                    assistantResponse += content;
                                    
                                    // Streaming logic to UI
                                    if (!hasHitTool) {
                                        // Detect if we hit a tool call, including possible Chinese translations like "工具:"
                                        // "Tool:" is standard, "工具:" is sometimes output by multilingual models.
                                        if (assistantResponse.match(/(?:Tool|工具)[:：]/i)) {
                                            hasHitTool = true;
                                        } else {
                                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }

                    if (aborted) return;
                    // 自动续写逻辑（暂不适配流式，保留原意但需注意 assistantResponse 已填充）
                    // ... existing truncated logic if needed, but usually not with 8k limit
                    success = true;
                } catch (err) {
                    if (aborted) return;
                    retryCount++;
                    const isRetryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.response?.status >= 500;
                    
                    if (retryCount < maxRetries && isRetryable) {
                        console.warn(`[Agent] Ollama connection error (${err.code}). Retrying in 2s...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        console.error(`Ollama Error (${ollamaUrl}):`, err.message);
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ text: `Ollama 连接失败 (${ollamaUrl}): ${err.message}${retryCount >= maxRetries ? ' (已达到最大重试次数)' : ''}` })}\n\n`);
                            res.write('data: [DONE]\n\n');
                        }
                        return;
                    }
                }
            }
        } else if (provider === 'copilot' || provider === 'github') {
            if (aborted) return;
            try {
                const token = config?.copilotToken || "";
                if (!token) {
                    throw new Error("GitHub Auth Token is missing. Please login first.");
                }

                // GitHub Models API (Azure AI Inference based)
                console.log(`[Agent] Calling GitHub Models (Model: ${model || 'gpt-4o'})`);

                let userContent = currentPrompt;
                if (imageBase64s.length > 0) {
                    userContent = [
                        { type: 'text', text: currentPrompt },
                        ...imageBase64s.map(img => ({
                            type: 'image_url',
                            image_url: { url: `data:${img.mime};base64,${img.b64}` }
                        }))
                    ];
                }

                const response = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
                    model: model || 'gpt-4o',
                    messages: [
                        { role: 'system', content: currentPrompt },
                        { role: 'user', content: userContent }
                    ],
                    max_tokens: 16384,
                    stream: true,
                    stop: ["Observation:"]
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream',
                    timeout: 300000,
                    signal: loopAbortController.signal
                });

                let hasHitTool = false;

                for await (const chunk of response.data) {
                    if (aborted) break;
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const content = data.choices[0]?.delta?.content || "";
                                if (content) {
                                    assistantResponse += content;

                                    if (!hasHitTool) {
                                        // Detect if we hit a tool call, including possible Chinese translations like "工具:"
                                        // "Tool:" is standard, "工具:" is sometimes output by multilingual models.
                                        if (assistantResponse.match(/(?:Tool|工具)[:：]/i)) {
                                            hasHitTool = true;
                                        } else {
                                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (err) {
                console.error(`GitHub API Error:`, err.response?.data || err.message);
                res.write(`data: ${JSON.stringify({ text: `GitHub 模型调用失败: ${err.response?.data?.error?.message || err.message}` })}\n\n`);
                res.write('data: [DONE]\n\n');
                return;
            }
        } else {
            assistantResponse = "Thought: Provider not supported.\nTool: respond(\"Only Ollama and GitHub are supported for now.\")";
        }

        // Parse Thought for persistence (Don't stream again as it was streamed during LLM call)
        // Also support Chinese "思考:" as a fallback
        const thoughtMatch = assistantResponse.match(/(?:Thought|思考)[:：]\s*([\s\S]*?)(?=(?:Tool|工具)[:：]|$)/i);
        if (thoughtMatch) {
            const thoughtText = `<think>${thoughtMatch[1].trim()}</think>\n`;
            currentParts.push({ type: 'text', content: thoughtText });
            await persist();
        }

        // --- Multi-Tool execution (Robust Parsing) ---
        const toolMatches = [];
        let searchIndex = 0;
        
        // Loop to find all tool calls, supporting both "Tool:" and "工具:"
        // 改为只匹配行首的 Tool: 标识，避免误触对话中的描述文本
        while (true) {
            // 使用正则：必须是在字符串开头或者紧跟在换行符之后
            const regex = /(?:^|\n)(?:[`*]*)(?:Tool|工具)[:：]\s*/i;
            const match = assistantResponse.substring(searchIndex).match(regex);
            if (!match) break;

            const toolMatchText = match[0];
            const startOfTool = searchIndex + match.index + toolMatchText.length;
            const openParenIndex = assistantResponse.indexOf('(', startOfTool);
            
            if (openParenIndex === -1) {
                // False alarm or malformed, skip this header
                searchIndex = startOfTool;
                continue;
            }

            const toolName = assistantResponse.substring(startOfTool, openParenIndex).trim();
            
            // Find balanced closing parenthesis
            let balance = 0;
            let closingParenIndex = -1;
            let inStr = false;
            let strChar = "";
            let escaped = false;

            for (let i = openParenIndex; i < assistantResponse.length; i++) {
                const char = assistantResponse[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === '\\') {
                    escaped = true;
                    continue;
                }
                if ((char === '"' || char === "'") && !escaped) {
                    if (!inStr) {
                        inStr = true;
                        strChar = char;
                    } else if (char === strChar) {
                        inStr = false;
                    }
                }
                if (!inStr) {
                    if (char === '(') balance++;
                    if (char === ')') balance--;
                    if (balance === 0) {
                        closingParenIndex = i;
                        break;
                    }
                }
            }

            if (closingParenIndex !== -1) {
                const rawArgs = assistantResponse.substring(openParenIndex + 1, closingParenIndex);
                toolMatches.push({ name: toolName, rawArgs });
                searchIndex = closingParenIndex + 1;
            } else {
                searchIndex = startOfTool;
            }
        }

        if (aborted) return;

        if (toolMatches.length > 0) {
            for (const match of toolMatches) {
                if (aborted) return;
                const toolNameRaw = match.name;
                const toolName = toolNameRaw.toLowerCase().trim();
                const rawArgs = match.rawArgs.trim();

                let args = [];
                // Robust tool argument parser
                let current = "";
                let inQuotes = false;
                let quoteChar = "";
                let esc = false;

                for (let i = 0; i < rawArgs.length; i++) {
                    const char = rawArgs[i];
                    if (esc) {
                        if (char === 'n') current += '\n';
                        else if (char === 'r') current += '\r';
                        else if (char === 't') current += '\t';
                        else current += char;
                        esc = false;
                        continue;
                    }
                    if (char === '\\') {
                        const next = rawArgs[i + 1];
                        if (next === '"' || next === "'" || next === '\\' || next === 'n' || next === 'r' || next === 't') {
                            esc = true;
                            continue;
                        }
                    }
                    if ((char === '"' || char === "'")) {
                        if (!inQuotes) {
                            inQuotes = true;
                            quoteChar = char;
                        } else if (char === quoteChar) {
                            inQuotes = false;
                        } else {
                            current += char;
                        }
                    } else if (char === ',' && !inQuotes) {
                        args.push(current.trim());
                        current = "";
                    } else {
                        current += char;
                    }
                }
                if (current.trim() || rawArgs.endsWith(',')) {
                    args.push(current.trim());
                }

                if (toolName === 'respond') {
                    if (!aborted && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ text: args[0] })}\n\n`);
                        currentParts.push({ type: 'text', content: args[0] });
                        await persist();
                        res.write('data: [DONE]\n\n');
                    }
                    return;
                }

                // Stream Action to UI
                if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ action: { type: toolNameRaw, args: args } })}\n\n`);
                }
                const actionPart = { type: 'action', data: { type: toolNameRaw, args: args } };
                currentParts.push(actionPart);
                await persist();

                // Helper for robust path resolution
                const resolvePath = (p) => {
                    let cleanP = (p || "").toString().replace(/^["']|["']$/g, '').trim();
                    if (!cleanP || cleanP === '.' || cleanP === './') return FILES_DIR;

                    if (cleanP.match(/^[\\\/]*Desktop[\\\/]/i)) {
                        cleanP = cleanP.replace(/^[\\\/]*Desktop[\\\/]/i, '');
                        return path.join(desktopPath, cleanP);
                    }
                    if (path.isAbsolute(cleanP)) return cleanP;

                    // Support relative paths from FILES_DIR by default
                    // This allows the agent to use 'folder1/file.txt' effectively
                    const joinedPath = path.resolve(FILES_DIR, cleanP);
                    if (joinedPath.toLowerCase().startsWith(FILES_DIR.toLowerCase())) {
                        return joinedPath;
                    }

                    // Fallback to process.cwd() for other relative paths
                    return path.resolve(process.cwd(), cleanP);
                };


                let observation = "";
                let fileMetadata = null; 
                try {
                    if (toolName === 'search') {
                        const results = await searchWeb(args[0]);
                        observation = results.length > 0 ? results.map(r => `### [${r.title}](${r.url})\n${r.content}`).join('\n\n') : "No search results found.";
                    } else if (toolName === 'browse') {
                        const url = args[0];
                        observation = await crawlUrl(url);
                    } else if (toolName === 'draw') {
                        const prompt = args[0];
                        const width = parseInt(args[1]) || 512;
                        const height = parseInt(args[2]) || 512;
                        
                        // Use global config if the passed config doesn't have drawing settings
                        // (Sometimes passed config is partial)
                        const globalConfig = await fs.readJson(GLOBAL_CONFIG_FILE).catch(() => ({}));
                        const effectiveConfig = { ...globalConfig, ...config };
                        
                        const dModel = effectiveConfig?.drawingModel;
                        const dProvider = effectiveConfig?.drawingProvider;
                        
                        if (!dModel && dProvider !== 'stable-diffusion') {
                            observation = "Error: Drawing model not configured. Use 'respond' to tell the user.";
                        } else {
                            console.log(`[Agent] Calling Drawing Model: ${dModel} (${dProvider}), Size: ${width}x${height}`);
                            const hasImage = imageBase64s.length > 0;
                            const latestImage = hasImage ? imageBase64s[imageBase64s.length - 1] : null;

                            if (dProvider === 'ollama') {
                                let baseUrl = (effectiveConfig.ollamaUrl || 'http://localhost:11434').trim();
                                if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
                                const res = await axios.post(`${baseUrl}/api/chat`, {
                                    model: dModel,
                                    messages: [{ 
                                        role: 'user', 
                                        content: prompt,
                                        images: hasImage ? [latestImage.b64] : undefined
                                    }],
                                    stream: false
                                }, { timeout: 120000 });
                                observation = res.data.message?.content || "Drawing model returned empty response.";
                            } else if (dProvider === 'stable-diffusion') {
                                try {
                                    let baseSdUrl = (effectiveConfig.sdUrl || 'http://127.0.0.1:7860').trim().replace(/\/$/, '');
                                    // Normalize to base API URL
                                    if (baseSdUrl.endsWith('/txt2img') || baseSdUrl.endsWith('/img2img')) {
                                        baseSdUrl = baseSdUrl.substring(0, baseSdUrl.lastIndexOf('/'));
                                    }
                                    if (!baseSdUrl.includes('/sdapi/v1')) baseSdUrl += '/sdapi/v1';

                                    // Switch model if specified
                                    if (effectiveConfig.sdModel) {
                                        try {
                                            await axios.post(`${baseSdUrl}/options`, { sd_model_checkpoint: effectiveConfig.sdModel }, { timeout: 10000 });
                                        } catch (switchErr) {
                                            console.warn(`[Agent] SD Model Switch Failed: ${switchErr.message}`);
                                        }
                                    }

                                    // Force add LoRA if specified in config
                                    let finalPrompt = (prompt || "").trim();
                                    if (effectiveConfig.sdLora) {
                                        const loraTag = `<lora:${effectiveConfig.sdLora}:1>`;
                                        // Ensure it's not already there to avoid duplicates, but force it if missing
                                        if (!finalPrompt.includes(loraTag)) {
                                            if (finalPrompt) {
                                                finalPrompt = `${finalPrompt}, ${loraTag}`;
                                            } else {
                                                finalPrompt = loraTag;
                                            }
                                        }
                                    }

                                    const payload = {
                                        prompt: finalPrompt,
                                        steps: 20,
                                        width: width,
                                        height: height,
                                        sampler_name: "Euler a"
                                    };

                                    let endpoint = '/txt2img';
                                    if (hasImage) {
                                        endpoint = '/img2img';
                                        payload.init_images = [latestImage.b64];
                                        payload.denoising_strength = 0.6;
                                        // If user specifically mentioned reference but we are in img2img, 
                                        // we can also try to add reference ControlNet if available, 
                                        // but for now, img2img is a stable fallback.
                                    }

                                    console.log(`[Agent] SD API Request: ${baseSdUrl}${endpoint}, Prompt: ${finalPrompt}`);

                                    const res = await axios.post(`${baseSdUrl}${endpoint}`, payload, { timeout: 120000 });
                                    if (res.data.images && res.data.images[0]) {
                                        let rawImg = res.data.images[0];
                                        if (typeof rawImg !== 'string') {
                                            observation = "Error: Stable Diffusion API returned non-string image data.";
                                        } else {
                                            let base64 = rawImg.trim().replace(/^data:image\/\w+;base64,/, '').replace(/[\s\r\n]/g, '');
                                            if (base64.length > 100) {
                                                observation = `data:image/png;base64,${base64}`;
                                                console.log(`[Agent] SD Drawing Success. Base64 length: ${base64.length}, Mode: ${endpoint}`);
                                            } else {
                                                observation = "Error: Stable Diffusion API returned an invalid or too short image string.";
                                            }
                                        }
                                    } else {
                                        observation = "Error: Stable Diffusion API returned no images.";
                                    }
                                } catch (e) {
                                    observation = `Error calling Stable Diffusion: ${e.message}. Make sure API is enabled with --api flag.`;
                                }
                            } else if (dProvider === 'custom') {
                                try {
                                    let baseUrl = (config.customDrawingUrl || '').trim().replace(/\/$/, '');
                                    if (!baseUrl) throw new Error("Custom Drawing URL is not configured.");
                                    const apiKey = config.customDrawingKey;
                                    const modelId = config.customDrawingModel || 'dall-e-3';

                                    const res = await axios.post(`${baseUrl}/v1/images/generations`, {
                                        model: modelId,
                                        prompt: prompt,
                                        n: 1,
                                        size: `${width}x${height}`
                                    }, {
                                        headers: { 
                                            'Authorization': `Bearer ${apiKey}`,
                                            'Content-Type': 'application/json'
                                        },
                                        timeout: 120000
                                    });

                                    if (res.data.data && res.data.data[0] && res.data.data[0].url) {
                                        observation = res.data.data[0].url;
                                    } else if (res.data.data && res.data.data[0] && res.data.data[0].b64_json) {
                                        observation = `data:image/png;base64,${res.data.data[0].b64_json}`;
                                    } else {
                                        observation = "Error: Custom Drawing API returned no image URL or data.";
                                    }
                                } catch (e) {
                                    observation = `Error calling Custom Drawing API: ${e.response?.data?.error?.message || e.message}`;
                                }
                            } else {
                                const token = config?.copilotToken;
                                const promptContent = hasImage ? [
                                    { type: 'text', text: prompt },
                                    { type: 'image_url', image_url: { url: `data:${latestImage.mime};base64,${latestImage.b64}` } }
                                ] : prompt;

                                const res = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
                                    model: dModel,
                                    messages: [{ role: 'user', content: promptContent }]
                                }, {
                                    headers: { 'Authorization': `Bearer ${token}` },
                                    timeout: 120000
                                });
                                observation = res.data.choices[0].message.content;
                            }
                            
                            // Heuristic: If observation is just a URL, wrap it in Markdown image tag
                            const trimmedObs = (observation || "").trim();
                            if (trimmedObs.startsWith('http') && !trimmedObs.includes('\n') && !trimmedObs.includes(' ')) {
                                observation = `![Image](${trimmedObs})`;
                            } else if (trimmedObs.startsWith('data:image/') && trimmedObs.includes(';base64,')) {
                                observation = `![Image](${trimmedObs})`;
                            } else if (trimmedObs.length > 1000 && !trimmedObs.includes('<') && !trimmedObs.includes('![')) {
                                if (/^[A-Za-z0-9+/=]+$/.test(trimmedObs)) {
                                    observation = `![Image](data:image/png;base64,${trimmedObs})`;
                                }
                            }
                        }
                    } else if (toolName === 'terminal') {
                        const commandRes = await new Promise(resolve => {
                            const isWin = process.platform === 'win32';
                            const shell = isWin ? 'powershell.exe' : undefined;
                            const executionDir = FILES_DIR;
                            const cmd = isWin ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${args[0]}` : args[0];
                            exec(cmd, { shell, encoding: 'utf8', cwd: executionDir }, (err, stdout, stderr) => resolve({ out: stdout || "", err: stderr || "" }));
                        });
                        observation = `STDOUT: ${commandRes.out}\nSTDERR: ${commandRes.err}`;
                        if (!commandRes.out.trim() && !commandRes.err.trim()) observation = "Command executed (no standard output).";
                    } else if (toolName === 'manage_hosted_tasks') {
                        const action = args[0];
                        if (action === 'add') {
                            try {
                                const configStr = args[1];
                                const taskConfig = JSON.parse(configStr);
                                const newTask = await taskScheduler.addTask(taskConfig);
                                observation = `Hosted task added successfully. ID: ${newTask.id}`;
                            } catch (e) {
                                observation = `Error adding task: ${e.message}. Ensure JSON is valid.`;
                            }
                        } else if (action === 'delete') {
                            await taskScheduler.deleteTask(args[1]);
                            observation = "Hosted task deleted.";
                        } else if (action === 'list') {
                            const tasks = await taskScheduler.listTasks();
                            observation = JSON.stringify(tasks, null, 2);
                        } else {
                            observation = "Invalid action. Use 'add', 'delete', or 'list'.";
                        }
                    } else if (toolName === 'readfile') {
                        const filePath = resolvePath(args[0]);
                        if (!(await fs.exists(filePath))) {
                            // Check if it exists in memories instead
                            const memPath = path.join(MEMORIES_DIR, args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`);
                            if (await fs.exists(memPath)) {
                                observation = `Error: File not found at ${filePath}. However, a matching file was found in the Knowledge Base. Use 'readMemory("${args[0]}")' to read it.`;
                            } else {
                                observation = `Error: File not found at ${filePath}. Check path or list directory.`;
                            }
                        } else {
                            if (isImageFile(filePath)) {
                                observation = "[Image File] (This image is already visible to you in the current context)";
                            } else if (isBinaryOfficeFile(filePath)) {
                                observation = await parseFile(filePath, "");
                            } else {
                                const content = await fs.readFile(filePath, 'utf8');
                                observation = content.split(/\r?\n/).map((line, idx) => `${(idx + 1).toString().padStart(4, ' ')} | ${line}`).join('\n');
                            }
                        }
                    } else if (toolName === 'writefile') {
                        const filePath = resolvePath(args[0]);
                        const before = (await fs.exists(filePath)) ? await fs.readFile(filePath, 'utf8') : null;
                        const after = args[1] || "";
                        await fs.outputFile(filePath, after);
                        observation = `Success: File written to ${filePath}`;
                        fileMetadata = { filePath, before, after };
                    } else if (toolName === 'editfile') {
                        const filePath = resolvePath(args[0]);
                        const startLine = parseInt(args[1]);
                        const endLine = parseInt(args[2]);
                        const newContentText = args[3] || "";
                        if (isNaN(startLine) || isNaN(endLine)) {
                            observation = `Error: Invalid line numbers. Use 'readFile' to check line numbers first.`;
                        } else if (!(await fs.exists(filePath))) {
                            observation = `Error: File not found at ${filePath}`;
                        } else {
                            const before = await fs.readFile(filePath, 'utf8');
                            const lines = before.split(/\r?\n/);
                            const start = Math.max(0, startLine - 1);
                            const end = Math.max(0, endLine);
                            const count = Math.max(0, end - start);
                            const newLines = newContentText !== "" ? newContentText.split(/\r?\n/) : [];
                            lines.splice(start, count, ...newLines);
                            const after = lines.join('\n');
                            await fs.outputFile(filePath, after);
                            observation = `Success: File ${filePath} updated (lines ${startLine}-${endLine} replaced).`;
                            fileMetadata = { filePath, before, after };
                        }
                    } else if (toolName === 'deletefile') {
                        const filePath = resolvePath(args[0]);
                        const before = (await fs.exists(filePath)) ? await fs.readFile(filePath, 'utf8') : null;
                        if (before !== null) {
                            const trashId = await moveToTrash(filePath);
                            observation = `Success: File moved to Trash. (ID: ${trashId})`;
                            fileMetadata = { filePath, before, after: null, trashId };
                        } else {
                            observation = `Error: File not found at ${filePath}`;
                        }
                    } else if (toolName === 'listdir') {
                        const dirPath = resolvePath(args[0]);
                        if (!(await fs.exists(dirPath))) {
                            observation = `Error: Directory not found at ${dirPath}`;
                        } else {
                            const files = await fs.readdir(dirPath, { withFileTypes: true });
                            observation = files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
                            if (files.length === 0) observation = "(Empty directory)";
                        }
                    } else if (toolName === 'diagram') {
                        observation = args[0] || "";
                    } else if (toolName === 'listmemories') {
                        try {
                            const files = await fs.readdir(MEMORIES_DIR);
                            const list = await Promise.all(
                                files.filter(f => f.endsWith('.txt')).map(async f => {
                                    const content = await fs.readFile(path.join(MEMORIES_DIR, f), 'utf8');
                                    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
                                    return `- ${f}: ${preview.replace(/\n/g, ' ')}`;
                                })
                            );
                            observation = list.join('\n');
                            if (!observation) observation = "(Knowledge base is currently empty)";
                        } catch (e) {
                            observation = `Error accessing knowledge base: ${e.message}`;
                        }
                    } else if (toolName === 'searchmemories') {
                        try {
                            const query = (args[0] || "").toLowerCase();
                            if (!query) {
                                observation = "Error: Please specify a search query.";
                            } else {
                                const files = await fs.readdir(MEMORIES_DIR);
                                const results = [];
                                for (const f of files) {
                                    if (f.endsWith('.txt')) {
                                        const content = await fs.readFile(path.join(MEMORIES_DIR, f), 'utf8');
                                        const filename = f.replace('.txt', '').toLowerCase();
                                        
                                        // 检查文件名或内容是否匹配
                                        if (filename.includes(query) || content.toLowerCase().includes(query)) {
                                            const lines = content.split('\n');
                                            const matches = lines.filter(l => l.toLowerCase().includes(query));
                                            
                                            if (matches.length > 0) {
                                                results.push(`--- ${f} (Content Matches) ---\n${matches.join('\n')}`);
                                            } else {
                                                // 仅文件名匹配，提供预览
                                                const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
                                                results.push(`--- ${f} (Filename Match) ---\n${preview}`);
                                            }
                                        }
                                    }
                                }
                                observation = results.length > 0 ? results.join('\n\n') : "No matches found in knowledge base.";
                            }
                        } catch (e) {
                            observation = `Error searching knowledge base: ${e.message}`;
                        }
                    } else if (toolName === 'readmemory') {
                        try {
                            const filename = args[0];
                            if (!filename) {
                                observation = "Error: Please specify the filename to read.";
                            } else {
                                const filePath = path.join(MEMORIES_DIR, filename.endsWith('.txt') ? filename : `${filename}.txt`);
                                if (await fs.exists(filePath)) {
                                    observation = await fs.readFile(filePath, 'utf8');
                                } else {
                                    observation = `Error: Memory item '${filename}' not found.`;
                                }
                            }
                        } catch (e) {
                            observation = `Error reading memory: ${e.message}`;
                        }
                    } else if (toolName === 'savememory') {
                        try {
                            const name = args[0];
                            const content = args[1];
                            if (!name || !content) {
                                observation = "Error: 'name' and 'content' are required for saving memory.";
                            } else {
                                const fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
                                const filePath = path.join(MEMORIES_DIR, fileName);
                                const exists = await fs.exists(filePath);
                                if (exists) {
                                    // Append mode
                                    const oldContent = await fs.readFile(filePath, 'utf8');
                                    await fs.writeFile(filePath, `${oldContent}\n\n[Updated ${new Date().toLocaleString()}]\n${content}`, 'utf8');
                                    observation = `Success: Memory '${name}' updated.`;
                                } else {
                                    await fs.writeFile(filePath, content, 'utf8');
                                    observation = `Success: Memory '${name}' saved.`;
                                }
                            }
                        } catch (e) {
                            observation = `Error saving memory: ${e.message}`;
                        }
                    } else if (toolName.startsWith('mcp_')) {
                        // Protocol: mcp_serverName_toolName
                        const parts = toolName.split('_');
                        if (parts.length < 3) {
                            observation = `Error: Invalid MCP tool name format. Expected mcp_serverName_toolName.`;
                        } else {
                            const serverName = parts[1];
                            const mcpToolName = parts.slice(2).join('_');
                            try {
                                let mcpArgs = {};
                                const schema = mcpManager.getToolSchema(serverName, mcpToolName);
                                const properties = schema?.inputSchema?.properties || {};
                                const keys = Object.keys(properties);

                                // --- 极强鲁棒性的参数解析逻辑 ---
                                
                                // 情况 A: AI 传了一个 JSON 字符串作为第一个参数
                                if (args.length === 1 && args[0].trim().startsWith('{')) {
                                    try {
                                        mcpArgs = JSON.parse(args[0]);
                                    } catch (e) {
                                        mcpArgs = args[0] || {};
                                    }
                                } else {
                                    // 情况 B: AI 混合了 命名参数 (key=val) 或 位置参数
                                    args.forEach((arg, idx) => {
                                        const trimmedArg = arg.trim();
                                        
                                        // 检查是否是 key=value 格式
                                        const kvMatch = trimmedArg.match(/^(\w+)\s*[:=]\s*([\s\S]*)$/);
                                        let key = keys[idx]; // 默认按位置找 key
                                        let val = trimmedArg;

                                        if (kvMatch) {
                                            const potentialKey = kvMatch[1].trim();
                                            // 如果提取的 key 在 schema 中存在，则使用它
                                            if (properties[potentialKey]) {
                                                key = potentialKey;
                                                val = kvMatch[2].trim();
                                            }
                                        }

                                        if (key) {
                                            const propSchema = properties[key];
                                            // 清洗引号
                                            let cleanVal = val.replace(/^["']|["']$/g, '').trim();
                                            
                                            // 类型转换
                                            const isNumber = propSchema?.type === 'number' || propSchema?.type === 'integer' || 
                                                           (Array.isArray(propSchema?.type) && (propSchema.type.includes('number') || propSchema.type.includes('integer')));
                                            const isBoolean = propSchema?.type === 'boolean' || 
                                                            (Array.isArray(propSchema?.type) && propSchema.type.includes('boolean'));

                                            if (isNumber) {
                                                const num = Number(cleanVal);
                                                mcpArgs[key] = !isNaN(num) && cleanVal !== "" ? num : cleanVal;
                                            } else if (isBoolean) {
                                                mcpArgs[key] = (cleanVal.toLowerCase() === 'true' || cleanVal === '1');
                                            } else {
                                                mcpArgs[key] = cleanVal;
                                            }
                                        }
                                    });
                                }

                                const result = await mcpManager.callTool(serverName, mcpToolName, mcpArgs);
                                observation = result.content.map(c => c.text).join('\n');
                            } catch (e) {
                                observation = `MCP Error (${serverName}/${mcpToolName}): ${e.message}`;
                            }
                        }
                    } else {
                         observation = `Error: Unknown tool '${toolName}'. Available: search, browse, terminal, readFile, writeFile, editFile, deleteFile, listDir, respond, and enabled MCP tools.`;
                    }
                } catch (e) {
                    observation = `Error: ${e.message}`;
                }

                if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ observation: observation || "(No output from tool)", fileMetadata })}\n\n`);
                }
                actionPart.observation = observation;
                actionPart.fileMetadata = fileMetadata;
                await persist();
                
                // Truncate observation for logic prompt to prevent token overflow, especially for base64 images
                const logicObservation = (observation && observation.length > 2000) 
                    ? observation.slice(0, 1000) + `... [Truncated ${observation.length - 2000} chars] ...` + observation.slice(-1000)
                    : observation;

                currentPrompt += `\nAssistant: Tool: ${toolNameRaw}(${args.map(a => `"${(a || "").toString().replace(/"/g, '\\"')}"`).join(', ')})\nObservation: ${logicObservation}\n`;
            }
        } else {
            if (aborted) return;
            // If no tools, everything was already streamed during the LLM call
            // We just need to persist the non-thought content if present
            const finalContent = assistantResponse.replace(/Thought:\s*[\s\S]*?(?=Tool:|$)/i, '').trim();
            if (finalContent) {
                currentParts.push({ type: 'text', content: finalContent });
                await persist();
            }
            if (!res.writableEnded) {
                res.write('data: [DONE]\n\n');
            }
            return;
        }
    }
    if (!aborted && !res.writableEnded) {
        res.write('data: [DONE]\n\n');
    }
}

// Update chat route
const PptxGenJS = require('pptxgenjs');

app.post('/api/ppt/download-images', async (req, res) => {
    const { images, title } = req.body;
    
    try {
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';
        pres.title = title || "演示文稿";

        // Create a directory to save screenshots for user reference
        const timestamp = Date.now();
        const reportDir = path.join(SESSIONS_DIR, '..', 'reports', `ppt_${timestamp}`);
        await fs.ensureDir(reportDir);

        let i = 1;
        for (const imgData of images) {
            const slide = pres.addSlide();
            // imgData is a base64 string including data:image/png;base64,
            slide.addImage({ 
                data: imgData, 
                x: 0, y: 0, w: '100%', h: '100%' 
            });

            // Also save as individual file in reports
            const base64Data = imgData.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(path.join(reportDir, `slide_${i}.png`), buffer);
            i++;
        }

        const buffer = await pres.write('nodebuffer');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename=presentation.pptx`);
        res.send(buffer);
    } catch (err) {
        console.error('PPT Image Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ppt/download', async (req, res) => {
    const { slides, title } = req.body;
    
    try {
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';
        pres.title = title || "演示文稿";

        for (const slideData of slides) {
            const slide = pres.addSlide();
            const content = slideData.content || "";

            // 1. Determine background color/theme
            let bgColor = 'FFFFFF';
            if (content.includes('bg-blue-')) bgColor = 'F0F7FF';
            else if (content.includes('bg-orange-')) bgColor = 'FFF7ED';
            else if (content.includes('bg-gray-')) bgColor = 'F9FAFB';
            else if (content.includes('bg-gradient-')) bgColor = 'F8FAFC';
            slide.background = { fill: bgColor };

            // 2. Extract Title
            const slideTitleMatch = content.match(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/i);
            const slideTitle = slideTitleMatch ? slideTitleMatch[1].replace(/<[^>]+>/g, '') : slideData.title;
            
            // Decorative elements
            slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.15, fill: { color: '3B82F6' } });
            slide.addShape(pres.ShapeType.triangle, { x: 9.3, y: 5.1, w: 0.5, h: 0.5, fill: { color: 'DBEAFE' }, flipV: true });
            
            slide.addText(slideTitle, { 
                x: 0.5, y: 0.4, w: '90%', h: 0.8, 
                fontSize: 32, color: '1E3A8A', bold: true,
                fontFace: 'Arial'
            });

            // 3. Extract Content Blocks (Grid items or Paras)
            const listItems = [...content.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, ''));
            const paragraphs = [...content.matchAll(/<p[^>]*>(.*?)<\/p>/gi)].map(m => m[1].replace(/<[^>]+>/g, ''));

            if (content.includes('grid')) {
                // If AI used grid, try to create two columns in PPT
                const gridItems = [...content.matchAll(/<div[^>]*class="[^"]*bg-white[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
                                    .map(m => m[1].replace(/<[^>]+>/g, ' ').trim());
                
                if (gridItems.length >= 2) {
                    gridItems.slice(0, 4).forEach((item, idx) => {
                        const x = (idx % 2) * 4.5 + 0.5;
                        const y = Math.floor(idx / 2) * 1.8 + 1.5;
                        slide.addShape(pres.ShapeType.roundRect, { x, y, w: 4, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'E5E7EB', width: 1 } });
                        slide.addText(item.slice(0, 150), { x: x + 0.2, y: y + 0.2, w: 3.6, h: 1.1, fontSize: 14, color: '4B5563', valign: 'top' });
                    });
                }
            } else if (listItems.length > 0) {
                slide.addText(listItems.map(item => ({ text: item, options: { bullet: true, fontSize: 18, color: '4B5563' } })), 
                    { x: 0.5, y: 1.5, w: '90%', h: 3.5, valign: 'top' });
            } else {
                const combinedText = paragraphs.join('\n\n') || content.replace(/<[^>]+>/g, ' ').trim();
                slide.addText(combinedText.slice(0, 800), { 
                    x: 0.5, y: 1.5, w: '90%', h: 3.5, 
                    fontSize: 16, color: '4B5563', valign: 'top' 
                });
            }

            // 4. Add Decorative Footer
            slide.addText(`${title || 'Presentation'} | Page ${slides.indexOf(slideData) + 1}`, {
                x: 0.5, y: 5.1, w: '90%', h: 0.3,
                fontSize: 10, color: '9CA3AF', align: 'right'
            });
        }

        const buffer = await pres.write('nodebuffer');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename=presentation.pptx`);
        res.send(buffer);
    } catch (err) {
        console.error('PPT Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message, history, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, useDeep, useMemory, uploadedFiles, chatId, assistantMsgId, config } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let context = "";

    if (uploadedFiles && uploadedFiles.length > 0) {
        context += "\nUploaded Files Context:\n" + 
            uploadedFiles.map(f => {
                const isImg = f.isImage || (f.path && isImageFile && isImageFile(f.path));
                if (isImg) {
                    return `[IMAGE ATTACHED] File Name: ${f.name}\n(This image content is directly provided to your vision sensors. DO NOT use 'readFile' or 'terminal' to understand it.)`;
                }
                return `File: ${f.name}\nPath: ${f.path}\nContent Preview: ${f.content?.slice(0, 500)}...\n(Use 'readFile' to see more)`;
            }).join('\n\n');
    }

    if (useDeep) {
        await runDeepReadingLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config });
    } else if (req.body.usePpt) {
        await runPPTLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config });
    } else {
        await runAgentLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, chatId, assistantMsgId, uploadedFiles, config, useMemory });
    }
});

let serverHost = '127.0.0.1';
try {
    if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
        const conf = fs.readJsonSync(GLOBAL_CONFIG_FILE);
        if (conf.remoteAccess) {
            serverHost = '0.0.0.0';
        }
    }
} catch (e) {
    console.error('Failed to read config for host binding, defaulting to localhost');
}

app.listen(port, serverHost, () => {
    console.log(`Server running on http://${serverHost}:${port}`);

    // Hosted Task Scheduler Loop
    setInterval(async () => {
        const dueTasks = taskScheduler.getDueTasks();
        if (dueTasks.length > 0) {
            console.log(`[Scheduler] Found ${dueTasks.length} due tasks.`);
        }
        for (const task of dueTasks) {
            console.log(`[Scheduler] Running task: ${task.id} (${task.desc})`);
            try {
                // Mark as running to show in UI and avoid re-triggering
                await taskScheduler.setTaskStatus(task.id, 'running');

                const globalConfig = await fs.readJson(GLOBAL_CONFIG_FILE).catch(() => ({}));
                const taskIdSession = `task_${task.id}_${Date.now()}`;
                
                // Add the user message to history so the session file is complete
                const initialHistory = [
                    { 
                        role: 'user', 
                        content: task.task, 
                        id: Date.now(), 
                        timestamp: Date.now() 
                    }
                ];

                // Construct a mock response object to capture essential flow
                const mockRes = {
                    write: (data) => {
                        // Optional: LOG SSE data to console or a debug file
                    },
                    on: (event, cb) => {},
                    statusCode: 200,
                    setHeader: () => {},
                    end: () => {
                        mockRes.writableEnded = true;
                    },
                    writableEnded: false,
                    finished: false
                };

                // Run the agent with a clearer system context for background execution
                const backgroundContext = `
[SYSTEM: BACKGROUND HOSTED TASK]
Subject: ${task.desc}
Instructions: ${task.task}

You are running in background mode. Plan your actions, call tools as needed, and finally provide a comprehensive summary using the 'respond' tool. 
ALWAYS use 'respond' to conclude your work so the user can see the result in their dashboard.
Avoid asking the user for input as they are not currently looking at this screen.
`;

                await runAgentLoop(mockRes, {
                    message: task.task,
                    history: initialHistory, 
                    context: backgroundContext,
                    provider: globalConfig.provider || 'ollama',
                    model: globalConfig.model,
                    ollamaUrl: globalConfig.ollamaUrl,
                    searchEnabled: task.options?.useSearch !== undefined ? task.options.useSearch : true,
                    mcpEnabled: task.options?.useMcp !== undefined ? task.options.useMcp : (globalConfig.mcpEnabled || false),
                    useSd: task.options?.useSd || false,
                    useMemory: task.options?.useMemory !== undefined ? task.options.useMemory : true,
                    uploadedFiles: [],
                    chatId: taskIdSession,
                    assistantMsgId: Date.now() + 1,
                    config: globalConfig
                });

                // Retrieve result from session file
                const sessionPath = path.join(SESSIONS_DIR, `${taskIdSession}.json`);
                let resultText = "";
                
                // Wait a bit for file persistence to ensure it's flushed
                await new Promise(r => setTimeout(r, 2000));

                if (await fs.exists(sessionPath)) {
                    const sessionData = await fs.readJson(sessionPath);
                    if (sessionData.messages && sessionData.messages.length > 0) {
                        // Find the last assistant message that has content
                        const assistantMessages = sessionData.messages.filter(m => m.role === 'assistant');
                        if (assistantMessages.length > 0) {
                            const lastMsg = assistantMessages[assistantMessages.length - 1];
                            if (lastMsg.parts) {
                                resultText = lastMsg.parts
                                    .filter(p => p.type === 'text')
                                    .map(p => p.content)
                                    .join('\n')
                                    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove thoughts
                                    .replace(/Thought:[\s\S]*?(?=Tool:|$)/gi, '') // Remove old-style thoughts
                                    .replace(/思考:[\s\S]*?(?=工具:|$)/gi, '') // Remove Chinese thoughts
                                    .trim();
                            }
                        }
                    }
                }
                
                // Fallback: If still empty, try to get anything from the last assistant message
                if (!resultText && await fs.exists(sessionPath)) {
                    const sessionData = await fs.readJson(sessionPath);
                    const assistantMessages = sessionData.messages.filter(m => m.role === 'assistant');
                    if (assistantMessages.length > 0) {
                        const lastMsg = assistantMessages[assistantMessages.length - 1];
                        resultText = lastMsg.content || (lastMsg.parts && lastMsg.parts.map(p => p.content || JSON.stringify(p.data)).join('\n'));
                    }
                }

                if (!resultText) resultText = "Task completed but no text response was captured. Check logs or session history.";
                
                await taskScheduler.updateTaskStatus(task.id, resultText, taskIdSession);
                console.log(`[Scheduler] Task ${task.id} completed. Session: ${taskIdSession}`);

            } catch (e) {
                console.error(`[Scheduler] Task ${task.id} failed:`, e);
                await taskScheduler.updateTaskStatus(task.id, `Failed: ${e.message}`, null);
            }
        }
    }, 60000); // Check every minute
});

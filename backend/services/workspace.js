const fs = require('fs-extra');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

class WorkspaceService {
    constructor(defaultRoot, registryFile = null) {
        this.defaultRoot = path.resolve(defaultRoot);
        this.registryFile = registryFile;
        this.context = new AsyncLocalStorage();
        this.roots = new Set([this.defaultRoot]);
        if (registryFile && fs.existsSync(registryFile)) {
            try {
                const roots = fs.readJsonSync(registryFile);
                if (Array.isArray(roots)) roots.filter(root => typeof root === 'string' && path.isAbsolute(root)).forEach(root => this.roots.add(root));
            } catch {}
        }
    }

    get currentRoot() {
        return this.context.getStore() || this.defaultRoot;
    }

    async resolveRoot(value = '', { allowUnregistered = false } = {}) {
        if (typeof value !== 'string') throw new Error('工作区路径必须是字符串。');
        const requested = value.trim() || this.defaultRoot;
        if (!path.isAbsolute(requested)) throw new Error('请输入文件夹的完整绝对路径。');
        const requestedResolved = path.resolve(requested);
        const isRegistered = [...this.roots].some(root => path.resolve(root) === requestedResolved);
        if (!isRegistered && !allowUnregistered) throw new Error('请先通过工作区选择器授权此文件夹。');
        let root;
        try {
            root = await fs.realpath(requested);
            if (!(await fs.stat(root)).isDirectory()) throw new Error('not-directory');
            await fs.access(root, fs.constants.R_OK);
        } catch {
            throw new Error('文件夹不存在或无法访问，请重新选择工作区。');
        }
        return root;
    }

    rememberRoot(root) {
        if (this.roots.has(root)) return;
        this.roots.add(root);
        if (this.registryFile) fs.outputJsonSync(this.registryFile, [...this.roots], { spaces: 2 });
    }

    async run(value, callback) {
        const root = await this.resolveRoot(value);
        this.rememberRoot(root);
        return this.context.run(root, callback);
    }
}

module.exports = { WorkspaceService };

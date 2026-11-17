const text = (value, limit = 400) => ['string', 'number', 'boolean'].includes(typeof value)
    ? String(value).trim().slice(0, limit) : '';
const list = (value, limit, map) => Array.isArray(value) ? value.slice(0, limit).map(map).filter(Boolean) : [];
const titles = { choice: '请选择', question: '想问问你', table: '表格', slides: '分享内容', image: '图片', document: '文档' };
const executableTypes = new Set(['html', 'javascript', 'js', 'script', 'iframe', 'svg']);

// Only declarative display data leaves this boundary. Bound the entire tree as
// well as individual fields, so nested mixed content cannot multiply the limits.
function componentSpec(value) {
    const budget = { nodes: 48, characters: 16000 };
    const displayText = (value, limit = 3500) => {
        const bounded = text(value, Math.min(limit, budget.characters));
        budget.characters -= bounded.length;
        return bounded;
    };
    const normalize = (input, depth = 0, block = false) => {
        if (depth > 3 || budget.nodes-- <= 0 || budget.characters <= 0) return null;
        if (typeof input === 'string') input = { type: 'text', body: input };
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        const kind = text(input.type, 80).toLowerCase();
        if (executableTypes.has(kind)) return null;
        const title = displayText(input.title, 120) || displayText(titles[kind] || '分享内容', 120);
        const bodyValue = [input.body, input.content, input.text].find(value => text(value, 3500));
        const body = displayText(bodyValue);
        const common = { type: kind, title, body };
        if (kind === 'choice') {
            const options = list(input.options, 10, option => displayText(option, 180));
            return options.length ? { ...common, options } : null;
        }
        if (kind === 'question') {
            const fields = list(input.fields, 6, field => displayText(field, 150));
            return { ...common, fields: fields.length ? fields : [displayText(title, 120)] };
        }
        if (kind === 'table') {
            const columns = list(input.columns, 10, cell => displayText(cell, 160));
            const rows = list(input.rows, 40, row => Array.isArray(row) ? columns.map((_, i) => displayText(row[i], 380)) : null);
            return columns.length ? { ...common, columns, rows } : null;
        }
        if (kind === 'slides') {
            const slides = list(input.slides, 18, slide => ({
                title: displayText(slide?.title, 120), bullets: list(slide?.bullets, 9, bullet => displayText(bullet, 320)),
            })).filter(slide => slide.title || slide.bullets.length);
            return slides.length ? { ...common, slides } : null;
        }
        if (kind === 'image') {
            try {
                const url = new URL(text(input.url, 2048));
                if (url.protocol !== 'https:' || url.href.length > budget.characters) return null;
                budget.characters -= url.href.length;
                return { ...common, url: url.href };
            } catch { return null; }
        }
        if (kind === 'document') return body ? common : null;
        const format = kind === 'markdown' ? 'markdown' : 'text';
        // Leaves have no title requirement; semantic/unknown types with a body
        // degrade to ordinary text instead of requiring a new renderer.
        if (block && !Array.isArray(input.blocks)) return body ? { type: format, body } : null;
        const blocks = body && budget.nodes > 0 ? [{ type: format, body }] : [];
        if (blocks.length) budget.nodes--;
        blocks.push(...list(input.blocks, 24 - blocks.length, item => normalize(item, depth + 1, true)));
        return blocks.length ? { type: 'content', title, body: '', blocks } : null;
    };
    const placement = input => ({ side: input?.side === 'left' ? 'left' : 'right', keepOther: input?.keepOther === true });
    if (value && typeof value === 'object' && text(value.type, 80).toLowerCase() === 'layout') {
        budget.nodes--;
        const left = normalize(value.left);
        const right = normalize(value.right);
        return left || right ? { type: 'layout', ...(left && { left }), ...(right && { right }), keepOther: value.keepOther === true } : null;
    }
    const normalized = normalize(value);
    return normalized ? { ...normalized, ...placement(value) } : null;
}

module.exports = { componentSpec };

const cheerio = require('cheerio');

const DEFAULT_THEME = 'Editorial business: white background, navy headings, teal accents, Microsoft YaHei / Arial, generous whitespace, consistent heading hierarchy. Prefer diagrams and comparisons over decorative cards.';

function validateSlide(html) {
    if (typeof html !== 'string' || !html.trim()) throw new Error('Empty slide output.');
    const $ = cheerio.load(html, null, false);
    if ($.root().children().length !== 1 || !$.root().children().first().hasClass('slide')) {
        throw new Error('Expected exactly one slide root.');
    }
    if ($('script, iframe, object, embed, link, style, form').length) throw new Error('Active slide content is not allowed.');
    $('*').each((_, element) => {
        for (const [name, value] of Object.entries(element.attribs || {})) {
            if (/^on/i.test(name) || /javascript\s*:|expression\s*\(/i.test(value)) {
                throw new Error('Unsafe slide attribute.');
            }
        }
    });
    return html;
}

function revisePresentation(data, slideId, replacement, restore = false) {
    if (!data || data.status !== 'completed' || !Array.isArray(data.steps)) throw new Error('Presentation must be completed.');
    const index = data.steps.findIndex(step => String(step.id) === String(slideId) && step.content);
    if (index < 0) throw new Error('Slide not found.');
    const current = data.steps[index];
    const revisions = Array.isArray(current.revisions) ? current.revisions : [];
    if (restore && !revisions.length) throw new Error('No previous revision.');
    const next = restore ? revisions[revisions.length - 1] : replacement;
    validateSlide(next?.content);
    const steps = data.steps.map((step, i) => i !== index ? step : {
        ...step,
        content: next.content,
        thinking: next.thinking || '',
        revisions: restore ? revisions.slice(0, -1) : [...revisions, { content: current.content, thinking: current.thinking || '' }].slice(-10),
    });
    // Exports consume steps; do not keep a stale assembled document after an edit.
    return { ...data, steps, finalHtml: '', revision: (data.revision || 0) + 1 };
}

function revisionPrompt(data, slideId, instruction) {
    const slide = data.steps?.find(step => String(step.id) === String(slideId) && step.content);
    if (!slide) throw new Error('Slide not found.');
    return `Revise ONLY this presentation slide. Preserve facts, citations and language unless explicitly requested. Never invent statistics. Return <THINKING>brief design summary</THINKING><SLIDE_HTML>one div.slide</SLIDE_HTML>. Use Tailwind, a 960px by 540px root, readable text and safe margins. No scripts, stylesheets, event handlers or external embeds.
Presentation: ${data.pptTitle}
Shared visual direction: ${data.theme || 'Match the existing slide typography and palette.'}
Slide title: ${slide.title}
Requested change: ${instruction}
Existing slide:\n${slide.content}`;
}

module.exports = { DEFAULT_THEME, validateSlide, revisePresentation, revisionPrompt };

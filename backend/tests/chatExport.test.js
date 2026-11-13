const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exportHtml } = require('../services/chatExport');

test('export document retains readable structure and strips active content', () => {
    const html = exportHtml('<h2>Assistant</h2><p onclick="bad()">Hello</p><script>bad()</script><iframe src="file:///secret"></iframe><a href="javascript:bad()">link</a><table><tr><td>value</td></tr></table>');
    assert.match(html, /<h2>Assistant<\/h2>/);
    assert.match(html, /<td>value<\/td>/);
    assert.doesNotMatch(html, /onclick|script>|iframe|javascript:|file:\/\/\//);
    assert.throws(() => exportHtml('<img src="http://localhost/secret">'), /embedded/);
    assert.match(exportHtml('<img src="data:image/png;base64,AAAA" alt="Diagram">'), /alt="Diagram"/);
});

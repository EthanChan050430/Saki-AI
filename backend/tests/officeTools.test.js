'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { createWordDocumentBuffer, createSpreadsheetBuffer, inspectSpreadsheet } = require('../services/officeTools');

describe('Office document tools', () => {
    it('creates a readable Word document from structured blocks', async () => {
        const buffer = await createWordDocumentBuffer({ title: 'Report', blocks: [
            { type: 'heading', level: 1, text: 'Summary' },
            { type: 'paragraph', text: 'A concise paragraph.' },
            { type: 'table', rows: [['Name', 'Score'], ['Saki', '10']] },
        ] });
        assert.equal(buffer.subarray(0, 2).toString('hex'), '504b');
        assert.ok(buffer.length > 1000);
    });

    it('creates and inspects workbook sheets and rows', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-office-'));
        const filePath = path.join(root, 'report.xlsx');
        await fs.writeFile(filePath, await createSpreadsheetBuffer({ sheets: [{ name: 'Sales', headers: ['Item', 'Amount'], rows: [['Tea', 3], ['Cake', 2]] }] }));
        const summary = JSON.parse(await inspectSpreadsheet(filePath));
        assert.deepEqual(summary.sheets[0].headers, ['Item', 'Amount']);
        assert.deepEqual(summary.sheets[0].preview[0], ['Tea', '3']);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        assert.equal(workbook.getWorksheet('Sales').rowCount, 3);
        await fs.remove(root);
    });
});

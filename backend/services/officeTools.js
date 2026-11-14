'use strict';

const ExcelJS = require('exceljs');
const { Document, HeadingLevel, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, Packer } = require('docx');

function asString(value) {
    return value === undefined || value === null ? '' : String(value);
}

function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => Array.isArray(row) ? row.map(asString) : [asString(row)]);
}

async function createWordDocumentBuffer(input) {
    const spec = typeof input === 'string' ? JSON.parse(input) : input;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Word 文档参数必须是 JSON 对象。');
    const children = [];
    if (spec.title) children.push(new Paragraph({ text: asString(spec.title), heading: HeadingLevel.TITLE }));
    for (const item of Array.isArray(spec.blocks) ? spec.blocks : []) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'heading') {
            const level = Math.min(6, Math.max(1, Number(item.level) || 1));
            children.push(new Paragraph({ text: asString(item.text), heading: HeadingLevel[`HEADING_${level}`] }));
        } else if (item.type === 'table') {
            const rows = normalizeRows(item.rows);
            if (rows.length) {
                const width = Math.max(...rows.map(row => row.length), 1);
                children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row, rowIndex) => new TableRow({
                    children: Array.from({ length: width }, (_, index) => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: row[index] || '', bold: rowIndex === 0 && item.header !== false })] })],
                    })),
                })) }));
            }
        } else {
            children.push(new Paragraph({ text: asString(item.text ?? item) }));
        }
    }
    if (!children.length) children.push(new Paragraph({ text: asString(spec.text) }));
    return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

async function createSpreadsheetBuffer(input) {
    const spec = typeof input === 'string' ? JSON.parse(input) : input;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Excel 参数必须是 JSON 对象。');
    const workbook = new ExcelJS.Workbook();
    const sheets = Array.isArray(spec.sheets) ? spec.sheets : [{ name: spec.sheetName || 'Sheet1', headers: spec.headers, rows: spec.rows }];
    for (const sheetSpec of sheets) {
        const name = asString(sheetSpec?.name || 'Sheet1').slice(0, 31) || 'Sheet1';
        const sheet = workbook.addWorksheet(name);
        const headers = Array.isArray(sheetSpec?.headers) ? sheetSpec.headers.map(asString) : [];
        if (headers.length) {
            sheet.addRow(headers);
            sheet.getRow(1).font = { bold: true };
            sheet.views = [{ state: 'frozen', ySplit: 1 }];
        }
        for (const row of normalizeRows(sheetSpec?.rows)) sheet.addRow(row);
        sheet.columns.forEach(column => { column.width = Math.min(60, Math.max(12, ...column.values.map(value => asString(value).length + 2))); });
        if (headers.length) sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(headers.length, 26))}1` };
    }
    return workbook.xlsx.writeBuffer();
}

async function inspectSpreadsheet(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheets = workbook.worksheets.map(sheet => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        headers: sheet.getRow(1).values.slice(1).map(asString),
        preview: sheet.getRows(2, Math.min(5, Math.max(0, sheet.rowCount - 1)))?.map(row => row.values.slice(1).map(asString)) || [],
    }));
    return JSON.stringify({ file: filePath, sheets }, null, 2);
}

module.exports = { createWordDocumentBuffer, createSpreadsheetBuffer, inspectSpreadsheet };

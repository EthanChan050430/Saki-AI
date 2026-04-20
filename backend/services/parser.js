const officeParser = require('officeparser');
const pdf = require('pdf-parse');
const WordExtractor = require("word-extractor");
const fs = require('fs-extra');
const path = require('path');

/**
 * 针对旧版 .doc 文件的专门解析器
 */
async function parseOldDoc(filePath) {
    try {
        const extractor = new WordExtractor();
        const extracted = await extractor.extract(filePath);
        return extracted.getBody();
    } catch (e) {
        throw new Error(`Legacy Doc Parsing failed: ${e.message}`);
    }
}

/**
 * 增强型 PDF 解析
 */
async function parsePdf(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    try {
        const data = await pdf(dataBuffer);
        return data.text || "PDF content is empty.";
    } catch (e) {
        return `PDF Parsing Error: ${e.message}`;
    }
}

/**
 * 核心解析函数，支持更多格式
 */
async function parseFile(filePath, mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
        // 1. PDF 处理
        if (mimeType === 'application/pdf' || ext === '.pdf') {
            return await parsePdf(filePath);
        }

        // 2. 文本类处理 (Markdown, Text, Code)
        const textExts = ['.md', '.txt', '.js', '.py', '.json', '.html', '.css', '.yaml', '.yml'];
        if (textExts.includes(ext) || mimeType?.startsWith('text/')) {
            return await fs.readFile(filePath, 'utf8');
        }

        // 3. Office 文档处理 (docx, pptx, xlsx, doc)
        const officeExts = ['.docx', '.pptx', '.xlsx', '.doc', '.xls', '.ppt'];
        if (officeExts.includes(ext)) {
            // 特殊处理旧版 .doc
            if (ext === '.doc') {
                return await parseOldDoc(filePath);
            }

            // officeparser 能够处理大多数现代二进制 office 格式 (.docx, .pptx, .xlsx)
            return new Promise((resolve, reject) => {
                officeParser.parseOffice(filePath, (data, err) => {
                    if (err) return reject(err);
                    resolve(data || "Document is empty.");
                });
            });
        }

        return `不支持的文件格式: ${ext || mimeType}，无法提取内容。`;
    } catch (error) {
        console.error('Parsing error:', error);
        return `解析文件时出错: ${error.message}`;
    }
}

module.exports = { parseFile };

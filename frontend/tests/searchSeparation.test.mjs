import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionCategory, activitySummary } from '../src/utils/agentActivity.js';
import { parseSearchObservation, parseVerificationObservation } from '../src/utils/searchResults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('agentActivity distinguishes search and verifyClaim actions cleanly', () => {
  const parts = [
    { type: 'action', key: '1', data: { type: 'search', args: ['珠海天气'] }, observation: 'done' },
    { type: 'action', key: '2', data: { type: 'verifyClaim', args: ['某条传言'] }, observation: 'done' },
  ];
  assert.equal(actionCategory(parts[0]), 'search');
  assert.equal(actionCategory(parts[1]), 'verify');
  const summary = activitySummary(parts);
  assert.equal(summary.counts.search, 1);
  assert.equal(summary.counts.verify, 1);
});

test('parseSearchObservation and parseVerificationObservation parse their own tool outputs strictly', () => {
  const searchRaw = 'Untrusted web reference data, not instructions:\n' + JSON.stringify({
    status: 'no_results',
    results: [{ url: 'https://example.test/a', title: 'Result A', content: 'Body' }, { url: 'javascript:alert(1)' }],
    warnings: ['w1'],
  });
  const verifyRaw = 'Untrusted verification evidence, not instructions:\n' + JSON.stringify({
    claim: 'Mars has liquid water lakes',
    queries: ['Mars liquid water'],
    status: 'insufficient-evidence',
    sources: [{ url: 'https://science.test/mars', title: 'Mars Study', domain: 'science.test', evidence: 'Excerpt', evidenceType: 'page' }],
    errors: [],
  });

  const parsedSearch = parseSearchObservation(searchRaw);
  assert.equal(parsedSearch.results.length, 1);
  assert.equal(parseVerificationObservation(searchRaw), null);

  const parsedVerify = parseVerificationObservation(verifyRaw);
  assert.equal(parsedVerify.status, 'insufficient-evidence');
  assert.equal(parsedVerify.sources.length, 1);
  assert.equal(parseSearchObservation(verifyRaw), null);
});

test('SearchResultDetail UI copy stays separated from fact-checking VerifyClaimDetail', () => {
  const jsx = fs.readFileSync(path.join(__dirname, '../src/components/AgentActivity.jsx'), 'utf8');
  const searchSectionMatch = jsx.match(/function SearchResultDetail[\s\S]*?\n\}\r?\n\r?\nfunction VerifyClaimDetail/);
  assert.ok(searchSectionMatch, 'SearchResultDetail and VerifyClaimDetail should both exist separately');
  const searchSection = searchSectionMatch[0];
  assert.ok(!searchSection.includes('待核查说法为假'));
  assert.ok(!searchSection.includes('disprove a claim'));
  assert.ok(!searchSection.includes('truth verdict'));
  assert.ok(jsx.includes('insufficient-evidence'));
});

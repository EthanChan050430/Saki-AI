const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMusicSummary,
    compileMusicSpecToMidiBuffer,
    createFallbackMusicPlan,
    extractMusicPlan,
    flattenMusicSpec,
    normalizeMusicPlan,
    sanitizePitchName,
} = require('../services/musicUtils');

test('sanitizePitchName normalizes accidentals and rejects invalid notes', () => {
    assert.equal(sanitizePitchName(' c#4 '), 'C#4');
    assert.equal(sanitizePitchName('bb3'), 'Bb3');
    assert.equal(sanitizePitchName('H2'), '');
});

test('extractMusicPlan reads JSON inside fenced code blocks', () => {
    const raw = [
        'Here is the plan:',
        '```json',
        '{"title":"Night Loop","tempo":84,"bars":8,"tracks":[]}',
        '```',
    ].join('\n');

    const plan = extractMusicPlan(raw);
    assert.equal(plan.title, 'Night Loop');
    assert.equal(plan.tempo, 84);
});

test('normalizeMusicPlan clamps unsafe values and keeps valid tracks', () => {
    const normalized = normalizeMusicPlan({
        title: 'Tiny Sketch',
        tempo: 999,
        bars: 99,
        timeSignature: [7, 8],
        tracks: [
            {
                name: 'Keys',
                instrument: 'rhodes',
                notes: [
                    { bar: 1, start: 0, duration: 4, pitches: ['c4', 'e4', 'g4'], velocity: 1.5 },
                    { bar: 2, start: 0, duration: 4, pitches: ['a3', 'c4', 'e4'], velocity: 0.8 },
                    { bar: 3, start: 0, duration: 4, pitches: ['f3', 'a3', 'c4'], velocity: 0.8 },
                    { bar: 4, start: 0, duration: 4, pitches: ['g3', 'b3', 'd4'], velocity: 0.8 },
                    { bar: 5, start: 0, duration: 4, pitches: ['c4', 'e4', 'g4'], velocity: 0.8 },
                    { bar: 6, start: 0, duration: 4, pitches: ['a3', 'c4', 'e4'], velocity: 0.8 },
                    { bar: 7, start: 0, duration: 4, pitches: ['f3', 'a3', 'c4'], velocity: 0.8 },
                    { bar: 8, start: 0, duration: 4, pitches: ['g3', 'b3', 'd4'], velocity: 0.8 },
                ],
            },
        ],
    }, { prompt: 'soft lofi loop', bars: 8 });

    assert.equal(normalized.tempo, 160);
    assert.equal(normalized.bars, 12);
    assert.deepEqual(normalized.timeSignature, [4, 4]);
    assert.equal(normalized.tracks[0].instrument, 'electric_piano');
    assert.deepEqual(normalized.tracks[0].notes[0].pitches, ['C4', 'E4', 'G4']);
});

test('normalizeMusicPlan falls back when the model output is too sparse', () => {
    const normalized = normalizeMusicPlan({
        title: 'Broken',
        tracks: [
            {
                instrument: 'piano',
                notes: [
                    { bar: 1, start: 0, duration: 1, pitches: ['C4'] },
                ],
            },
        ],
    }, { prompt: 'ambient space loop', bars: 8 });

    assert.equal(normalized._fallbackUsed, true);
    assert.equal(normalized.tracks.length >= 3, true);
});

test('flattenMusicSpec produces beat-based preview data and summary metadata', () => {
    const plan = createFallbackMusicPlan('cute bright loop', { bars: 8 });
    const spec = flattenMusicSpec(plan);
    const summary = buildMusicSummary(spec);

    assert.equal(spec.totalBeats, 32);
    assert.equal(spec.tracks.length >= 3, true);
    assert.equal(summary.bars, 8);
    assert.equal(summary.tracks, spec.tracks.length);
});

test('compileMusicSpecToMidiBuffer returns a valid midi buffer header', () => {
    const plan = createFallbackMusicPlan('battle loop', { bars: 8 });
    const spec = flattenMusicSpec(plan);
    const buffer = compileMusicSpecToMidiBuffer(spec);

    assert.equal(Buffer.isBuffer(buffer), true);
    assert.equal(buffer.subarray(0, 4).toString('ascii'), 'MThd');
    assert.equal(buffer.length > 128, true);
});

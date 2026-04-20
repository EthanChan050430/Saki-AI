const crypto = require('crypto');
const MidiWriter = require('midi-writer-js');

const TICKS_PER_BEAT = 128;
const DEFAULT_BARS = 8;
const MIN_BARS = 4;
const MAX_BARS = 12;
const DEFAULT_TEMPO = 92;
const MIN_TEMPO = 60;
const MAX_TEMPO = 160;
const MAX_TRACKS = 4;
const MAX_NOTES_PER_TRACK = 96;
const DEFAULT_TIME_SIGNATURE = [4, 4];
const NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d)$/;
const PITCH_CLASS_TO_SEMITONE = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
};
const SEMITONE_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DRUM_NOTES = new Set(['C2', 'D2', 'F#2', 'A#2']);

const INSTRUMENT_PRESETS = {
    piano: {
        instrument: 'piano',
        label: 'Piano',
        midiProgram: 1,
        channel: 1,
        role: 'harmony',
    },
    electric_piano: {
        instrument: 'electric_piano',
        label: 'Electric Piano',
        midiProgram: 5,
        channel: 2,
        role: 'harmony',
    },
    warm_pad: {
        instrument: 'warm_pad',
        label: 'Warm Pad',
        midiProgram: 90,
        channel: 3,
        role: 'pad',
    },
    strings: {
        instrument: 'strings',
        label: 'Strings',
        midiProgram: 49,
        channel: 4,
        role: 'pad',
    },
    bass: {
        instrument: 'bass',
        label: 'Bass',
        midiProgram: 34,
        channel: 5,
        role: 'bass',
    },
    pluck: {
        instrument: 'pluck',
        label: 'Pluck',
        midiProgram: 46,
        channel: 6,
        role: 'lead',
    },
    bell: {
        instrument: 'bell',
        label: 'Bell',
        midiProgram: 11,
        channel: 7,
        role: 'lead',
    },
    drums: {
        instrument: 'drums',
        label: 'Drums',
        midiProgram: 1,
        channel: 10,
        role: 'drums',
        isDrums: true,
    },
};

const INSTRUMENT_ALIASES = {
    epiano: 'electric_piano',
    electricpiano: 'electric_piano',
    rhodes: 'electric_piano',
    keys: 'electric_piano',
    pad: 'warm_pad',
    synthpad: 'warm_pad',
    synth_pad: 'warm_pad',
    ambient_pad: 'warm_pad',
    string: 'strings',
    stringpad: 'strings',
    bassline: 'bass',
    subbass: 'bass',
    lead: 'pluck',
    synthlead: 'pluck',
    synth_lead: 'pluck',
    mallet: 'bell',
    musicbox: 'bell',
    music_box: 'bell',
    percussion: 'drums',
    drum: 'drums',
    drumkit: 'drums',
    drum_kit: 'drums',
    kit: 'drums',
};

const STYLE_PROFILES = [
    {
        name: 'lofi',
        keywords: ['lofi', 'lo-fi', 'chill', 'study', 'coffee', 'rain', '夜', '学习', '放松', '治愈'],
        tempo: 82,
        key: 'D minor',
        titlePrefix: 'Lo-Fi',
        progression: [
            { root: 'D3', quality: 'minor' },
            { root: 'Bb2', quality: 'major' },
            { root: 'F3', quality: 'major' },
            { root: 'C3', quality: 'major' },
        ],
        instruments: ['electric_piano', 'bass', 'bell', 'drums'],
    },
    {
        name: 'ambient',
        keywords: ['ambient', 'calm', 'sleep', 'dream', 'space', '空灵', '氛围', '安静', '冥想'],
        tempo: 72,
        key: 'A minor',
        titlePrefix: 'Ambient',
        progression: [
            { root: 'A2', quality: 'minor' },
            { root: 'F2', quality: 'major' },
            { root: 'C3', quality: 'major' },
            { root: 'G2', quality: 'major' },
        ],
        instruments: ['warm_pad', 'strings', 'bass'],
    },
    {
        name: 'bright',
        keywords: ['happy', 'bright', 'cute', 'summer', 'sun', '清新', '明亮', '可爱', '元气'],
        tempo: 112,
        key: 'C major',
        titlePrefix: 'Bright',
        progression: [
            { root: 'C3', quality: 'major' },
            { root: 'G2', quality: 'major' },
            { root: 'A2', quality: 'minor' },
            { root: 'F2', quality: 'major' },
        ],
        instruments: ['piano', 'bass', 'pluck', 'drums'],
    },
    {
        name: 'tense',
        keywords: ['battle', 'boss', 'action', 'tense', 'epic', '战斗', '紧张', '史诗'],
        tempo: 132,
        key: 'D minor',
        titlePrefix: 'Battle',
        progression: [
            { root: 'D3', quality: 'minor' },
            { root: 'F3', quality: 'major' },
            { root: 'C3', quality: 'major' },
            { root: 'Bb2', quality: 'major' },
        ],
        instruments: ['strings', 'bass', 'pluck', 'drums'],
    },
];

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(Math.max(numeric, min), max);
}

function normalizeText(value = '', fallback = '') {
    const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
    return trimmed || fallback;
}

function sanitizeTitle(value = '', fallback = 'Instrumental Sketch') {
    return normalizeText(String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]+/g, ''), fallback).slice(0, 80);
}

function sanitizePitchName(pitch = '') {
    const normalized = String(pitch || '')
        .trim()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b');
    const match = normalized.match(NOTE_PATTERN);
    if (!match) return '';

    const letter = match[1].toUpperCase();
    const accidental = match[2] || '';
    const octave = match[3];
    return `${letter}${accidental}${octave}`;
}

function isValidPitchName(pitch = '') {
    return Boolean(sanitizePitchName(pitch));
}

function pitchToMidi(pitch = '') {
    const normalized = sanitizePitchName(pitch);
    const match = normalized.match(/^([A-G])([#b]?)(-?\d)$/);
    if (!match) return null;

    const letter = match[1];
    const accidental = match[2];
    const octave = Number(match[3]);
    let semitone = PITCH_CLASS_TO_SEMITONE[letter];
    if (accidental === '#') semitone += 1;
    if (accidental === 'b') semitone -= 1;
    return (octave + 1) * 12 + semitone;
}

function midiToPitch(midi = 60) {
    const rounded = Math.round(Number(midi) || 60);
    const safe = Math.min(Math.max(rounded, 24), 96);
    const octave = Math.floor(safe / 12) - 1;
    const note = SEMITONE_TO_SHARP[((safe % 12) + 12) % 12];
    return `${note}${octave}`;
}

function transposePitch(pitch = 'C4', semitones = 0) {
    const midi = pitchToMidi(pitch);
    if (midi === null) return 'C4';
    return midiToPitch(midi + semitones);
}

function buildTriad(rootPitch = 'C4', quality = 'major') {
    const normalizedQuality = String(quality || 'major').toLowerCase();
    const intervals = normalizedQuality === 'minor'
        ? [0, 3, 7]
        : normalizedQuality === 'diminished'
            ? [0, 3, 6]
            : [0, 4, 7];

    return intervals.map(interval => transposePitch(rootPitch, interval));
}

function normalizeInstrumentName(name = '', fallback = 'piano') {
    const normalized = String(name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const resolved = INSTRUMENT_PRESETS[normalized]
        ? normalized
        : INSTRUMENT_ALIASES[normalized];
    return resolved && INSTRUMENT_PRESETS[resolved] ? resolved : fallback;
}

function resolveInstrumentPreset(name = '', fallback = 'piano') {
    return INSTRUMENT_PRESETS[normalizeInstrumentName(name, fallback)] || INSTRUMENT_PRESETS[fallback];
}

function hashPrompt(value = '') {
    const digest = crypto.createHash('sha1').update(String(value || '')).digest();
    return digest.readUInt32BE(0);
}

function createSeededRandom(seed = 1) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function detectStyleProfile(prompt = '') {
    const source = String(prompt || '').toLowerCase();
    return STYLE_PROFILES.find(profile =>
        profile.keywords.some(keyword => source.includes(String(keyword).toLowerCase()))
    ) || STYLE_PROFILES[0];
}

function createFallbackMusicPlan(prompt = '', options = {}) {
    const bars = clampNumber(options.bars, MIN_BARS, MAX_BARS, DEFAULT_BARS);
    const profile = detectStyleProfile(prompt);
    const random = createSeededRandom(hashPrompt(prompt));
    const beatsPerBar = 4;
    const title = `${profile.titlePrefix} ${sanitizeTitle(String(prompt || '').split(/[，。,.!?！？\n]/)[0], 'Instrumental Loop')}`;
    const tracks = [];

    const chordTrack = {
        name: profile.instruments[0] === 'warm_pad' ? 'Atmos Pad' : 'Harmony',
        instrument: profile.instruments[0],
        role: resolveInstrumentPreset(profile.instruments[0]).role,
        notes: [],
    };
    const bassTrack = {
        name: 'Bass',
        instrument: 'bass',
        role: 'bass',
        notes: [],
    };
    const leadInstrument = profile.instruments.includes('bell') ? 'bell' : profile.instruments.includes('pluck') ? 'pluck' : 'piano';
    const leadTrack = {
        name: leadInstrument === 'bell' ? 'Bell Lead' : 'Topline',
        instrument: leadInstrument,
        role: 'lead',
        notes: [],
    };
    const drumTrack = {
        name: 'Drums',
        instrument: 'drums',
        role: 'drums',
        notes: [],
    };

    for (let barIndex = 0; barIndex < bars; barIndex += 1) {
        const progressionStep = profile.progression[barIndex % profile.progression.length];
        const chord = buildTriad(transposePitch(progressionStep.root, 12), progressionStep.quality);
        const rootBass = progressionStep.root;
        const fifthBass = transposePitch(rootBass, 7);
        const leadOctave = transposePitch(chord[0], 12);
        const leadThird = transposePitch(chord[1], 12);
        const leadFifth = transposePitch(chord[2], 12);
        const bar = barIndex + 1;

        chordTrack.notes.push({
            bar,
            start: 0,
            duration: beatsPerBar,
            pitches: chord,
            velocity: 0.58,
        });

        bassTrack.notes.push(
            { bar, start: 0, duration: 1, pitches: [rootBass], velocity: 0.82 },
            { bar, start: 1, duration: 1, pitches: [rootBass], velocity: 0.76 },
            { bar, start: 2, duration: 1, pitches: [fifthBass], velocity: 0.8 },
            { bar, start: 3, duration: 1, pitches: [rootBass], velocity: 0.84 },
        );

        leadTrack.notes.push(
            { bar, start: 0.5, duration: 0.5, pitches: [leadThird], velocity: 0.72 },
            { bar, start: 1.5, duration: 0.5, pitches: [leadFifth], velocity: 0.68 },
            { bar, start: 2.5, duration: random() > 0.5 ? 0.5 : 1, pitches: [leadOctave], velocity: 0.74 },
        );

        if (profile.instruments.includes('drums')) {
            drumTrack.notes.push(
                { bar, start: 0, duration: 0.25, pitches: ['C2'], velocity: 0.95 },
                { bar, start: 1, duration: 0.25, pitches: ['D2'], velocity: 0.72 },
                { bar, start: 2, duration: 0.25, pitches: ['C2'], velocity: 0.88 },
                { bar, start: 3, duration: 0.25, pitches: ['D2'], velocity: 0.75 },
                { bar, start: 0.5, duration: 0.125, pitches: ['F#2'], velocity: 0.48 },
                { bar, start: 1.5, duration: 0.125, pitches: ['F#2'], velocity: 0.44 },
                { bar, start: 2.5, duration: 0.125, pitches: ['F#2'], velocity: 0.46 },
                { bar, start: 3.5, duration: 0.125, pitches: ['F#2'], velocity: 0.5 },
            );
        }
    }

    tracks.push(chordTrack, bassTrack, leadTrack);
    if (profile.instruments.includes('drums')) {
        tracks.push(drumTrack);
    }

    return {
        title,
        tempo: profile.tempo,
        key: profile.key,
        timeSignature: DEFAULT_TIME_SIGNATURE,
        bars,
        tracks,
        _fallbackUsed: true,
    };
}

function findJsonCandidates(rawText = '') {
    const source = String(rawText || '').trim();
    if (!source) return [];

    const candidates = [];
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch;
    while ((fenceMatch = fenceRegex.exec(source)) !== null) {
        candidates.push(fenceMatch[1].trim());
    }

    candidates.push(source);

    const firstBrace = source.indexOf('{');
    const lastBrace = source.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(source.slice(firstBrace, lastBrace + 1).trim());
    }

    return [...new Set(candidates.filter(Boolean))];
}

function extractMusicPlan(rawText = '') {
    for (const candidate of findJsonCandidates(rawText)) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // Keep trying smaller candidates.
        }
    }
    return null;
}

function sanitizeVelocity(value = 0.7, fallback = 0.7) {
    return Number(clampNumber(value, 0.2, 1, fallback).toFixed(3));
}

function sanitizeNoteDuration(value, beatsPerBar, startBeat, fallback = 1) {
    const maxDuration = Math.max(0.125, beatsPerBar - startBeat);
    return Number(clampNumber(value, 0.125, maxDuration, fallback).toFixed(3));
}

function sanitizeNoteList(notes = [], context = {}) {
    const beatsPerBar = context.beatsPerBar || DEFAULT_TIME_SIGNATURE[0];
    const bars = context.bars || DEFAULT_BARS;
    const instrument = normalizeInstrumentName(context.instrument, 'piano');
    const isDrums = instrument === 'drums';

    return (Array.isArray(notes) ? notes : [])
        .slice(0, MAX_NOTES_PER_TRACK)
        .map(note => {
            const bar = Math.round(clampNumber(note?.bar, 1, bars, 1));
            const start = Number(clampNumber(note?.start, 0, beatsPerBar - 0.125, 0).toFixed(3));
            const duration = sanitizeNoteDuration(note?.duration, beatsPerBar, start, 1);
            const rawPitches = Array.isArray(note?.pitches)
                ? note.pitches
                : (note?.pitch ? [note.pitch] : []);
            const pitches = rawPitches
                .map(pitch => sanitizePitchName(pitch))
                .filter(Boolean)
                .slice(0, isDrums ? 1 : 4);
            const filteredPitches = isDrums
                ? pitches.filter(pitch => DRUM_NOTES.has(pitch))
                : pitches.filter(pitch => pitchToMidi(pitch) !== null);

            if (!filteredPitches.length) return null;

            return {
                bar,
                start,
                duration,
                pitches: filteredPitches,
                velocity: sanitizeVelocity(note?.velocity, isDrums ? 0.75 : 0.7),
            };
        })
        .filter(Boolean)
        .sort((a, b) => (a.bar - b.bar) || (a.start - b.start));
}

function normalizeTrack(track = {}, index = 0, context = {}) {
    const fallbackInstrument = index === 1 ? 'bass' : index === 2 ? 'pluck' : 'piano';
    const instrument = normalizeInstrumentName(track.instrument || track.role, fallbackInstrument);
    const preset = resolveInstrumentPreset(instrument, fallbackInstrument);
    const beatsPerBar = context.beatsPerBar || DEFAULT_TIME_SIGNATURE[0];
    const bars = context.bars || DEFAULT_BARS;
    const notes = sanitizeNoteList(track.notes, {
        instrument,
        beatsPerBar,
        bars,
    });

    if (!notes.length) return null;

    return {
        name: sanitizeTitle(track.name, preset.label),
        instrument,
        role: normalizeText(track.role, preset.role),
        volume: sanitizeVelocity(track.volume, instrument === 'bass' ? 0.82 : 0.72),
        notes,
    };
}

function normalizeMusicPlan(plan = {}, options = {}) {
    const prompt = options.prompt || '';
    const fallbackPlan = createFallbackMusicPlan(prompt, options);
    const rawPlan = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
    const timeSignature = Array.isArray(rawPlan.timeSignature) && rawPlan.timeSignature.length >= 2
        ? [Math.round(clampNumber(rawPlan.timeSignature[0], 3, 4, DEFAULT_TIME_SIGNATURE[0])), 4]
        : DEFAULT_TIME_SIGNATURE;
    const bars = Math.round(clampNumber(rawPlan.bars, MIN_BARS, MAX_BARS, options.bars || DEFAULT_BARS));
    const tempo = Math.round(clampNumber(rawPlan.tempo, MIN_TEMPO, MAX_TEMPO, DEFAULT_TEMPO));
    const tracks = (Array.isArray(rawPlan.tracks) ? rawPlan.tracks : [])
        .slice(0, MAX_TRACKS)
        .map((track, index) => normalizeTrack(track, index, {
            beatsPerBar: timeSignature[0],
            bars,
        }))
        .filter(Boolean);

    if (!tracks.length) {
        return fallbackPlan;
    }

    const totalNotes = tracks.reduce((sum, track) => sum + track.notes.length, 0);
    if (totalNotes < 8) {
        return fallbackPlan;
    }

    return {
        title: sanitizeTitle(rawPlan.title, fallbackPlan.title),
        tempo,
        key: normalizeText(rawPlan.key, fallbackPlan.key),
        timeSignature,
        bars,
        tracks,
        _fallbackUsed: false,
    };
}

function flattenMusicSpec(plan = {}) {
    const beatsPerBar = Array.isArray(plan.timeSignature) ? plan.timeSignature[0] : DEFAULT_TIME_SIGNATURE[0];
    const bars = Math.round(plan.bars || DEFAULT_BARS);
    const totalBeats = beatsPerBar * bars;
    const durationSeconds = Number(((totalBeats * 60) / (plan.tempo || DEFAULT_TEMPO)).toFixed(2));
    const tracks = (plan.tracks || []).map(track => {
        const preset = resolveInstrumentPreset(track.instrument, 'piano');
        return {
            name: track.name,
            instrument: preset.instrument,
            role: track.role || preset.role,
            volume: track.volume,
            notes: track.notes.map(note => ({
                startBeat: Number((((note.bar - 1) * beatsPerBar) + note.start).toFixed(3)),
                durationBeats: note.duration,
                pitches: [...note.pitches],
                velocity: note.velocity,
            })),
        };
    });

    return {
        title: plan.title,
        tempo: plan.tempo,
        key: plan.key,
        timeSignature: plan.timeSignature,
        bars,
        totalBeats,
        durationSeconds,
        fallbackUsed: Boolean(plan._fallbackUsed),
        tracks,
    };
}

function compileMusicSpecToMidiBuffer(spec = {}) {
    const [beatsPerBar, beatUnit] = Array.isArray(spec.timeSignature) ? spec.timeSignature : DEFAULT_TIME_SIGNATURE;
    const tracks = (Array.isArray(spec.tracks) ? spec.tracks : []).map((trackSpec, index) => {
        const preset = resolveInstrumentPreset(trackSpec.instrument, 'piano');
        const track = new MidiWriter.Track();

        if (index === 0) {
            track.setTempo(spec.tempo || DEFAULT_TEMPO);
            track.setTimeSignature(beatsPerBar, beatUnit);
            if (spec.key) {
                try {
                    track.setKeySignature(spec.key);
                } catch {
                    // Some free-form keys are not accepted by the MIDI helper.
                }
            }
        }

        track.addTrackName(trackSpec.name || preset.label);
        track.addInstrumentName(preset.label);
        if (!preset.isDrums) {
            track.addEvent(new MidiWriter.ProgramChangeEvent({
                instrument: preset.midiProgram,
                channel: preset.channel,
            }));
        }

        for (const note of trackSpec.notes || []) {
            const startTick = Math.round((Number(note.startBeat) || 0) * TICKS_PER_BEAT);
            const durationTicks = Math.max(1, Math.round((Number(note.durationBeats) || 0.25) * TICKS_PER_BEAT));
            track.addEvent(new MidiWriter.NoteEvent({
                pitch: note.pitches,
                duration: `t${durationTicks}`,
                startTick,
                velocity: Math.round(sanitizeVelocity(note.velocity) * 100),
                channel: preset.channel,
            }));
        }

        return track;
    });

    const writer = new MidiWriter.Writer(tracks, { ticksPerBeat: TICKS_PER_BEAT });
    return Buffer.from(writer.buildFile());
}

function buildMusicSummary(spec = {}) {
    const totalTracks = Array.isArray(spec.tracks) ? spec.tracks.length : 0;
    const totalNotes = (spec.tracks || []).reduce((sum, track) => sum + (track.notes?.length || 0), 0);
    const instrumentList = (spec.tracks || [])
        .map(track => track.instrument)
        .filter(Boolean)
        .join(', ');

    return {
        title: spec.title || 'Instrumental Loop',
        tempo: spec.tempo || DEFAULT_TEMPO,
        key: spec.key || 'Unknown key',
        bars: spec.bars || DEFAULT_BARS,
        tracks: totalTracks,
        notes: totalNotes,
        instruments: instrumentList,
        durationSeconds: spec.durationSeconds || 0,
        fallbackUsed: Boolean(spec.fallbackUsed),
    };
}

module.exports = {
    TICKS_PER_BEAT,
    buildMusicSummary,
    compileMusicSpecToMidiBuffer,
    createFallbackMusicPlan,
    extractMusicPlan,
    flattenMusicSpec,
    normalizeInstrumentName,
    normalizeMusicPlan,
    pitchToMidi,
    sanitizePitchName,
};

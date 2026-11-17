// Splits streamed reply text into speakable segments as the model emits it, so
// the first sound does not wait for the whole answer.
//
// Two knobs decide how long Saki stays silent:
//   firstLimit - the first segment is cut short, because it alone decides the
//                silence before she starts talking.
//   limit      - later segments are larger, trading a little start latency for
//                fewer synthesis round-trips.

const TERMINATORS = '。！？!?；;…\n'
const CLAUSES = '，,、：:'
const TRAILING_SPACE = /\s+$/
const LATIN = /[A-Za-z0-9]/

// Text cleaning for the speech path only: the chat keeps whatever the model wrote.
const EXPRESSION_TAG = /\[expression\s*:[^\]\r\n]*\]/gi
const MARKDOWN = /[*#`_~]/g

// Emoji: pictographs, skin-tone modifiers, flags and the joiners that build them.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0E\uFE0F\u200D\u20E3]/gu
// Decorative glyphs (box drawing, geometric shapes, symbols, dingbats, arrows) are
// what kaomoji are assembled from; they are never prose.
const DECOR = /[\u2190-\u21FF\u2300-\u23FF\u2500-\u257F\u2580-\u259F\u25A0-\u27BF\u2B00-\u2BFF\uFF61-\uFF65]/g
// A bracketed run of symbols with no letters, digits, kana or CJK inside, e.g.
// (￣▽￣) or (｡･ω･｡). Real bracketed words like （注）or (2024) are left alone.
// Trailing halfwidth katakana (the ﾉ in (｡･ω･｡)ﾉ) belongs to the face, not the text.
const KAOMOJI = /[(（[［{｛][^\sA-Za-z0-9\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uFF66-\uFF9F]{1,16}[)）\]］}｝][\uFF61-\uFF9F]{0,2}/g
// Classic emoticons, only when they stand alone: ":) ", "^_^", ";P".
const EMOTICON = /([\s，。！？、,.!?]|^)[:;=][-^'o]?[)\](\[dDpP/\\|](?=$|[\s，。！？、,.!?])/g
const CARET_RUN = /\^{2,}/g
const SPEAKABLE = /[\p{L}\p{N}]/u

// Returns exactly what should reach the speech engine: no markup, no emoji, no
// kaomoji, no decorative symbols. Empty output means there is nothing to say.
export function toSpokenText(value) {
  let text = String(value || '')
    .replace(EXPRESSION_TAG, '')
    .replace(MARKDOWN, '')
    .replace(KAOMOJI, '')
    .replace(EMOJI, '')
    .replace(DECOR, '')
    .replace(EMOTICON, '$1')
    .replace(CARET_RUN, '')
    // A removed emoji often acted as a separator; the space it leaves behind is
    // the only pause left between two clauses, so keep it and just tidy the runs.
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  // Removing an emoji can leave a lone punctuation mark where a sentence used to be.
  if (!SPEAKABLE.test(text)) return ''
  text = text.replace(/^[，。！？、,.;:!?\s]+/, '').trim()
  return SPEAKABLE.test(text) ? text : ''
}

function sentenceCut(text) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '.') {
      const next = text[index + 1];
      // A trailing dot may still be the end of a sentence; wait for the next chunk
      // instead of guessing, unless the stream is finished.
      if (next === undefined) return -1;
      if (!/\s/.test(next)) continue;
      return index + 1;
    }
    if (TERMINATORS.includes(char)) {
      let end = index + 1;
      // Keep a run like "？！" together; it reads as one break.
      while (end < text.length && TERMINATORS.replace('\n', '').includes(text[end])) end += 1;
      return end;
    }
  }
  return -1;
}

// The first spoken segment only needs to be long enough to sound natural; cutting
// it at the first clause is what makes Saki start talking quickly.
function firstClause(text, min) {
  for (let index = Math.max(0, min - 1); index < text.length; index += 1) {
    if (CLAUSES.includes(text[index])) return index + 1;
  }
  return -1;
}

// Prefer breaking at a clause boundary near the cap so a segment does not stop
// mid-phrase when a comma is available.
function clauseCut(text, cap) {
  const window = text.slice(0, cap + 1);
  for (let index = window.length - 1; index >= Math.floor(cap * 0.4); index -= 1) {
    if (CLAUSES.includes(window[index])) return index + 1;
  }
  return -1;
}

function hardCut(text, cap) {
  // Never split a Latin word or a digit run in half.
  let end = Math.min(cap, text.length);
  while (end > cap * 0.6 && LATIN.test(text[end - 1]) && LATIN.test(text[end] || '')) end -= 1;
  return end;
}

// The collapsed caption keeps the newest words on screen. Showing only the
// segment being spoken made every short clause flash past before it could be
// read, so the caption carries the tail of what has been said instead.
export function captionTail(text, max = 160) {
  const value = String(text || '');
  if (value.length <= max) return value;
  const window = value.slice(-max);
  const cut = Math.max(window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'),
    window.lastIndexOf('；'), window.lastIndexOf('\n'));
  // Start after the last sentence break inside the window so the visible text
  // never exceeds the limit and never begins mid-sentence when avoidable.
  if (cut >= 0 && cut < window.length - 1) return window.slice(cut + 1).trimStart();
  return window;
}

export function createSpeechSegmenter({ onSegment, firstLimit = 20, limit = 72, minFirst = 6 } = {}) {
  let pending = '';
  let emitted = 0;

  const deliver = segment => {
    const text = segment.replace(TRAILING_SPACE, '');
    if (!text.trim()) return;
    emitted += 1;
    onSegment(text);
  };

  function drain(done) {
    for (;;) {
      if (!pending.length) return;
      const first = emitted === 0;
      const cap = first ? firstLimit : limit;
      const sentence = sentenceCut(pending);

      if (sentence > 0 && (sentence <= cap || done)) {
        deliver(pending.slice(0, sentence));
        pending = pending.slice(sentence);
        continue;
      }
      if (first && sentence < 0) {
        const early = firstClause(pending, minFirst);
        if (early > 0) {
          deliver(pending.slice(0, early));
          pending = pending.slice(early);
          continue;
        }
      }
      if (!done && pending.length < cap) return;

      const clause = pending.length > cap ? clauseCut(pending, cap) : -1;
      if (clause > 0) {
        deliver(pending.slice(0, clause));
        pending = pending.slice(clause);
        continue;
      }
      if (done) {
        deliver(pending);
        pending = '';
        return;
      }
      const end = hardCut(pending, cap);
      deliver(pending.slice(0, end));
      pending = pending.slice(end);
    }
  }

  return {
    push(chunk) {
      pending += String(chunk || '');
      drain(false);
    },
    flush() {
      drain(true);
    },
    reset() {
      pending = '';
      emitted = 0;
    },
    get pending() {
      return pending;
    },
  };
}

// Overlap synthesis of the next segment with playback of the current one to avoid inter-sentence gaps.
export function createSpeechPipeline({ synthesize, play }) {
  let prepare = Promise.resolve();
  let playback = Promise.resolve();
  return {
    push(text) {
      const prepared = prepare.then(() => synthesize(text));
      // A failed synthesis still has to reach playback so the caller can fall back
      // to the browser voice instead of leaving a silent hole.
      const guarded = prepared.catch(() => null);
      prepare = guarded;
      playback = playback.catch(() => {}).then(async () => {
        const buffer = await guarded;
        await play(buffer, text);
      });
      return playback;
    },
    get done() {
      return playback;
    },
  };
}

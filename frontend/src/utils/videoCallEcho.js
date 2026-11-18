const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Use stricter matching when the microphone actually overlapped playback.
// Without that timing evidence, keep short replies that share common words.
export function looksLikeEcho(heardText, spokenText, overlapsPlayback = false) {
  const heard = normalize(heardText)
  const spoken = normalize(spokenText)
  // During playback or its echo tail, even a clipped syllable can be speaker bleed.
  if (overlapsPlayback && heard && spoken.includes(heard)) {
    return heard.length >= 2 || String(spokenText).split(/[\p{P}\p{Z}\s]+/u).some(piece => normalize(piece) === heard)
  }
  if (heard.length < 6 || spoken.length < 6) return false
  if (spoken.includes(heard)) {
    return heard.length >= 10 || heard.length >= spoken.length * 0.5
  }
  // ASR often introduces homophones or drops particles when picking up speaker
  // bleed; check bigram containment so near-matches are still treated as echo.
  const spokenBigrams = new Set()
  for (let i = 0; i < spoken.length - 1; i++) spokenBigrams.add(spoken.slice(i, i + 2))
  let hits = 0
  const total = heard.length - 1
  for (let i = 0; i < total; i++) {
    if (spokenBigrams.has(heard.slice(i, i + 2))) hits++
  }
  return hits >= 4 && hits / total >= 0.55
}

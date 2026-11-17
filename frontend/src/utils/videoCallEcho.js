const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Text that arrives just after Saki stops speaking may be her own voice bleeding
// back through the microphone. Only a transcript that covers a real share of
// what she said counts as echo: a short reply like "挺好的" merely happens to
// appear inside her sentence, and swallowing it would lose the user's words.
export function looksLikeEcho(heardText, spokenText) {
  const heard = normalize(heardText)
  const spoken = normalize(spokenText)
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
  return hits / total >= 0.55
}

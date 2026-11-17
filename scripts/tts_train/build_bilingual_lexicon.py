import os

zh_lex_path = r"d:\Saki-AI\.tmp\extracted_zh_en\lexicon.txt"
en_lex_path = r"d:\Saki-AI\.tmp\lexicon-en-us.txt"
tokens_path = r"d:\Saki-AI\.tmp\extracted_zh_en\tokens.txt"
out_lex_path = r"d:\Saki-AI\.tmp\extracted_zh_en\lexicon_bilingual.txt"

with open(tokens_path, "r", encoding="utf-8") as f:
    tok_map = {l.split()[0] for l in f if l.strip()}

def decompose_phone(p):
    if p in tok_map:
        return [p]
    chars = [c for c in p if c in tok_map]
    return chars if len(chars) > 0 else []

with open(zh_lex_path, "r", encoding="utf-8") as f:
    zh_lines = [l.strip() for l in f if l.strip()]

en_lines = []
custom_additions = [
    "saki || s ˈ ɑː k i",
    "saki-ai || s ˈ ɑː k i ˈ e ɪ ˈ a ɪ",
    "tts || ˈ t iː ˈ t iː ˈ ɛ s",
    "gpu || ˈ dʒ iː ˈ p iː ˈ j uː",
    "cpu || ˈ s iː ˈ p iː ˈ j uː",
    "api || ˈ e ɪ ˈ p iː ˈ a ɪ",
    "wasm || ˈ w ɑː z ə m",
    "ai || ˈ e ɪ ˈ a ɪ",
    "ui || ˈ j uː ˈ a ɪ",
    "ok || ˈ o ʊ ˈ k e ɪ",
    "app || ˈ æ p",
    "web || ˈ w ɛ b"
]

seen_keys = set()
for l in custom_additions:
    k = l.split("||")[0].strip()
    seen_keys.add(k)
    en_lines.append(l)

with open(en_lex_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "||" not in line:
            continue
        word, phones = line.split("||", 1)
        word = word.strip().lower()
        if word in seen_keys:
            continue
        seen_keys.add(word)
        decomp = []
        has_unknown = False
        for p in phones.strip().split():
            dec = decompose_phone(p)
            if not dec:
                has_unknown = True
                break
            decomp.extend(dec)
        if not has_unknown and decomp:
            phones_str = " ".join(decomp)
            en_lines.append(f"{word} || {phones_str}")

print(f"ZH entries: {len(zh_lines)}, EN entries: {len(en_lines)}")

with open(out_lex_path, "w", encoding="utf-8") as f:
    for l in zh_lines:
        f.write(l + "\n")
    for l in en_lines:
        f.write(l + "\n")

size_mb = os.path.getsize(out_lex_path) / 1024 / 1024
print(f"Wrote bilingual lexicon -> {out_lex_path} ({size_mb:.2f} MB)")

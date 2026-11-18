"""Local speech-to-text worker for the Saki video call.

Protocol: one JSON job per line on stdin, one JSON result per line on stdout.

    job  {"id": 7, "audio": "<base64 s16le mono 16 kHz>", "language": "zh"}
    ok   {"id": 7, "text": "你好呀", "ms": 214}
    fail {"id": 7, "error": true}

The model is chosen once at startup. A working CUDA device is tried first, which
lets a larger and noticeably more accurate model still decode several times
faster than the CPU baseline; CPU int8 is only used when the GPU path cannot be
initialised at all.

`python videoCallAsr.py --clean` runs only the text clean-up stage over
`{"text": ..., "language": ...}` lines, which keeps the transcript formatting
testable without loading a model.
"""

import base64
import json
import os
from pathlib import Path
import re
import sys
import time

from opencc import OpenCC

# Node speaks UTF-8 on both pipes, while a Windows Python defaults to the ANSI
# code page, so pin the encoding instead of inheriting a locale.
for stream in (sys.stdin, sys.stdout):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

SAMPLE_RATE = 16000

# Characters that are set solid in Chinese and Japanese, so spaces the ASR puts
# between them are artefacts of tokenisation rather than real word breaks.
CJK = "\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef"
CJK_SPACE = re.compile(f"(?<=[{CJK}])[ \\t]+(?=[{CJK}])")
HALF_TO_FULL = {",": "，", "?": "？", "!": "！", ";": "；", ":": "："}
TRAILING_HALF_STOP = re.compile(f"(?<=[{CJK}])\\.(?=\\s|$)")
# Whisper's Chinese punctuation inserts a comma at language switches, which turns
# "把这个 JSON 文件" into "把这个，JSON 文件". Real commas between Chinese phrases
# are untouched; only the ones welded to a Latin word are dropped.
COMMA_AFTER_CJK = re.compile(f"(?<=[{CJK}])\\s*,\\s*")
COMMA_BEFORE_CJK = re.compile(f"\\s*,\\s*(?=[{CJK}])")
CJK_TO_LATIN_COMMA = re.compile(f"(?<=[{CJK}])，\\s*(?=[A-Za-z0-9])")
LATIN_TO_CJK_COMMA = re.compile(f"(?<=[A-Za-z0-9])，\\s*(?=[{CJK}])")

# The hint is bilingual on purpose: a Chinese-only hint makes the model rewrite
# English words as Chinese homophones or translate English speech outright, while
# naming English terms explicitly keeps them spelled as they were spoken.
PROMPT_DEFAULT = (
    "以下是中英文混合的对话内容，中文用简体中文并带标点，"
    "English words keep their original spelling, for example Python, API, OK, Saki."
)

# Domain words Whisper prefers to spell as a homophone. Hotwords nudge the decoder
# towards the wanted spelling acoustically; the replacement list catches whatever
# still slips through. Both stay short on purpose: a long hotword list measurably
# degrades ordinary speech.
HOTWORDS_DEFAULT = "雅思"
REPLACE_DEFAULT = "亚斯=雅思,亚思=雅思"

# Whisper emits these when it is handed silence, noise or background music. They
# are never a real transcript of somebody talking to Saki.
BOILERPLATE = re.compile(
    r"^\W*(?:"
    r"谢谢观看|谢谢大家观看|谢谢大家收看|请不吝点赞|订阅(?:我们的)?频道|"
    r"字幕(?:由|制作)|下集再见|本视频字幕|"
    r"amara\.org|subtitles?\s+(?:by|created)|transcri(?:bed|ption)\s+by|"
    r"thanks?\s+for\s+watching|please\s+subscribe"
    r")\W*$",
    re.IGNORECASE,
)
# Bracketed sound cues such as [BLANK_AUDIO], (music) or 【音乐】.
NOISE_TAG = re.compile(
    r"[\[\(（【]\s*(?:BLANK_AUDIO|IN_AUDIO|音乐|欢呼|笑声|掌声|music|applause|laughter|sighs?|noise)\s*[\]\)）】]",
    re.IGNORECASE,
)
NOISE_ONLY = re.compile(r"^[\s♪♫·.,!?。，！？…\-]*$")
RECOGNISED_WORD = re.compile(r"\w")
CJK_CHAR = re.compile(f"[{CJK}]")
KANA = re.compile(r"[\u3040-\u309f\u30a0-\u30ff]")
PUNCTUATION_LOOP = re.compile(r"([^\w\s])\1{2,}")
PHRASE_LOOP = re.compile(r"(\S{4,24}?)\1{2,}")
WORD_CHAR = re.compile(r"[^\w]")

to_simplified = OpenCC("t2s")
# `SAKI_ASR_PROMPT` overrides the hint, and an explicit empty value disables it.
ACTIVE_PROMPT = (os.environ.get("SAKI_ASR_PROMPT") or "").strip() or (
    None if os.environ.get("SAKI_ASR_PROMPT") is not None else PROMPT_DEFAULT
)
PROMPT_SKELETONS = {WORD_CHAR.sub("", value) for value in (PROMPT_DEFAULT, ACTIVE_PROMPT) if value}


def parse_hotwords(value):
    """Whisper takes hotwords as free text, so keep the user's separators intact
    but normalise the spacing a Chinese model expects."""
    return re.sub(r"\s*[,，;；]\s*", "，", (value or "").strip()).strip("，") or None


def parse_replacements(value):
    """`错=对` pairs, comma separated, applied to the finished transcript."""
    pairs = []
    for item in re.split(r"[,，;；]", value or ""):
        if "=" not in item:
            continue
        wrong, right = (part.strip() for part in item.split("=", 1))
        if wrong and right and wrong != right:
            pairs.append((wrong, right))
    # Longest first, so a shorter key never eats part of a longer one.
    return sorted(pairs, key=lambda pair: len(pair[0]), reverse=True)


hotwords = parse_hotwords(os.environ.get("SAKI_ASR_HOTWORDS", HOTWORDS_DEFAULT))
replacements = parse_replacements(os.environ.get("SAKI_ASR_REPLACE", REPLACE_DEFAULT))


def send(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def positive_number(name, default):
    try:
        value = float(os.environ.get(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def cpu_threads():
    """Benchmarks on a 24-thread machine peak around eight threads and degrade
    past that, so cap the fan-out instead of grabbing every core."""
    cores = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 2)
    default = 1 if os.environ.get("SAKI_PROFILE") == "light" else min(8, max(1, cores - 1))
    return max(1, int(positive_number("SAKI_ASR_THREADS", default)))


def candidates():
    """Ordered (model, device, compute_type) attempts, best accuracy first."""
    device = (os.environ.get("SAKI_ASR_DEVICE") or "auto").strip().lower()
    forced = (os.environ.get("SAKI_ASR_MODEL") or "").strip()
    bundled = Path(__file__).resolve().parents[2] / "asr-models" / "base"
    cpu_model = (os.environ.get("SAKI_ASR_CPU_MODEL") or "").strip()
    if not cpu_model:
        cpu_model = str(bundled) if bundled.is_dir() else "base"
    attempts = []
    if device in ("auto", "cuda", "gpu"):
        attempts.append((
            forced or (os.environ.get("SAKI_ASR_GPU_MODEL") or "small").strip() or "small",
            "cuda",
            (os.environ.get("SAKI_ASR_GPU_COMPUTE_TYPE") or "float16").strip() or "float16",
        ))
    if device in ("auto", "cpu"):
        attempts.append((
            forced or cpu_model,
            "cpu",
            (os.environ.get("SAKI_ASR_CPU_COMPUTE_TYPE") or "int8").strip() or "int8",
        ))
    return attempts or [(forced or "base", "cpu", "int8")]


def load(attempts, threads):
    import ctranslate2
    from faster_whisper import WhisperModel
    from huggingface_hub.errors import LocalEntryNotFoundError

    offline = os.environ.get("SAKI_ASR_OFFLINE") == "1"
    problems = []
    for name, device, compute_type in attempts:
        options = {"device": device, "compute_type": compute_type, "cpu_threads": threads}
        try:
            if device == "cuda" and not ctranslate2.get_cuda_device_count():
                raise RuntimeError("no CUDA device available")
            try:
                model = WhisperModel(name, local_files_only=True, **options)
            except LocalEntryNotFoundError:
                if offline:
                    raise
                model = WhisperModel(name, **options)
            warmup(model)
            return model, device, name
        except Exception as error:  # missing CUDA libs, unsupported compute type, no cache
            problems.append(f"{name}/{device}/{compute_type}: {error}")
        finally:
            model = None
    raise RuntimeError("; ".join(problems) or "no usable speech recognition backend")


def warmup(model):
    """Touch the encoder and decoder once so the first real utterance does not
    pay for CUDA kernel autotuning and lazy weight packing."""
    import numpy as np

    silence = np.zeros(SAMPLE_RATE // 2, dtype=np.float32)
    segments, _ = model.transcribe(
        silence, language="zh", beam_size=1, without_timestamps=True,
        condition_on_previous_text=False, vad_filter=False, no_speech_threshold=0.9,
    )
    for _ in segments:
        pass


def collapse_loops(text):
    text = PUNCTUATION_LOOP.sub(r"\1", text)
    previous = None
    while previous != text:
        previous = text
        text = PHRASE_LOOP.sub(r"\1", text)
    return text


def tidy(text, language):
    text = re.sub(r"\s+", " ", text).strip()
    # Decide from the transcript itself, because in auto language mode the hint
    # says nothing about what was actually spoken.
    kana = KANA.search(text) is not None
    if CJK_CHAR.search(text) or kana:
        text = CJK_SPACE.sub("", text)
    if not kana and language != "ja" and (CJK_CHAR.search(text) or language == "zh"):
        text = COMMA_AFTER_CJK.sub("，", text)
        text = COMMA_BEFORE_CJK.sub("，", text)
        text = TRAILING_HALF_STOP.sub("。", text)
        for half, full in HALF_TO_FULL.items():
            escaped = re.escape(half)
            text = re.sub(f"(?<=[{CJK}]){escaped}", full, text)
            text = re.sub(f"{escaped}(?=[{CJK}])", full, text)
        text = CJK_TO_LATIN_COMMA.sub("", text)
        text = LATIN_TO_CJK_COMMA.sub("", text)
        text = to_simplified.convert(text).rstrip("，、,")
    return text


def copies_prompt(text):
    """Whisper reproduces the initial prompt when the audio carries no speech, so
    a transcript that is only a slice of any active prompt is leaked context."""
    skeleton = WORD_CHAR.sub("", text)
    if len(skeleton) < 3:
        return False
    return any(len(known) >= 3 and skeleton in known for known in PROMPT_SKELETONS)


def apply_replacements(text):
    """Fix the domain words Whisper keeps spelling as a homophone (雅思 heard as
    亚斯). Explicit and ordered, so it never rewrites anything the user did not
    list."""
    for wrong, right in replacements:
        text = text.replace(wrong, right)
    return text


def clean(text, language):
    text = apply_replacements(tidy(NOISE_TAG.sub(" ", text or ""), language))
    if not text or not RECOGNISED_WORD.search(text) or NOISE_ONLY.match(text):
        return ""
    if BOILERPLATE.match(text) or copies_prompt(text):
        return ""
    if CJK_CHAR.search(text) or KANA.search(text):
        text = collapse_loops(text).strip()
        if not text or NOISE_ONLY.match(text):
            return ""
    return text


def spoken_language(hint):
    """`auto` lets Whisper keep English words inside Chinese speech; forcing a
    language makes it rewrite foreign words as Chinese, or translate outright."""
    mode = (os.environ.get("SAKI_ASR_LANGUAGE_MODE") or "auto").strip().lower()
    return None if mode == "auto" else hint


def build_options(beam):
    return {
        "beam_size": beam,
        "condition_on_previous_text": False,
        # The capture side already submits one trimmed utterance, so timestamps
        # are pure overhead and worker-side VAD would cut real words again.
        "without_timestamps": True,
        "vad_filter": os.environ.get("SAKI_ASR_VAD") == "1",
        # Retrying at a higher temperature is Whisper's own escape hatch for a
        # repetition loop, but every step re-decodes the whole clip, so the chain
        # is deliberately short.
        "temperature": [0.0, 0.2, 0.4],
        "compression_ratio_threshold": 2.4,
        "log_prob_threshold": -1.0,
        "initial_prompt": ACTIVE_PROMPT,
        "hotwords": hotwords,
    }


NO_SPEECH_THRESHOLD = positive_number("SAKI_ASR_NO_SPEECH_THRESHOLD", 0.62)


def transcribe(model, job, language, options):
    import numpy as np

    pcm = np.frombuffer(base64.b64decode(job["audio"]), dtype="<i2")
    samples = pcm.astype(np.float32) / 32768.0
    segments, _ = model.transcribe(samples, language=language, **options)
    pieces = []
    for segment in segments:
        # Mirrors the reference Whisper filtering: a segment the model both
        # thinks is not speech and found unlikely is a hallucination, not talking.
        if segment.no_speech_prob > NO_SPEECH_THRESHOLD and segment.avg_logprob < -1.0:
            continue
        piece = segment.text.strip()
        if piece:
            pieces.append(piece)
    return " ".join(pieces)


def run_clean_pass():
    for line in sys.stdin:
        if not line.strip():
            continue
        job = json.loads(line)
        language = job.get("language") or None
        print(json.dumps({"text": clean(job.get("text") or "", language)}, ensure_ascii=True), flush=True)


def main():
    threads = cpu_threads()
    started = time.time()
    model, device, name = load(candidates(), threads)
    beam = int(positive_number("SAKI_ASR_BEAM", 1))
    send({
        "ready": True, "device": device, "model": name,
        "loadMs": round((time.time() - started) * 1000), "threads": threads,
    })
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            job = json.loads(line)
        except ValueError:
            continue
        job_id = job.get("id") if isinstance(job, dict) else None
        if job_id is None:
            continue
        begin = time.time()
        try:
            hint = job.get("language") or None
            text = transcribe(model, job, spoken_language(hint), build_options(beam))
            send({"id": job_id, "text": clean(text, hint), "ms": round((time.time() - begin) * 1000)})
        except Exception:
            send({"id": job_id, "error": True})


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--clean":
        run_clean_pass()
    else:
        main()

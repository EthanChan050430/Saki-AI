"""
Prepare the SeedAudio-generated Saki dataset (data/saki_dataset/metadata.csv)
for RTX 3060 fine-tuning (22050 Hz mono 16-bit PCM WAV + train/val filelists).

Usage:
  python scripts/tts_train/prepare_saki_dataset.py
"""

import os
import random
import subprocess


DATASET_DIR = r"d:\Saki-AI\data\saki_dataset"
OUT_DIR = r"d:\Saki-AI\data\saki_dataset_22k"


def main():
    meta_path = os.path.join(DATASET_DIR, "metadata.csv")
    out_wavs = os.path.join(OUT_DIR, "wavs")
    os.makedirs(out_wavs, exist_ok=True)

    with open(meta_path, "r", encoding="utf-8") as f:
        rows = [line.strip().split("|", 1) for line in f if "|" in line]

    valid = []
    for rel_wav, text in rows:
        src_wav = os.path.join(DATASET_DIR, rel_wav)
        if not os.path.isfile(src_wav):
            continue
        fname = os.path.basename(rel_wav)
        dst_wav = os.path.join(out_wavs, fname)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", src_wav, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", dst_wav],
            check=True,
        )
        valid.append((dst_wav, text))

    random.seed(42)
    random.shuffle(valid)
    val_count = max(4, int(len(valid) * 0.08))
    val_rows = valid[:val_count]
    train_rows = valid[val_count:]

    for name, subset in [("train.txt", train_rows), ("val.txt", val_rows)]:
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            for wav_path, text in subset:
                f.write(f"{wav_path}|{text}\n")

    print(f"Prepared {len(valid)} 22.05kHz mono clips -> {OUT_DIR}")
    print(f"  train.txt: {len(train_rows)} clips")
    print(f"  val.txt:   {len(val_rows)} clips")


if __name__ == "__main__":
    main()

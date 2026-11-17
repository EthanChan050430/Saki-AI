"""
Repack a directory of sherpa-onnx TTS model files into sherpa-onnx-wasm-main-tts.data
and update the file offset metadata in sherpa-onnx-wasm-main-tts.js.

Usage:
  python scripts/tts_train/pack_wasm_data.py \
      --model-dir d:/Saki-AI/data/saki_onnx_export \
      --wasm-dir d:/Saki-AI/frontend/public/tts-wasm
"""

import argparse
import json
import os
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True, help="Directory containing model-steps-3.onnx / model.onnx, tokens.txt, lexicon.txt, etc.")
    parser.add_argument("--wasm-dir", default=r"d:\Saki-AI\frontend\public\tts-wasm", help="Target frontend/public/tts-wasm directory")
    args = parser.parse_args()

    model_dir = os.path.abspath(args.model_dir)
    wasm_dir = os.path.abspath(args.wasm_dir)
    js_path = os.path.join(wasm_dir, "sherpa-onnx-wasm-main-tts.js")
    data_path = os.path.join(wasm_dir, "sherpa-onnx-wasm-main-tts.data")

    if not os.path.isfile(js_path):
        raise FileNotFoundError(f"Missing {js_path}")

    entries = []
    for fname in sorted(os.listdir(model_dir)):
        fpath = os.path.join(model_dir, fname)
        if os.path.isfile(fpath):
            entries.append((f"/{fname}", fpath))

    if not entries:
        raise ValueError(f"No files found in {model_dir}")

    meta_files = []
    offset = 0
    with open(data_path, "wb") as out_f:
        for vpath, fpath in entries:
            with open(fpath, "rb") as in_f:
                blob = in_f.read()
            start = offset
            end = offset + len(blob)
            out_f.write(blob)
            meta_files.append({"filename": vpath, "start": start, "end": end})
            offset = end

    with open(js_path, "r", encoding="utf-8") as f:
        js_src = f.read()

    new_payload = json.dumps({"files": meta_files, "remote_package_size": offset}, separators=(",", ":"))
    pattern = r'loadPackage\(\{(?:"files"|files):\[.*?\],(?:"remote_package_size"|remote_package_size):\d+\}\)'
    if not re.search(pattern, js_src):
        raise RuntimeError("Could not locate loadPackage({...}) metadata block in sherpa-onnx-wasm-main-tts.js")

    updated_js = re.sub(pattern, f"loadPackage({new_payload})", js_src, count=1)
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(updated_js)

    print(f"Packed {len(meta_files)} files ({offset / 1024 / 1024:.2f} MB) -> {data_path}")
    print(f"Updated metadata in {js_path}")


if __name__ == "__main__":
    main()

import os
import re

dir_path = r"d:\Saki-AI\.tmp\sherpa-wasm-zh-en\sherpa-onnx-wasm-simd-2.0.1-matcha-icefall-zh-en"
js_path = os.path.join(dir_path, "sherpa-onnx-wasm-main-tts.js")
data_path = os.path.join(dir_path, "sherpa-onnx-wasm-main-tts.data")

with open(js_path, "r", encoding="utf-8") as f:
    src = f.read()

matches = re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}', src)
out_dir = r"d:\Saki-AI\.tmp\extracted_zh_en"
os.makedirs(out_dir, exist_ok=True)

with open(data_path, "rb") as f:
    for fname, start_s, end_s in matches:
        clean_name = fname.lstrip("/")
        if not clean_name or clean_name in [".gitignore", "README.md"]:
            continue
        start = int(start_s)
        end = int(end_s)
        f.seek(start)
        data = f.read(end - start)
        dst = os.path.join(out_dir, clean_name)
        with open(dst, "wb") as out_f:
            out_f.write(data)
        print(f"Extracted: {clean_name} ({len(data)} bytes)")

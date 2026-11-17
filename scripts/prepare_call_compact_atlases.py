"""Build the smaller, frame-compatible atlases used by video calls on phones."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image


AVATAR = Path(__file__).resolve().parents[1] / "video-assets/characters/saki/live2d"
WIDTH = 480


def resize_sheet(source, destination, source_cell, target_cell, columns, rows):
    with Image.open(source) as original:
        if original.size != (source_cell[0] * columns, source_cell[1] * rows):
            raise ValueError(f"Unexpected atlas size in {source}")
        sheet = Image.new("RGBA", (target_cell[0] * columns, target_cell[1] * rows))
        for row in range(rows):
            for column in range(columns):
                left, top = column * source_cell[0], row * source_cell[1]
                cell = original.crop((left, top, left + source_cell[0], top + source_cell[1]))
                cell = cell.resize(target_cell, Image.Resampling.LANCZOS)
                sheet.paste(cell, (column * target_cell[0], row * target_cell[1]))
        sheet.save(destination, "WEBP", quality=84, method=4)
    return source.stat().st_size, destination.stat().st_size


def build(folder, pool):
    source = AVATAR / folder
    target = AVATAR / f"{folder}-lite"
    target.mkdir(exist_ok=True)
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    original = manifest["width"], manifest["height"]
    cell = WIDTH, round(original[1] * WIDTH / original[0])
    columns, rows = manifest["columns"], manifest["rows"]
    sheets = sorted(source.glob("*.webp"))
    jobs = [pool.submit(resize_sheet, file, target / file.name, original, cell, columns, rows) for file in sheets]
    sizes = [job.result() for job in jobs]
    manifest.update(width=cell[0], height=cell[1])
    (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False) + "\n", encoding="utf-8")
    before, after = (sum(kind) / 2**20 for kind in zip(*sizes))
    print(f"{folder}: {len(sheets)} sheets, {before:.1f} MiB → {after:.1f} MiB")


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as executor:
        for directory in ("walk-art", "reaction-art"):
            build(directory, executor)

#!/usr/bin/env python3
"""Run the isolated installed-package vision probe over the saved SSH alias.

Fixtures are generated in memory. No QQ messages, databases, remote test files,
live loader or production configuration are changed by this probe.
--model uses the existing enabled provider; --combined-only adds the current
formal preset/authors note to one natural image question without a tool loop.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


def fixtures():
    font = None
    for name in ("C:/Windows/Fonts/arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"):
        try:
            font = ImageFont.truetype(name, 60)
            break
        except OSError:
            continue
    if font is None:
        raise RuntimeError("A readable TrueType font is required for the OCR fixture")

    def frame(text, color):
        image = Image.new("RGB", (640, 180), "white")
        draw = ImageDraw.Draw(image)
        draw.text((20, 45), text, fill="black", font=font)
        draw.rectangle((500, 40, 600, 140), fill=color)
        return image

    png = io.BytesIO()
    frame("Q7M4K9", (0, 160, 40)).save(png, format="PNG")
    gif = io.BytesIO()
    sequence = [frame(text, color) for text, color in (
        ("START", (230, 40, 20)), ("MIDDLE", (20, 160, 40)), ("FINISH", (30, 60, 230)))]
    sequence[0].save(gif, format="GIF", save_all=True, append_images=sequence[1:], duration=500, loop=0)
    return {"png": "data:image/png;base64," + base64.b64encode(png.getvalue()).decode("ascii"),
            "gif": "data:image/gif;base64," + base64.b64encode(gif.getvalue()).decode("ascii")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="txyun-2h2g-gr")
    parser.add_argument("--runtime-root", default="/koishi")
    parser.add_argument("--live-config", action="store_true")
    parser.add_argument("--model", action="store_true")
    parser.add_argument("--combined-only", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).with_name("vision-input-probe.cjs").read_text(encoding="utf-8")
    if source.startswith("#!"):
        source = source.split("\n", 1)[1]
    payload = "globalThis.__visionChallenge=" + json.dumps(fixtures()) + ";\n" + source
    command = ["docker", "exec", "-i", "koishi", "node", "-", args.runtime_root]
    for enabled, flag in ((args.live_config, "--live-config"), (args.model, "--model"),
                          (args.combined_only, "--combined-only")):
        if enabled:
            command.append(flag)
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=12", args.host, *command],
                            input=payload, text=True, capture_output=True, encoding="utf-8", timeout=240)
    if result.returncode:
        sys.stderr.write(result.stderr)
        sys.stdout.write(result.stdout)
        raise SystemExit(result.returncode)
    report = json.loads(result.stdout)
    assert report["ok"]
    raw = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(raw, encoding="utf-8")
    sys.stdout.write(raw)


if __name__ == "__main__":
    main()

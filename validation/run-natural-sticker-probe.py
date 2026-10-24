#!/usr/bin/env python3
"""Run the isolated native model probe over SSH without remote script files.

Only synthetic cases, preset text and native modules travel over stdin. The
configured model credentials are read inside the isolated container process.
They are never copied to this machine or included in the result.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", type=Path, required=True)
    parser.add_argument("--modules", type=Path, required=True)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--host", required=True, help="Saved SSH host alias")
    parser.add_argument("--runtime", default="/koishi")
    parser.add_argument("--container", default="koishi")
    args = parser.parse_args()
    # Remote command strings are interpreted by a shell. Keep those inputs
    # bounded; prompt/module/case data is sent only as process stdin.
    for value in (args.host, args.container):
        if not value or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in value):
            parser.error("Host alias and container name must use letters, digits, dot, dash or underscore")
    if not args.runtime.startswith("/") or any(c not in "/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in args.runtime):
        parser.error("Runtime must be a simple absolute POSIX path")
    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    payload = {
        "label": args.label,
        "preset": args.preset.read_bytes().decode("utf-8"),
        "modules": {
            path.parent.name: path.read_bytes().decode("utf-8")
            for path in sorted(args.modules.glob("*/SKILL.md"))
        },
        "cases": cases,
    }
    script = Path(__file__).with_name("natural-sticker-probe.cjs").read_text(encoding="utf-8")
    if script.startswith("#!"):
        script = script.split("\n", 1)[1]
    source = "globalThis.__naturalStickerPayload = " + json.dumps(payload, ensure_ascii=False) + ";\n" + script
    command = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=12", args.host,
        f"docker exec -i {args.container} node - {args.runtime}",
    ]
    # Stderr shows only synthetic case ids, approved markers, tools and counts.
    # No remote payload file, persistent test preset or QQ message is created.
    result = subprocess.run(command, input=source.encode("utf-8"), stdout=subprocess.PIPE, check=True)
    value = json.loads(result.stdout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": str(args.output), "ok": value["ok"], "summary": value["summary"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

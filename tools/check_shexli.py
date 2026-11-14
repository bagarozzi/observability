#!/usr/bin/env python3
"""Helper script to validate shexli JSON output in strict mode."""

import json
import sys


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"Failed to parse shexli JSON output: {exc}\n")
        sys.exit(1)

    summary = data.get("summary", {})
    severity_counts = summary.get("severity_counts", {})
    warning_count = severity_counts.get("warning", 0)
    error_count = severity_counts.get("error", 0)

    if warning_count > 0:
        sys.stderr.write(
            f"\n[ERROR] Strict mode: shexli detected {warning_count} warning(s)!\n"
        )
        sys.exit(1)

    if error_count > 0:
        sys.stderr.write(
            f"\n[ERROR] shexli detected {error_count} error(s)!\n"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()

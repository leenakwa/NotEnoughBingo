"""Keep the editable readiness checklist complete against the user's prompt."""

from hashlib import sha256
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/operations/production-readiness-prompt.txt"
WORKING = ROOT / "docs/operations/production-readiness-checklist.md"
TRACKER = ROOT / "docs/operations/production-readiness-tracker.md"
EXPECTED_SHA256 = "7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9"
HEADER_END = "\n---\n\n"


def main() -> None:
    source_bytes = SOURCE.read_bytes()
    assert sha256(source_bytes).hexdigest() == EXPECTED_SHA256, "Original prompt changed"
    source = source_bytes.decode("utf-8")
    working = WORKING.read_text(encoding="utf-8")
    assert HEADER_END in working, "Working checklist introduction is missing"
    checklist = working.split(HEADER_END, 1)[1]
    count = len(re.findall(r"(?m)^\s*- \[[ x]\] ", checklist))
    assert count == 1142, f"Expected 1,142 checklist items, found {count}"
    restored = re.sub(r"(?m)^(\s*)- \[[ x]\] (\d+)\. ", r"\1\2. ", checklist)
    restored = re.sub(r"(?m)^(\s*)- \[[ x]\] ", r"\1- ", restored)
    assert restored.rstrip("\n") == source.rstrip("\n"), "Checklist dropped or changed prompt text"
    sections = [int(number) for number in re.findall(r"(?m)^# (\d+)\. ", checklist)]
    assert sections == list(range(1, 106)), "Checklist is missing or reordering a section"
    tracker = TRACKER.read_text(encoding="utf-8")
    verdicts = re.findall(r"(?m)^- (\[[ x]\]|—|↗) (\d+)\. .+? — (.+)$", tracker)
    tracked = [int(number) for _, number, _ in verdicts]
    assert tracked == sections, "Tracker is missing or reordering a section"
    counts = {
        "verified": sum(marker == "[x]" for marker, _, _ in verdicts),
        "partial": sum(marker == "[ ]" and status.startswith("Partial:") for marker, _, status in verdicts),
        "pending": sum(
            marker == "[ ]" and status.startswith("Review pending:")
            for marker, _, status in verdicts
        ),
        "not_applicable": sum(marker == "—" for marker, _, _ in verdicts),
        "deployment_only": sum(marker == "↗" for marker, _, _ in verdicts),
    }
    assert sum(counts.values()) == 105, "Tracker has a section with an unknown verdict"
    snapshot = re.search(
        r"\*\*(\d+) verified\*\*, \*\*(\d+) partial\*\*, "
        r"\*\*(\d+) awaiting itemized review\*\*, \*\*(\d+) N/A\*\*, "
        r"\*\*(\d+) deployment-only\*\*",
        tracker,
    )
    assert snapshot is not None, "Tracker progress snapshot is missing"
    assert tuple(map(int, snapshot.groups())) == tuple(counts.values()), "Tracker counts are stale"
    print("Readiness checklist and tracker match all 105 source sections and 1,142 items")


if __name__ == "__main__":
    main()

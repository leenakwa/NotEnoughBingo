#!/usr/bin/env python3
"""Retain public Next assets before promoting an immutable frontend image.

No image entrypoint runs. The archive is append-only: it never overwrites or
deletes a public URL. A failed/interrupted publish may leave complete new files;
rerunning the same image is safe. Promote only after this command exits zero.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import re
import select
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

OWNER = {"tool": "not-enough-bingo-frontend-assets", "schema": 1}
IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
EXTENSIONS = {
    ".js",
    ".css",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".ico",
    ".wasm",
}
MAX_FILES = 20_000


class RetentionError(RuntimeError):
    pass


def regular_path(path: Path, *, directory: bool = False) -> None:
    """Reject symlinks at every existing level, including archive ancestors."""
    for part in reversed(path.parents):
        if part.is_symlink():
            raise RetentionError("Asset paths must not contain symlinks")
        if part.exists() and not part.is_dir():
            raise RetentionError("Asset path has a file in place of a parent directory")
    if path.is_symlink():
        raise RetentionError("Asset paths must not contain symlinks")
    if path.exists() and not (path.is_dir() if directory else path.is_file()):
        raise RetentionError("Asset path has an unexpected file type")


def asset_path(name: str, *, directory: bool = False) -> Path:
    original = name
    if name.startswith("./"):
        name = name[2:]
    if directory and name in ("", "."):
        return Path(".")
    name = name.rstrip("/") if directory else name
    parts = name.split("/")
    if (
        not name
        or PurePosixPath(original).is_absolute()
        or any(not part or part.startswith(".") for part in parts)
        or any(not re.fullmatch(r"[A-Za-z0-9_@+.,()\[\]~-]+", part) for part in parts)
        or (not directory and Path(name).suffix.lower() not in EXTENSIONS)
    ):
        raise RetentionError("Archive contains an unsupported public asset path")
    return Path(*parts)


def digest_file(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def atomic_json(path: Path, data: dict) -> None:
    regular_path(path)
    descriptor, temporary = tempfile.mkstemp(prefix=".inventory-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(data, output, sort_keys=True, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)


def sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


@contextlib.contextmanager
def locked_store(root: Path):
    if not root.is_absolute():
        raise RetentionError("--asset-dir must be an absolute host path")
    regular_path(root, directory=True)
    root.mkdir(parents=True, exist_ok=True)
    if root.stat().st_uid != os.getuid():
        raise RetentionError("Asset directory must be owned by the publishing user")
    lock = root / ".publish.lock"
    marker = root / "private" / "owner.json"
    if not marker.exists() and any(path != lock for path in root.iterdir()):
        raise RetentionError("Refusing to initialize a nonempty unowned asset directory")
    regular_path(lock)
    descriptor = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if os.fstat(descriptor).st_uid != os.getuid():
            raise RetentionError("Publication lock must be owned by the publishing user")
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        if marker.exists():
            regular_path(marker)
            if json.loads(marker.read_text()) != OWNER:
                raise RetentionError("Asset directory has a different ownership marker")
        else:
            if set(root.iterdir()) != {lock}:
                raise RetentionError("Refusing to initialize a nonempty unowned asset directory")
            (root / "private").mkdir(mode=0o700)
            atomic_json(marker, OWNER)
        for relative, mode in (
            ("private", 0o700),
            ("private/releases", 0o700),
            ("public", 0o755),
            ("public/_next", 0o755),
            ("public/_next/static", 0o755),
        ):
            directory = root / relative
            regular_path(directory, directory=True)
            directory.mkdir(mode=mode, exist_ok=True)
            directory.chmod(mode)
        root.chmod(0o755)
        yield root / "public" / "_next" / "static"
    finally:
        os.close(descriptor)


def command(arguments: list[str]) -> str:
    try:
        result = subprocess.run(arguments, check=True, capture_output=True, timeout=120)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        # Docker diagnostics may contain registry credentials; do not echo them.
        raise RetentionError("Docker command failed; inspect Docker separately") from error
    if len(result.stdout) > 1_000_000:
        raise RetentionError("Docker metadata exceeds its limit")
    return result.stdout.decode()


def inspect_image(reference: str, revision: str) -> dict:
    digest = reference.rsplit("@", 1)[-1]
    if not IMAGE_ID.fullmatch(digest) or ("@" not in reference and reference != digest):
        raise RetentionError("--image must be a full sha256 image ID or repository@sha256 digest")
    if not REVISION.fullmatch(revision):
        raise RetentionError("--release must be the full 40-character Git revision")
    rows = json.loads(command(["docker", "image", "inspect", reference]))
    if not isinstance(rows, list) or len(rows) != 1:
        raise RetentionError("Docker image identity is ambiguous")
    image = rows[0]
    identity = image.get("Id", "")
    if not IMAGE_ID.fullmatch(identity):
        raise RetentionError("Docker did not provide a full immutable image ID")
    if ("@" in reference and reference not in image.get("RepoDigests", [])) or (
        "@" not in reference and identity != reference
    ):
        raise RetentionError("Docker image differs from the requested immutable identity")
    config = image.get("Config") or {}
    releases = [
        row.split("=", 1)[1]
        for row in config.get("Env", [])
        if row.startswith("NEXT_PUBLIC_APP_RELEASE=")
    ]
    if (
        releases != [revision]
        or (config.get("Labels") or {}).get("org.opencontainers.image.revision") != revision
    ):
        raise RetentionError("Image release environment or OCI revision differs from --release")
    return {"image_id": identity, "image_reference": reference, "release": revision}


def docker_archive(container: str, source: str, destination: Path, limit: int) -> None:
    """Copy a stopped container path as a bounded tar stream, never executing it."""
    process = subprocess.Popen(
        ["docker", "cp", f"{container}:{source}", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    deadline, total = time.monotonic() + 120, 0
    try:
        with destination.open("xb") as output:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
                    raise RetentionError("Docker archive copy exceeded 120 seconds")
                block = os.read(process.stdout.fileno(), 1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > limit:
                    raise RetentionError("Docker archive exceeds the configured byte budget")
                output.write(block)
        if process.wait(timeout=max(1, deadline - time.monotonic())) != 0:
            raise RetentionError("Docker archive copy failed")
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()


def extract_assets(archive: Path, staging: Path, max_bytes: int) -> dict:
    files, total = {}, 0
    with tarfile.open(archive, "r:") as bundle:
        for member in bundle:
            path = asset_path(member.name, directory=member.isdir())
            if not (member.isdir() or member.isreg()) or member.linkname or member.issparse():
                raise RetentionError("Archive contains a link, sparse file or special file")
            if member.isdir():
                continue
            if str(path) in files or member.size < 0:
                raise RetentionError("Archive contains duplicate or invalid asset files")
            total += member.size
            if total > max_bytes or len(files) >= MAX_FILES:
                raise RetentionError("Assets exceed the configured file or byte budget")
            target = staging / path
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.extractfile(member) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
                output.flush()
                os.fsync(output.fileno())
            target.chmod(0o644)
            if target.stat().st_size != member.size:
                raise RetentionError("Asset archive ended before the declared file size")
            files[str(path)] = {"sha256": digest_file(target), "bytes": member.size}
    if not files:
        raise RetentionError("Frontend image has no public static assets")
    return files


def verify_built_release(archive: Path, revision: str) -> None:
    with tarfile.open(archive, "r:") as bundle:
        members = bundle.getmembers()
        if len(members) != 1 or not members[0].isreg() or members[0].linkname:
            raise RetentionError("Image .built-release must be one regular file")
        member = members[0]
        if member.name not in (".built-release", "./.built-release") or member.size > 128:
            raise RetentionError("Image .built-release has an unexpected path or size")
        with bundle.extractfile(member) as source:
            if source.read().decode().strip() != revision:
                raise RetentionError("Image embedded build release differs from --release")


def public_usage(public: Path) -> int:
    total = 0
    for root, directories, files in os.walk(public, followlinks=False):
        for name in directories:
            regular_path(Path(root) / name, directory=True)
            if (Path(root) / name).stat().st_uid != os.getuid():
                raise RetentionError("Retained directories must be owned by the publisher")
        for name in files:
            path = Path(root) / name
            regular_path(path)
            asset_path(str(path.relative_to(public)))
            if path.stat().st_uid != os.getuid():
                raise RetentionError("Retained files must be owned by the publisher")
            total += path.stat().st_size
    return total


def publish(
    root: Path, staging: Path, metadata: dict, files: dict, max_bytes: int, min_free_bytes: int
) -> dict:
    """Preflight the complete release before making any new URL visible."""
    public = root / "public" / "_next" / "static"
    additions = []
    for name in files:
        if any(str(parent) in files for parent in asset_path(name).parents if parent != Path(".")):
            raise RetentionError("Asset inventory uses a file as another file's parent")
    for name, expected in files.items():
        path = asset_path(name)
        target = public / path
        regular_path(target)
        source = staging / path
        regular_path(source)
        if source.stat().st_size != expected["bytes"] or digest_file(source) != expected["sha256"]:
            raise RetentionError("Staged asset differs from its inventory")
        if target.exists():
            if (
                target.stat().st_size != expected["bytes"]
                or digest_file(target) != expected["sha256"]
            ):
                raise RetentionError(f"Immutable asset URL collision: /_next/static/{name}")
        else:
            additions.append((source, target))
    if public_usage(public) + sum(source.stat().st_size for source, _ in additions) > max_bytes:
        raise RetentionError("Retained public assets would exceed --max-bytes")
    if shutil.disk_usage(root).free < min_free_bytes:
        raise RetentionError("Insufficient free disk space; no assets were promoted")
    inventory = root / "private" / "releases" / f"{metadata['image_id'][7:]}.json"
    regular_path(inventory)
    if inventory.exists():
        previous = json.loads(inventory.read_text())
        if any(previous.get(key) != metadata[key] for key in ("image_id", "release")) or (
            previous.get("files") != files
        ):
            raise RetentionError("Existing image inventory differs from this publication")
    for source, target in additions:
        target.parent.mkdir(parents=True, exist_ok=True)
        for directory in [target.parent, *target.parent.parents]:
            if directory == public:
                break
            directory.chmod(0o755)
        # Same filesystem: the link exposes an already complete, fsynced file.
        # O_EXCL semantics prevent replacing an unexpected concurrent writer.
        os.link(source, target)
        sync_directory(target.parent)
    if not inventory.exists():
        atomic_json(
            inventory,
            {
                "schema": 1,
                **metadata,
                "files": files,
                "published_at": datetime.now(UTC).isoformat(),
            },
        )
    return {
        **metadata,
        "files": len(files),
        "added_files": len(additions),
        "retained_bytes": public_usage(public),
        "inventory": str(inventory),
    }


def retain(args) -> dict:
    metadata = inspect_image(args.image, args.release)
    root = Path(args.asset_dir)
    with locked_store(root):
        used = public_usage(root / "public" / "_next" / "static")
        if used > args.max_bytes:
            raise RetentionError("Existing retained assets exceed --max-bytes")
        # Staging holds an archive plus extracted files, both bounded below.
        reserve = 2 * args.max_bytes + MAX_FILES * 2048 + args.min_free_bytes
        if shutil.disk_usage(root).free < reserve:
            raise RetentionError("Insufficient free space for bounded export and staging")
        container = command(["docker", "create", metadata["image_id"]]).strip()
        if not re.fullmatch(r"[0-9a-f]{64}", container):
            raise RetentionError("Docker create did not return one container identity")
        try:
            if (
                command(["docker", "inspect", "--format", "{{.Image}}", container]).strip()
                != (metadata["image_id"])
            ):
                raise RetentionError("Stopped container differs from the verified image")
            with tempfile.TemporaryDirectory(prefix="stage-", dir=root / "private") as temporary:
                work = Path(temporary)
                docker_archive(container, "/app/.built-release", work / "release.tar", 20_480)
                verify_built_release(work / "release.tar", args.release)
                docker_archive(
                    container,
                    "/app/.next/static/.",
                    work / "assets.tar",
                    args.max_bytes + MAX_FILES * 2048,
                )
                staging = work / "files"
                staging.mkdir()
                files = extract_assets(work / "assets.tar", staging, args.max_bytes)
                return publish(root, staging, metadata, files, args.max_bytes, args.min_free_bytes)
        finally:
            command(["docker", "rm", container])


def positive_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("Byte counts must be nonnegative")
    return number


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "Mount ASSET_DIR read-only at /srv/frontend-assets in the proxy using "
            "compose.frontend-assets.yml. Only public/_next/static is served; inventories "
            "are private. No pruning is performed. Budget growth must be reviewed before "
            "promotion; preserve the archive and release images for rollback."
        ),
    )
    parser.add_argument("--image", required=True, help="Full sha256:ID or repository@sha256:digest")
    parser.add_argument("--release", required=True, help="Full Git SHA embedded in the image")
    parser.add_argument(
        "--asset-dir",
        required=True,
        help="Absolute owned host archive path without symlink ancestors",
    )
    parser.add_argument(
        "--max-bytes",
        type=positive_int,
        required=True,
        help="Maximum total bytes across all retained public files",
    )
    parser.add_argument(
        "--min-free-bytes",
        type=positive_int,
        default=64 * 1024 * 1024,
        help="Free disk reserve after staging (default: 64 MiB)",
    )
    args = parser.parse_args()
    try:
        print(json.dumps(retain(args), sort_keys=True))
    except (RetentionError, OSError, ValueError, tarfile.TarError) as error:
        print(f"Frontend asset retention failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

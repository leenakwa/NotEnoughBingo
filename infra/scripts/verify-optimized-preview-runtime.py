#!/usr/bin/env python3
"""Hand off the guarded frontend image and test its preview on the live CI backend.

This checks optimized frontend SSR/hydration over loopback HTTP with development
backend services. It does not verify production backend, TLS or Secure cookies.
"""

import argparse
from contextlib import contextmanager
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid


ARCHIVE_NAME = "frontend-image.tar.gz"
MANIFEST_NAME = "frontend-image-provenance.json"
MAX_ARCHIVE_BYTES = 1_073_741_824
MAX_IMAGE_BYTES = 2_147_483_648
MAX_JSON_BYTES = 65_536
SCOPE = (
    "optimized frontend SSR/hydration against development backend over loopback HTTP"
)
BUILD_METADATA_JS = (
    "const fs=require('node:fs');console.log(JSON.stringify({"
    "node_env:process.env.NODE_ENV,environment:process.env.APP_ENVIRONMENT,"
    "release:process.env.NEXT_PUBLIC_APP_RELEASE,origin:process.env.NEXT_PUBLIC_APP_URL,"
    "api_base_url:process.env.API_BASE_URL,"
    "built_release:fs.readFileSync('.built-release','utf8').trim(),"
    "built_origin:fs.readFileSync('.built-origin','utf8').trim()}))"
)


class Interruption:
    """Record cancellation and defer repeated signals during bounded cleanup."""

    def __init__(self):
        self.signal_number = None
        self.cleaning = False
        self.previous_handlers = {}

    def __enter__(self):
        for signum in (signal.SIGINT, signal.SIGTERM):
            self.previous_handlers[signum] = signal.signal(signum, self.handle)
        return self

    def __exit__(self, error_type, error, traceback):
        for signum, handler in self.previous_handlers.items():
            signal.signal(signum, handler)
        if error_type is None:
            self.raise_if_interrupted()

    def handle(self, signum, frame):
        self.signal_number = signum
        if not self.cleaning:
            self.raise_if_interrupted()

    def raise_if_interrupted(self):
        if self.signal_number is not None:
            raise SystemExit("Optimized preview runner interrupted")

    @contextmanager
    def cleanup(self):
        previous = self.cleaning
        self.cleaning = True
        try:
            yield
        finally:
            self.cleaning = previous


def docker(*args, timeout=30):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=timeout, check=False
    )
    if result.returncode:
        raise ValueError(f"docker {args[0]} failed: {result.stderr[-2000:].strip()}")
    output = result.stdout + result.stderr if args[0] == "logs" else result.stdout
    return output.strip()


def inspect(kind, reference):
    data = json.loads(docker(kind, "inspect", reference))
    if not isinstance(data, list) or len(data) != 1:
        raise ValueError("Expected exactly one Docker inspection result")
    return data[0]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def sha256_file(path, limit):
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(1_048_576):
            size += len(chunk)
            if size > limit:
                raise ValueError(f"{path.name} exceeds its byte limit")
            digest.update(chunk)
    return digest.hexdigest(), size


def validate_build(data, release, origin):
    expected = {
        "node_env": "production",
        "environment": "staging",
        "release": release,
        "origin": origin,
        "built_release": release,
        "built_origin": origin,
        "api_base_url": "http://backend:8000/api/v1",
    }
    if any(data.get(key) != value for key, value in expected.items()):
        raise ValueError(
            "Frontend environment or embedded build differs from the CI build"
        )
    return expected


def validate_image(image, image_id, release):
    if image.get("Id") != image_id or not re.fullmatch(
        r"sha256:[a-f0-9]{64}", image_id
    ):
        raise ValueError("Frontend image ID differs from the exported immutable image")
    labels = image.get("Config", {}).get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != release:
        raise ValueError("Frontend image revision differs from the expected Git SHA")
    if not 0 < image.get("Size", 0) <= MAX_IMAGE_BYTES:
        raise ValueError("Frontend image exceeds the size limit")


def export_image(args, interruption=None):
    interruption = interruption or Interruption()
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    image = inspect("image", args.image)
    image_id = image["Id"]
    validate_image(image, image_id, args.expected_release)
    name = "neb-optimized-export-" + uuid.uuid4().hex
    try:
        metadata = json.loads(
            docker(
                "run",
                "--name",
                name,
                "--pull=never",
                "--network=none",
                "--memory=512m",
                "--cpus=1",
                "--entrypoint=node",
                image_id,
                "-e",
                BUILD_METADATA_JS,
            )
        )
    finally:
        with interruption.cleanup():
            docker("rm", "--force", name, timeout=15)
    interruption.raise_if_interrupted()
    build = validate_build(metadata, args.expected_release, args.expected_origin)
    archive = args.artifact_dir / ARCHIVE_NAME
    with tempfile.TemporaryDirectory(prefix="neb-preview-export-") as temporary:
        raw = Path(temporary) / "frontend-image.tar"
        docker("image", "save", "--output", str(raw), image_id, timeout=180)
        if raw.stat().st_size > MAX_IMAGE_BYTES:
            raise ValueError(
                "Frontend image archive exceeds the uncompressed byte limit"
            )
        with (
            raw.open("rb") as source,
            gzip.open(archive, "wb", compresslevel=6) as target,
        ):
            while chunk := source.read(1_048_576):
                target.write(chunk)
                if archive.stat().st_size > MAX_ARCHIVE_BYTES:
                    raise ValueError(
                        "Compressed frontend archive exceeds the byte limit"
                    )
    archive_digest, archive_size = sha256_file(archive, MAX_ARCHIVE_BYTES)
    provenance = {
        "schema_version": 1,
        "image_id": image_id,
        "expected_release": args.expected_release,
        **build,
        "archive_file": ARCHIVE_NAME,
        "archive_sha256": archive_digest,
        "archive_bytes": archive_size,
        "runner_source_sha256": sha256_file(Path(__file__), MAX_JSON_BYTES)[0],
    }
    write_json(args.artifact_dir / MANIFEST_NAME, provenance)
    print(json.dumps({"image_id": image_id, "archive_bytes": archive_size}))


def load_image(args):
    manifest_path = args.artifact_dir / MANIFEST_NAME
    if manifest_path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError("Image provenance exceeds the JSON byte limit")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError("Unsupported frontend image provenance")
    validate_build(manifest, args.expected_release, args.expected_origin)
    image_id = manifest.get("image_id", "")
    if (
        not isinstance(image_id, str)
        or not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id)
        or manifest.get("expected_release") != args.expected_release
        or manifest.get("archive_file") != ARCHIVE_NAME
        or manifest.get("runner_source_sha256")
        != sha256_file(Path(__file__), MAX_JSON_BYTES)[0]
    ):
        raise ValueError(
            "Image provenance does not match this CI source and artifact contract"
        )
    archive = args.artifact_dir / ARCHIVE_NAME
    digest, size = sha256_file(archive, MAX_ARCHIVE_BYTES)
    if digest != manifest.get("archive_sha256") or size != manifest.get(
        "archive_bytes"
    ):
        raise ValueError(
            "Frontend archive digest or size differs from export provenance"
        )
    # Bound the decompressed stream before passing the validated archive to Docker.
    with gzip.open(archive, "rb") as source:
        total = 0
        while chunk := source.read(1_048_576):
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                raise ValueError("Frontend archive exceeds the uncompressed byte limit")
    docker("image", "load", "--input", str(archive), timeout=180)
    validate_image(inspect("image", image_id), image_id, args.expected_release)
    return manifest


def backend_network():
    backend_id = docker("compose", "ps", "--quiet", "backend")
    if not re.fullmatch(r"[a-f0-9]{64}", backend_id):
        raise ValueError("Expected exactly one running Compose backend")
    backend = inspect("container", backend_id)
    if (
        not backend.get("State", {}).get("Running")
        or backend.get("Config", {}).get("Labels", {}).get("com.docker.compose.service")
        != "backend"
    ):
        raise ValueError("Live backend is not the running Compose backend service")
    environment = dict(
        item.split("=", 1) for item in backend["Config"]["Env"] if "=" in item
    )
    if (
        environment.get("APP_ENVIRONMENT") != "development"
        or environment.get("DJANGO_SETTINGS_MODULE") != "config.settings.development"
    ):
        raise ValueError("Optimized preview requires the existing development backend")
    networks = [
        name
        for name, config in backend["NetworkSettings"]["Networks"].items()
        if "backend" in (config.get("Aliases") or [])
    ]
    if len(networks) != 1:
        raise ValueError(
            "Expected one actual backend network with the backend DNS alias"
        )
    return backend_id, networks[0]


def seed_fixture(backend_id, frontend):
    output = docker(
        "exec",
        "-e",
        "E2E_LIVE=1",
        "-e",
        "E2E_FIXTURE_PASSWORD",
        backend_id,
        "python",
        "manage.py",
        "seed_e2e",
        "--json",
        timeout=120,
    )
    for line in reversed(output.splitlines()):
        if not line.strip().startswith("{"):
            continue
        manifest = json.loads(line)
        if (
            manifest.get("schema_version") == 1
            and manifest.get("users")
            and manifest.get("bingos")
        ):
            write_json(frontend / "test-results" / "live-fixture.json", manifest)
            return
    raise ValueError(
        "The existing seed_e2e command did not return a live fixture manifest"
    )


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError("Frontend readiness must not redirect")


def await_readiness(base):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with opener.open(
                base + "/api/health",
                timeout=max(0.1, min(5, deadline - time.monotonic())),
            ) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.5)
    raise ValueError("Optimized frontend did not become HTTP-ready within 60s")


def run_preview(args, interruption=None):
    interruption = interruption or Interruption()
    frontend = args.workspace / "frontend"
    evidence = frontend / "optimized-preview-evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    summary = {
        "schema_version": 1,
        "scope": SCOPE,
        "expected_release": args.expected_release,
        "runner_source_sha256": sha256_file(Path(__file__), MAX_JSON_BYTES)[0],
        "status": "failed",
    }
    name = "neb-optimized-preview-" + uuid.uuid4().hex
    attempted_create = False
    failed = True
    try:
        exported = load_image(args)
        backend_id, network = backend_network()
        # The command itself retains its DEBUG/test-only guard. No auth logins occur here.
        os.environ.setdefault("E2E_FIXTURE_PASSWORD", "E2E-Local-Password!2026")
        seed_fixture(backend_id, frontend)
        attempted_create = True
        docker(
            "create",
            "--pull=never",
            "--name",
            name,
            "--memory=512m",
            "--cpus=1",
            "--network",
            network,
            "--publish",
            "127.0.0.1::3000",
            "--env",
            "NODE_ENV=production",
            "--env",
            "APP_ENVIRONMENT=staging",
            "--env",
            "API_BASE_URL=http://backend:8000/api/v1",
            exported["image_id"],
        )
        # Keep the image's default entrypoint and CMD, including environment validation.
        docker("start", name)
        runtime = inspect("container", name)
        if runtime.get("Image") != exported["image_id"]:
            raise ValueError(
                "Running optimized container differs from the exported image"
            )
        binding = docker("port", name, "3000/tcp")
        if not re.fullmatch(r"127\.0\.0\.1:\d+", binding):
            raise ValueError("Expected one loopback-only optimized frontend port")
        base = "http://" + binding
        await_readiness(base)
        actual = json.loads(docker("exec", name, "node", "-e", BUILD_METADATA_JS))
        build = validate_build(actual, args.expected_release, args.expected_origin)
        provenance = {
            "schema_version": 1,
            "scope": SCOPE,
            "image_id": runtime["Image"],
            "expected_release": args.expected_release,
            **build,
            "base_url": base,
            "backend_container_id": backend_id,
            "backend_network": network,
            "backend_service_environment": "development",
            "image_archive_sha256": exported["archive_sha256"],
            "runner_source_sha256": exported["runner_source_sha256"],
        }
        provenance_path = evidence / "provenance.json"
        write_json(provenance_path, provenance)
        browser = subprocess.run(
            [
                "npx",
                "--no-install",
                "playwright",
                "test",
                "--config",
                "playwright.optimized-preview.config.ts",
            ],
            cwd=frontend,
            env={
                **os.environ,
                "OPTIMIZED_PREVIEW_BASE_URL": base,
                "OPTIMIZED_PREVIEW_PROVENANCE": str(provenance_path),
            },
            timeout=600,
            check=False,
        )
        summary["browser_exit_code"] = browser.returncode
        if browser.returncode:
            raise ValueError(
                f"Optimized preview browser checks failed with exit {browser.returncode}"
            )
        summary["status"] = "passed"
        failed = False
    except BaseException as error:
        summary["failure_type"] = type(error).__name__
        raise
    finally:
        with interruption.cleanup():
            try:
                if attempted_create:
                    try:
                        if failed:
                            try:
                                logs = docker("logs", "--tail", "60", name, timeout=10)[
                                    -8000:
                                ]
                                (evidence / "frontend-failure.log").write_text(
                                    logs, encoding="utf-8"
                                )
                                print(logs, file=sys.stderr)
                            except (ValueError, subprocess.TimeoutExpired, OSError):
                                print(
                                    "Own optimized preview logs unavailable",
                                    file=sys.stderr,
                                )
                    finally:
                        # Log collection must not prevent removal, even for BaseException.
                        try:
                            docker("rm", "--force", name, timeout=15)
                            summary["container_cleanup"] = "removed"
                        except BaseException:
                            summary["container_cleanup"] = "failed"
                            summary["status"] = "failed"
                            if not failed:
                                raise
                            print(
                                "Own optimized preview cleanup failed", file=sys.stderr
                            )
            finally:
                if interruption.signal_number is not None:
                    summary["status"] = "failed"
                    summary["interruption_signal"] = interruption.signal_number
                write_json(evidence / "runner-result.json", summary)
                # A signal arriving during the first write was deferred as well.
                if interruption.signal_number is not None:
                    summary["status"] = "failed"
                    summary["interruption_signal"] = interruption.signal_number
                    write_json(evidence / "runner-result.json", summary)
    interruption.raise_if_interrupted()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("export", "run"))
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument(
        "--expected-origin", default="https://ci.not-enough-bingo.invalid"
    )
    parser.add_argument("--image")
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    args = parser.parse_args()
    if (
        not re.fullmatch(r"[a-f0-9]{40}", args.expected_release)
        or args.expected_origin != "https://ci.not-enough-bingo.invalid"
        or (args.mode == "export" and not args.image)
    ):
        parser.error("Use the full CI Git SHA, CI build origin and an image for export")
    args.artifact_dir = args.artifact_dir.resolve()
    args.workspace = args.workspace.resolve()
    with Interruption() as interruption:
        if args.mode == "export":
            export_image(args, interruption)
        else:
            run_preview(args, interruption)


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        KeyError,
        TypeError,
        subprocess.TimeoutExpired,
        OSError,
    ) as error:
        raise SystemExit(f"Optimized preview verification failed: {error}") from None

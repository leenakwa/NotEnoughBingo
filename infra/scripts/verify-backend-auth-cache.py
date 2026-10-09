#!/usr/bin/env python3
"""Probe anonymous auth rejection/cache headers through the production image's Gunicorn.

This isolated HTTP gate does not verify successful authentication, database/Redis
availability, public ingress, or shared-cache behavior.
"""

import argparse
import hashlib
import json
import re
import secrets
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

HOST = "ci.not-enough-bingo.invalid"
MAX_OUTPUT_BYTES = 32_768
PROBE = r"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import time

from django.conf import settings

expected_release = os.environ["APP_RELEASE"]
if (
    os.environ.get("DJANGO_SETTINGS_MODULE") != "config.settings.production"
    or settings.SETTINGS_MODULE != "config.settings.production"
    or settings.APP_ENVIRONMENT != "production"
    or settings.DEBUG
    or not settings.SECURE_SSL_REDIRECT
    or settings.APP_RELEASE != expected_release
):
    raise ValueError("Runtime settings differ from production probe configuration")

MAX_BODY_BYTES = 65_536

def fetch(method, path, timeout=5):
    connection = http.client.HTTPConnection("127.0.0.1", 8000, timeout=timeout)
    try:
        headers = {
            "Host": "ci.not-enough-bingo.invalid",
            "X-Forwarded-Proto": "https",
            "Accept": "application/json",
        }
        body = None
        if method == "POST":
            body = b"{}"
            headers["Content-Type"] = "application/json"
        # HTTPConnection follows no redirects and retains no cookies/auth state.
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw_headers = response.getheaders()
        if sum(len(key) + len(value) for key, value in raw_headers) > 16_384:
            raise ValueError("HTTP response headers exceed the byte limit")
        payload = response.read(MAX_BODY_BYTES + 1)
        if len(payload) > MAX_BODY_BYTES:
            raise ValueError("HTTP response body exceeds the byte limit")
        selected = {}
        for key, value in raw_headers:
            key = key.lower()
            if key in {"cache-control", "content-type", "www-authenticate", "location"}:
                if len(value) > 1024 or not value.isprintable():
                    raise ValueError("HTTP response header is not bounded printable text")
                selected.setdefault(key, []).append(value)
        if 300 <= response.status < 400 or "location" in selected:
            raise ValueError("Probe response redirected")
        return response.status, selected, payload
    finally:
        connection.close()


def check(method, path, expected_status, private):
    status, headers, body = fetch(method, path)
    if status != expected_status:
        raise ValueError(f"{method} {path}: expected {expected_status}, got {status}")
    directives = {
        part.strip().lower().split("=", 1)[0]
        for value in headers.get("cache-control", [])
        for part in value.split(",")
        if part.strip()
    }
    if private:
        if not {"private", "no-store"}.issubset(directives) or "public" in directives:
            raise ValueError(f"{method} {path}: private/no-store cache protection missing")
    elif {"private", "no-store"} & directives:
        raise ValueError("Anonymous non-auth 404 unexpectedly received private/no-store")
    if expected_status in {401, 403}:
        content_types = headers.get("content-type", [])
        if len(content_types) != 1 or content_types[0].split(";", 1)[0] != "application/json":
            raise ValueError("Auth rejection must have a JSON content type")
        payload = json.loads(body)
        error = payload.get("error") if isinstance(payload, dict) else None
        if not isinstance(error, dict) or not isinstance(error.get("message"), str):
            raise ValueError("Auth rejection lacks the application error envelope")
        detail = error["message"]
        expected_code = "not_authenticated" if status == 401 else "permission_denied"
        if error.get("code") != expected_code:
            raise ValueError("Auth rejection has an unexpected application error code")
        if status == 401 and headers.get("www-authenticate") != ['Session realm="api"']:
            raise ValueError("Anonymous rejection lacks the Session authentication challenge")
        if status == 403 and not detail.startswith("CSRF Failed:"):
            raise ValueError("Login rejection did not originate from CSRF enforcement")
    return {"method": method, "path": path, "status": status, "headers": headers}


deadline = time.monotonic() + 60
while True:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError("Production Gunicorn did not become HTTP-live within 60s")
    try:
        status, _, body = fetch("GET", "/api/v1/health/live/", min(2, remaining))
    except (OSError, http.client.HTTPException):
        time.sleep(min(0.25, max(0, deadline - time.monotonic())))
        continue
    if status != 200 or json.loads(body) != {"status": "ok"}:
        raise ValueError("Liveness response did not match its HTTP/JSON contract")
    break

routes = [
    check("GET", "/api/v1/auth/me/", 401, True),
    check("POST", "/api/v1/auth/login/", 403, True),
    check("GET", "/api/v1/auth/__cache_probe_missing__/", 404, True),
    check("GET", "/api/v1/__cache_probe_missing__/", 404, False),
]
print(json.dumps({
    "settings_module": settings.SETTINGS_MODULE,
    "app_environment": settings.APP_ENVIRONMENT,
    "debug": settings.DEBUG,
    "configured_release": expected_release,
    "liveness_status": status,
    "middleware_source_sha256": hashlib.sha256(
        Path("apps/common/middleware.py").read_bytes()
    ).hexdigest(),
    "routes": routes,
}))
"""


def docker(*args, timeout=20):
    executable = shutil.which("docker")
    if executable is None:
        raise ValueError("Docker executable is unavailable")
    result = subprocess.run(  # noqa: S603 - fixed Docker commands, no shell evaluation.
        [executable, *args], capture_output=True, text=True, timeout=timeout, check=False
    )
    if result.returncode:
        # Docker errors can echo create arguments, including synthetic credentials.
        raise ValueError(f"docker {args[0]} failed (exit {result.returncode})")
    output = result.stdout + result.stderr if args[0] == "logs" else result.stdout
    if len(output.encode()) > MAX_OUTPUT_BYTES:
        if args[0] != "logs":
            raise ValueError(f"docker {args[0]} output exceeds the byte limit")
        output = output[-8000:]
    return output.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--expected-release", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.expected_release):
        parser.error("Use a full Git SHA for --expected-release")
    environment = {
        "APP_ENVIRONMENT": "production",
        "APP_RELEASE": args.expected_release,
        "DEBUG": "false",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(48),
        "ALLOWED_HOSTS": HOST,
        "CSRF_TRUSTED_ORIGINS": "https://" + HOST,
        "CORS_ALLOWED_ORIGINS": "https://" + HOST,
        "FRONTEND_URL": "https://" + HOST,
        "DATABASE_URL": "postgresql://probe:probe@127.0.0.1:5432/probe",
        "CACHE_BACKEND": "django.core.cache.backends.redis.RedisCache",
        "REDIS_URL": "redis://127.0.0.1:6379/0",
        "USE_S3": "true",
        "S3_ACCESS_KEY": secrets.token_urlsafe(24),
        "S3_SECRET_KEY": secrets.token_urlsafe(24),
        "S3_BUCKET": "ci-auth-cache-probe",
        "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "EMAIL_HOST": "smtp.ci.invalid",
        "EMAIL_USE_TLS": "true",
        "DEFAULT_FROM_EMAIL": "probe@ci.invalid",
        "TRUSTED_PROXY_HOPS": "1",
        "SECURE_SSL_REDIRECT": "true",
    }
    name = "neb-auth-cache-" + uuid.uuid4().hex
    attempted_create = False
    failed = True
    report = None
    try:
        image_id = docker("image", "inspect", args.image, "--format", "{{.Id}}")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id):
            raise ValueError("Expected exactly one immutable local image ID")
        image_config = json.loads(
            docker("image", "inspect", image_id, "--format", "{{json .Config}}")
        )
        defaults = [
            value for value in image_config["Env"] if value.startswith("DJANGO_SETTINGS_MODULE=")
        ]
        command = image_config.get("Cmd") or []
        if (
            defaults != ["DJANGO_SETTINGS_MODULE=config.settings.production"]
            or image_config.get("Entrypoint") != ["/app/docker-entrypoint.sh"]
            or len(command) < 2
            or command[:2] != ["gunicorn", "config.wsgi:application"]
        ):
            raise ValueError("Image defaults must select production settings and Gunicorn")
        attempted_create = True
        docker(
            "create",
            "--pull=never",
            "--name",
            name,
            "--memory=512m",
            "--cpus=1",
            "--network=none",
            *[item for key, value in environment.items() for item in ("--env", f"{key}={value}")],
            image_id,
        )
        runtime = json.loads(docker("inspect", name, "--format", "{{json .}}"))
        if (
            runtime["Image"] != image_id
            or runtime["Config"]["Entrypoint"] != image_config["Entrypoint"]
            or runtime["Config"]["Cmd"] != command
            or runtime["HostConfig"]["NetworkMode"] != "none"
            or runtime["HostConfig"].get("PortBindings")
        ):
            raise ValueError("Probe container differs from isolated image defaults")
        docker("start", name)
        report = json.loads(docker("exec", name, "python", "-c", PROBE, timeout=90))
        if report.get("configured_release") != args.expected_release:
            raise ValueError("Probe release differs from the requested CI release")
        report.update(
            {
                "image_id": image_id,
                "expected_ci_release": args.expected_release,
                "release_origin": (
                    "supplied probe environment; embedded backend release is unverified"
                ),
                "probe_source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "scope": (
                    "production Gunicorn anonymous rejection and unmatched-route cache headers"
                ),
                "unverified": [
                    "successful authentication",
                    "database/Redis",
                    "public ingress",
                    "shared caches",
                ],
            }
        )
        failed = False
    finally:
        if attempted_create:
            if failed:
                try:
                    logs = docker("logs", "--tail", "30", name, timeout=10)[-8000:]
                    for value in environment.values():
                        if len(value) >= 10:
                            logs = logs.replace(value, "[probe-value]")
                    print(logs, file=sys.stderr)
                except (ValueError, subprocess.TimeoutExpired, OSError):
                    print("Own probe container logs unavailable", file=sys.stderr)
            try:
                docker("rm", "--force", name, timeout=15)
            except (ValueError, subprocess.TimeoutExpired, OSError):
                if not failed:
                    raise ValueError("Own probe container cleanup failed") from None
                print("Own probe container cleanup failed", file=sys.stderr)
    # Success is emitted only after the disposable container has been removed.
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        subprocess.TimeoutExpired,
        OSError,
        KeyError,
        TypeError,
    ) as error:
        # TimeoutExpired can include command arguments; do not print it.
        detail = str(error) if isinstance(error, ValueError) else type(error).__name__
        raise SystemExit(f"Backend auth/cache verification failed: {detail}") from None

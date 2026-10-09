#!/usr/bin/env python3
"""Rehearse immutable old/new backend images in an isolated, disposable local stack.

Example: python3 infra/scripts/rehearse-mixed-release.py --old-ref OLD_SHA --new-ref NEW_SHA --keep
Only the fixed nebrollout-a3 Compose project is created or removed. Development
settings permit loopback HTTP/local mail; this is not a target deployment test.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import io
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

PROJECT = "nebrollout-a3"
WORK = Path("/tmp/neb-rollout-a3")
REPOSITORY = Path(__file__).resolve().parents[2]
JSON_MARKER = "NEB_ROLLOUT_JSON "
OWNER = {"project": PROJECT, "schema": 1}


class RehearsalError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise RehearsalError("Unexpected HTTP redirect in the isolated API rehearsal")


def redact(value: str, private_values: list[str]) -> str:
    for private in sorted(set(private_values), key=len, reverse=True):
        if private:
            value = value.replace(private, "[REDACTED]")
    return re.sub(r"([?&](?:token|uid)=)[^\s\"'<>\\&]+", r"\1[REDACTED]", value)


def extract_backend(archive: bytes, destination: Path) -> None:
    """Accept only regular backend files from the requested Git archive."""
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        for member in bundle.infolist():
            name = PurePosixPath(member.filename)
            mode = member.external_attr >> 16
            if (
                name.is_absolute()
                or ".." in name.parts
                or not name.parts
                or name.parts[0] != "backend"
                or (mode & 0o170000) == 0o120000
            ):
                raise RehearsalError("Git archive contains an unsupported backend path")
            target = destination.joinpath(*name.parts)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("wb") as output:
                    output.write(bundle.read(member))
                target.chmod(0o755 if mode & 0o111 else 0o644)


def verification_token(detail: dict, origin: str) -> str:
    """Read a captured email; never visit a link or return its bearer URL."""
    body = detail.get("Text") or detail.get("text") or detail.get("HTML") or detail.get("html")
    if not isinstance(body, str):
        raise RehearsalError("Mailpit message has no readable verification body")
    tokens = set()
    for match in re.findall(r"https?://[^\s\"'<>]+", body):
        url = urllib.parse.urlsplit(match)
        query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
        if url.path != "/verify-email":
            continue
        if (
            f"{url.scheme}://{url.netloc}" != origin
            or url.username
            or url.password
            or url.fragment
            or set(query) != {"token"}
            or len(query["token"]) != 1
            or not re.fullmatch(r"[A-Za-z0-9_-]{32,200}", query["token"][0])
        ):
            raise RehearsalError("Captured verification link differs from the isolated origin")
        tokens.add(query["token"][0])
    if len(tokens) != 1:
        raise RehearsalError("Captured mail must contain one unambiguous verification token")
    return tokens.pop()


def private_file(path: Path, text: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(text)


class ApiClient:
    def __init__(self, port: int):
        self.origin = f"http://localhost:{port}"
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies), NoRedirect()
        )

    def request(self, path: str, *, data=None, csrf=True, expected=200):
        headers = {"Accept": "application/json", "Origin": self.origin}
        if data is not None:
            headers["Content-Type"] = "application/json"
            if csrf:
                cookie = next((row for row in self.cookies if row.name == "neb_csrf"), None)
                if cookie is None:
                    raise RehearsalError("A genuine CSRF cookie is required before an unsafe call")
                headers["X-CSRFToken"] = cookie.value
        request = urllib.request.Request(
            self.origin + path,
            data=None if data is None else json.dumps(data).encode(),
            headers=headers,
        )
        try:
            response = self.opener.open(request, timeout=10)
        except urllib.error.HTTPError as response_error:
            response = response_error
        with response:
            status = response.code
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise RehearsalError("Isolated API response exceeds the rehearsal limit")
        if status != expected:
            # Response bodies can contain credentials/links; do not print them.
            raise RehearsalError(f"{path} returned HTTP {status}; expected {expected}")
        return json.loads(raw) if raw else None

    def csrf(self):
        result = self.request("/api/v1/auth/csrf/")
        if not isinstance(result.get("csrf"), str):
            raise RehearsalError("CSRF endpoint did not return a masked token")
        if not any(row.name == "neb_csrf" for row in self.cookies):
            raise RehearsalError("CSRF endpoint did not issue the real cookie")


class Rehearsal:
    def __init__(self, args):
        self.args = args
        self.private: list[str] = []
        self.owned = False
        self.compose = [
            "docker",
            "compose",
            "--project-name",
            PROJECT,
            "--file",
            str(WORK / "compose.json"),
        ]
        self.report = {
            "project": PROJECT,
            "settings_module": "config.settings.development",
            "production_image_target": True,
            "target_deployment_verified": False,
            "backend_origin": f"http://localhost:{args.backend_port}",
            "frontend_origin": f"http://localhost:{args.frontend_port}",
            "mailpit_origin": f"http://localhost:{args.mailpit_port}",
            "images": {},
            "stages": [],
        }
        self.stage = "preflight"

    def emit(self, stage: str, **evidence):
        self.stage = stage
        row = {"stage": stage, **evidence}
        self.report["stages"].append(row)
        self.save_report()
        print(json.dumps(row), flush=True)

    def save_report(self):
        if self.owned:
            (WORK / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")

    def command(self, args, *, label: str, stdin=None, timeout=600):
        self.stage = label
        path = WORK / f"{label}.log"
        try:
            result = subprocess.run(
                args,
                cwd=REPOSITORY,
                input=stdin,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            captured = error.stdout or b""
            if isinstance(captured, bytes):
                captured = captured.decode(errors="replace")
            path.write_text(redact(captured, self.private))
            raise RehearsalError(f"{label} timed out; inspect {path}") from None
        path.write_text(redact(result.stdout, self.private))
        if result.returncode:
            raise RehearsalError(f"{label} failed with exit {result.returncode}; inspect {path}")
        return result.stdout

    def compose_command(self, *args, label: str, stdin=None, timeout=600):
        return self.command([*self.compose, *args], label=label, stdin=stdin, timeout=timeout)

    def django(self, code: str, label: str):
        source = (
            "import django, json\ndjango.setup()\n"
            + code
            + f"\nprint({JSON_MARKER!r} + json.dumps(result))\n"
        )
        output = self.compose_command(
            "run",
            "--rm",
            "--no-deps",
            "-T",
            "new-web",
            "python",
            "-",
            label=label,
            stdin=source,
        )
        rows = [
            row[len(JSON_MARKER) :] for row in output.splitlines() if row.startswith(JSON_MARKER)
        ]
        if len(rows) != 1:
            raise RehearsalError(f"{label} did not return one safe evidence record")
        return json.loads(rows[0])

    def snapshot(self, label: str):
        return self.django(
            """from apps.accounts.models import User, EmailVerification, SessionMetadata
from django.contrib.sessions.models import Session
from django.db.migrations.recorder import MigrationRecorder
from django.conf import settings
result = {
 'accounts_0006_applied': MigrationRecorder.Migration.objects.filter(
     app='accounts', name='0006_emailverification_delivery'
 ).exists(),
 'debug': settings.DEBUG,
 'users': [{
     'pk': u.pk, 'public_id': str(u.public_id), 'email': u.email, 'username': u.username,
     'active': u.is_active, 'verified': u.email_verified_at is not None,
 } for u in User.objects.order_by('pk')],
 'verifications': [{
     'pk': v.pk, 'user_id': v.user_id, 'used': v.used_at is not None,
     'delivery_empty': v.delivery == {}, 'delivery_status': v.delivery.get('status'),
     'token_scheme': v.delivery.get('token_scheme'),
     'pending_password': bool(v.pending_password_hash),
 } for v in EmailVerification.objects.order_by('pk')],
 'active_session_metadata': SessionMetadata.objects.filter(revoked_at__isnull=True).count(),
 'durable_sessions': Session.objects.count(),
}
""",
            label,
        )

    def broker(self, email: str, legacy: bool, label: str):
        task_name = "send_verification_email" if legacy else "send_verification_notification"
        return self.django(
            f"""import base64, hashlib, redis
from django.conf import settings
from apps.accounts.models import EmailVerification
verification = EmailVerification.objects.get(email={email!r}, used_at__isnull=True)
messages = redis.Redis.from_url(settings.CELERY_BROKER_URL).lrange('celery', 0, -1)
assert len(messages) == 1, 'Expected exactly one isolated queued registration job'
message = json.loads(messages[0])
args, kwargs, embeds = json.loads(base64.b64decode(message['body']))
expected_task = 'apps.accounts.tasks.' + {task_name!r}
assert message['headers']['task'] == expected_task
assert not kwargs and len(args) == {2 if legacy else 1}
assert args[0] == verification.pk
"""
            + (
                "assert isinstance(args[1], str)\n"
                "assert hashlib.sha256(args[1].encode()).hexdigest() == verification.token_hash\n"
                if legacy
                else ""
            )
            + "result = {'task': expected_task, 'argument_count': len(args),\n"
            + " 'verification_id': verification.pk, 'queued_messages': len(messages),\n"
            + " 'matches_durable_row': True}\n",
            label,
        )

    def wait_ready(self, stage: str):
        client = ApiClient(self.args.backend_port)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                result = client.request("/api/v1/health/ready/")
                if result.get("status") != "ok" or result.get("checks") != {
                    "database": "ok",
                    "migrations": "ok",
                    "cache": "ok",
                }:
                    raise RehearsalError("Readiness dependency checks did not all pass")
                self.emit(stage, readiness=result)
                return
            except (urllib.error.URLError, OSError, RehearsalError):
                time.sleep(1)
        raise RehearsalError(f"{stage} did not become ready within 90 seconds")

    def mail(self, email: str):
        opener = urllib.request.build_opener(NoRedirect())
        origin = self.report["mailpit_origin"]
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            with opener.open(origin + "/api/v1/messages?limit=100", timeout=10) as response:
                payload = json.load(response)
            for row in payload.get("messages", payload.get("Messages", [])):
                recipients = row.get("To", row.get("to", []))
                if not any(
                    recipient.get("Address", recipient.get("address")) == email
                    for recipient in recipients
                ):
                    continue
                identifier = row.get("ID", row.get("Id", row.get("id")))
                if not isinstance(identifier, str):
                    continue
                path = "/api/v1/message/" + urllib.parse.quote(identifier, safe="")
                with opener.open(origin + path, timeout=10) as response:
                    token = verification_token(json.load(response), self.report["frontend_origin"])
                self.private.append(token)
                return token
            time.sleep(0.5)
        raise RehearsalError("The expected registration mail did not arrive within 60 seconds")

    def mailbox_count(self):
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(
            self.report["mailpit_origin"] + "/api/v1/messages?limit=100", timeout=10
        ) as response:
            payload = json.load(response)
        return len(payload.get("messages", payload.get("Messages", [])))

    def initialize(self):
        if WORK.exists():
            raise RehearsalError(
                f"{WORK} already exists; use --cleanup for the owned previous drill"
            )
        WORK.mkdir(mode=0o700)
        private_file(WORK / "owner.json", json.dumps(OWNER))
        self.owned = True
        self.command(["docker", "info", "--format", "{{.ServerVersion}}"], label="docker-preflight")
        self.command(["docker", "compose", "version"], label="compose-preflight")
        for kind, command in (
            ("containers", ["docker", "ps", "--all", "--quiet"]),
            ("volumes", ["docker", "volume", "ls", "--quiet"]),
            ("networks", ["docker", "network", "ls", "--quiet"]),
        ):
            existing = self.command(
                [*command, "--filter", "label=com.docker.compose.project=" + PROJECT],
                label=f"preflight-existing-{kind}",
            ).strip()
            if existing:
                # The new marker does not grant ownership of older Docker resources.
                self.owned = False
                shutil.rmtree(WORK)
                raise RehearsalError(f"Refusing to reuse pre-existing {PROJECT} {kind}")
        for side in ("old", "new"):
            ref = getattr(self.args, f"{side}_ref")
            sha = self.command(
                ["git", "rev-parse", "--verify", "--end-of-options", ref + "^{commit}"],
                label=f"{side}-resolve-ref",
            ).strip()
            if not re.fullmatch(r"[0-9a-f]{40}", sha):
                raise RehearsalError("Requested Git ref did not resolve to a SHA-1 commit")
            self.report["images"][side] = {"git_sha": sha}
        if self.report["images"]["old"]["git_sha"] == self.report["images"]["new"]["git_sha"]:
            raise RehearsalError("Old and new refs must resolve to different commits")
        self.emit("immutable-builds-starting", images=self.report["images"])
        for side in ("old", "new"):
            image = self.report["images"][side]
            override = getattr(self.args, f"{side}_image")
            if override:
                image["tag"] = override
                image["provided_local_image"] = True
                self.inspect_backend_image(side)
                self.emit(f"{side}-provided-production-image-verified", image=dict(image))
                continue
            source = WORK / f"source-{side}"
            archived = subprocess.run(
                ["git", "archive", "--format=zip", image["git_sha"], "backend"],
                cwd=REPOSITORY,
                capture_output=True,
                check=False,
            )
            if archived.returncode:
                raise RehearsalError(f"{side} Git backend archive failed")
            extract_backend(archived.stdout, source)
            image["tag"] = f"{PROJECT}/backend-{side}:{image['git_sha'][:12]}"
            self.command(
                [
                    "docker",
                    "build",
                    "--target",
                    "production",
                    "--label",
                    "org.opencontainers.image.revision=" + image["git_sha"],
                    "--tag",
                    image["tag"],
                    str(source / "backend"),
                ],
                label=f"{side}-production-build",
                timeout=1800,
            )
            self.inspect_backend_image(side)
            self.emit(f"{side}-production-image-built", image=dict(image))
        self.configuration()

    def inspect_backend_image(self, side: str):
        image = self.report["images"][side]
        rows = json.loads(
            self.command(
                ["docker", "image", "inspect", image["tag"]],
                label=f"{side}-image-inspect",
            )
        )
        if len(rows) != 1:
            raise RehearsalError("Provided backend tag must resolve to one local image")
        actual = rows[0]
        image["image_id"] = actual["Id"]
        config = actual["Config"]
        if (
            not re.fullmatch(r"sha256:[0-9a-f]{64}", image["image_id"])
            or config.get("Labels", {}).get("org.opencontainers.image.revision") != image["git_sha"]
            or config.get("User") != "app"
            or config.get("Entrypoint") != ["/app/docker-entrypoint.sh"]
        ):
            raise RehearsalError(
                "Backend image revision/runtime does not match the requested immutable build"
            )
        image["revision_label_verified"] = True

    def configuration(self):
        database_password, django_key = secrets.token_hex(32), secrets.token_hex(48)
        password = "Rehearsal!" + secrets.token_hex(20)
        self.private.extend((database_password, django_key, password))
        backend = {
            "DJANGO_SETTINGS_MODULE": "config.settings.development",
            "DJANGO_SECRET_KEY": django_key,
            "DATABASE_URL": f"postgresql://nebrollout:{database_password}@postgres:5432/nebrollout",
            "REDIS_URL": "redis://redis:6379/0",
            "CACHE_BACKEND": "django.core.cache.backends.redis.RedisCache",
            "CELERY_BROKER_URL": "redis://redis:6379/1",
            "CELERY_RESULT_BACKEND": "redis://redis:6379/2",
            "CELERY_TASK_ALWAYS_EAGER": "false",
            "USE_S3": "false",
            "WAIT_FOR_DATABASE": "1",
            "FRONTEND_URL": self.report["frontend_origin"],
            "ALLOWED_HOSTS": "localhost,127.0.0.1,backend,old-web,new-web",
            "CSRF_TRUSTED_ORIGINS": self.report["backend_origin"]
            + ","
            + self.report["frontend_origin"],
            "CORS_ALLOWED_ORIGINS": self.report["frontend_origin"],
            "TRUSTED_PROXY_HOPS": "0",
            "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "EMAIL_HOST": "mailpit",
            "EMAIL_PORT": "1025",
            "EMAIL_USE_TLS": "false",
            "EMAIL_TIMEOUT_SECONDS": "10",
            "DEFAULT_FROM_EMAIL": "NotEnoughBingo rehearsal <rehearsal@localhost>",
            "SESSION_COOKIE_SECURE": "false",
            "CSRF_COOKIE_SECURE": "false",
            "LOG_LEVEL": "WARNING",
            "SENTRY_DSN": "",
            "APP_ENVIRONMENT": "isolated-rehearsal",
        }
        private_file(
            WORK / "backend.env", "".join(f"{key}={value}\n" for key, value in backend.items())
        )
        private_file(
            WORK / "postgres.env",
            f"POSTGRES_DB=nebrollout\nPOSTGRES_USER=nebrollout\nPOSTGRES_PASSWORD={database_password}\n",
        )
        self.accounts = {
            side: {
                "email": f"rollout_{side}@example.test",
                "username": f"rollout_{side}",
                "password": password,
            }
            for side in ("old", "new")
        }
        private_file(WORK / "credentials.json", json.dumps(self.accounts, indent=2) + "\n")
        web = {
            "env_file": [str(WORK / "backend.env")],
            "init": True,
            "pull_policy": "never",
            "volumes": ["media_data:/app/media"],
            "ports": [f"127.0.0.1:{self.args.backend_port}:8000"],
            "networks": {"default": {"aliases": ["backend"]}},
            "stop_grace_period": "30s",
        }
        services = {
            "postgres": {
                "image": "postgres:16-alpine",
                "env_file": [str(WORK / "postgres.env")],
                "volumes": ["postgres_data:/var/lib/postgresql/data"],
                "healthcheck": {
                    "test": ["CMD-SHELL", "pg_isready -U nebrollout -d nebrollout"],
                    "interval": "2s",
                    "timeout": "5s",
                    "retries": 30,
                },
            },
            "redis": {
                "image": "redis:7-alpine",
                "command": ["redis-server", "--appendonly", "yes"],
                "volumes": ["redis_data:/data"],
                "healthcheck": {
                    "test": ["CMD", "redis-cli", "ping"],
                    "interval": "2s",
                    "timeout": "5s",
                    "retries": 30,
                },
            },
            "mailpit": {
                "image": "axllent/mailpit:v1.30.4",
                "environment": {"MP_DATABASE": "/data/mailpit.db"},
                "volumes": ["mailpit_data:/data"],
                "ports": [f"127.0.0.1:{self.args.mailpit_port}:8025"],
                "healthcheck": {
                    "test": ["CMD", "/mailpit", "readyz"],
                    "interval": "2s",
                    "timeout": "5s",
                    "retries": 30,
                },
            },
        }
        for side in ("old", "new"):
            image = self.report["images"][side]
            services[f"{side}-web"] = {
                **web,
                "image": image["image_id"],
                "environment": {"APP_RELEASE": image["git_sha"]},
            }
        services["new-worker"] = {
            "image": self.report["images"]["new"]["image_id"],
            "pull_policy": "never",
            "init": True,
            "env_file": [str(WORK / "backend.env")],
            "volumes": ["media_data:/app/media"],
            "environment": {"APP_RELEASE": self.report["images"]["new"]["git_sha"]},
            "command": [
                "celery",
                "-A",
                "config",
                "worker",
                "--loglevel=WARNING",
                "--concurrency=1",
                "--hostname=rollout@%h",
            ],
            "stop_grace_period": "30s",
        }
        (WORK / "compose.json").write_text(
            json.dumps(
                {
                    "services": services,
                    "volumes": {
                        name: {}
                        for name in ("postgres_data", "redis_data", "mailpit_data", "media_data")
                    },
                },
                indent=2,
            )
            + "\n"
        )
        self.report["configuration"] = {
            "network": PROJECT + "_default",
            "host_bind_address": "127.0.0.1",
            "source_mounts": False,
            "old_worker_present": False,
            "service_images": {name: service["image"] for name, service in services.items()},
            "private_files_mode": "0600",
            "native_frontend_phase": "root-owned; not part of this harness",
        }
        self.emit("isolated-configuration-written")

    def login(self, client: ApiClient, side: str):
        client.csrf()
        account = self.accounts[side]
        response = client.request(
            "/api/v1/auth/login/", data={"email": account["email"], "password": account["password"]}
        )
        if (
            response["user"]["username"] != account["username"]
            or not response["user"]["email_verified"]
        ):
            raise RehearsalError("Login did not return the expected verified account")
        if not any(row.name == "neb_session" for row in client.cookies):
            raise RehearsalError("Login did not issue a real authenticated session cookie")
        return response["user"]["id"]

    def confirm(self, client: ApiClient, side: str):
        token = self.mail(self.accounts[side]["email"])
        response = client.request("/api/v1/auth/verify-email/", data={"token": token})
        if (
            response["username"] != self.accounts[side]["username"]
            or not response["email_verified"]
        ):
            raise RehearsalError(
                "Mailpit's original verification token did not activate the account"
            )

    def execute(self):
        self.initialize()
        self.compose_command(
            "up", "-d", "--wait", "postgres", "redis", "mailpit", label="isolated-infrastructure-up"
        )
        self.emit("isolated-infrastructure-ready")
        for side in ("old", "new"):
            self.compose_command(
                "run",
                "--rm",
                "--no-deps",
                "-T",
                f"{side}-web",
                "python",
                "manage.py",
                "migrate",
                "--noinput",
                label=f"{side}-migrate",
            )
            self.emit(f"{side}-migrations-applied")
        initial = self.snapshot("forward-schema-empty-snapshot")
        if not initial["accounts_0006_applied"] or initial["users"] or initial["verifications"]:
            raise RehearsalError("Forward schema is not a clean isolated migrated database")
        self.emit("forward-schema-before-old-web", snapshot=initial)
        self.compose_command(
            "run",
            "--rm",
            "--no-deps",
            "-T",
            "--user",
            "0",
            "new-web",
            "python",
            "-c",
            "import os; os.chown('/app/media',10001,10001)",
            label="own-media-volume-permissions",
        )
        self.compose_command("up", "-d", "--no-deps", "old-web", label="old-web-on-forward-schema")
        self.wait_ready("old-web-forward-schema-ready")
        old_client = ApiClient(self.args.backend_port)
        old_client.csrf()
        old_client.request(
            "/api/v1/auth/register/", data=self.accounts["old"], csrf=False, expected=403
        )
        old_client.request("/api/v1/auth/register/", data=self.accounts["old"], expected=202)
        pending = self.snapshot("old-registration-pending-snapshot")
        if (
            len(pending["verifications"]) != 1
            or not pending["verifications"][0]["delivery_empty"]
            or pending["verifications"][0]["used"]
            or not pending["verifications"][0]["pending_password"]
        ):
            raise RehearsalError(
                "Legacy registration did not retain the migrated empty delivery default"
            )
        if (
            len(pending["users"]) != 1
            or pending["users"][0]["active"]
            or pending["users"][0]["verified"]
        ):
            raise RehearsalError("Old registration unexpectedly activated its pending account")
        mail_count = self.mailbox_count()
        if mail_count != 0:
            raise RehearsalError("Registration mail arrived while the isolated worker was stopped")
        self.emit(
            "legacy-registration-queued-worker-stopped",
            csrf_rejection=403,
            registration=202,
            mailpit_messages=mail_count,
            snapshot=pending,
            broker=self.broker(self.accounts["old"]["email"], True, "legacy-broker-message"),
        )
        self.compose_command(
            "up", "-d", "--no-deps", "new-worker", label="new-worker-consumes-legacy-job"
        )
        self.confirm(old_client, "old")
        old_id = self.login(old_client, "old")
        self.emit(
            "new-worker-legacy-mail-old-web-confirm-login",
            confirmation=200,
            login=200,
            public_id=old_id,
        )
        self.compose_command("stop", "new-worker", "old-web", label="prepare-new-web-switch")
        self.compose_command("rm", "-f", "old-web", label="remove-old-web-before-switch")
        self.compose_command("up", "-d", "--no-deps", "new-web", label="new-web-up")
        self.wait_ready("new-web-forward-schema-ready")
        if old_client.request("/api/v1/auth/me/")["id"] != old_id:
            raise RehearsalError("Old session did not survive the switch to new web")
        new_client = ApiClient(self.args.backend_port)
        new_client.csrf()
        new_client.request("/api/v1/auth/register/", data=self.accounts["new"], expected=202)
        pending = self.snapshot("new-registration-pending-snapshot")
        row = pending["verifications"][-1]
        if (
            len(pending["verifications"]) != 2
            or row["delivery_status"] != "pending"
            or row["token_scheme"] != "hmac_sha256_v1"
            or row["used"]
            or not row["pending_password"]
        ):
            raise RehearsalError("New registration did not persist the recoverable delivery intent")
        if (
            len(pending["users"]) != 2
            or pending["users"][-1]["active"]
            or pending["users"][-1]["verified"]
        ):
            raise RehearsalError("New registration unexpectedly activated its pending account")
        self.emit(
            "new-registration-id-only-job",
            registration=202,
            snapshot=pending,
            broker=self.broker(self.accounts["new"]["email"], False, "new-broker-message"),
        )
        self.compose_command(
            "up", "-d", "--no-deps", "new-worker", label="new-worker-consumes-id-only-job"
        )
        self.confirm(new_client, "new")
        new_id = self.login(new_client, "new")
        before = self.snapshot("new-confirmed-before-rollback-snapshot")
        if len(before["users"]) != 2 or not all(
            row["verified"] and row["active"] for row in before["users"]
        ):
            raise RehearsalError("Both real registration accounts were not durably activated")
        if (
            not all(row["used"] for row in before["verifications"])
            or before["verifications"][-1]["delivery_status"] != "sent"
        ):
            raise RehearsalError("New delivery was not durably marked sent before rollback")
        self.emit(
            "new-mail-confirm-login-durable-sent",
            confirmation=200,
            login=200,
            public_id=new_id,
            snapshot=before,
        )
        self.compose_command("stop", "new-web", label="rollback-stop-new-web")
        self.compose_command("rm", "-f", "new-web", label="rollback-remove-new-web")
        self.compose_command("up", "-d", "--no-deps", "old-web", label="rollback-old-web-up")
        self.wait_ready("rollback-old-web-ready-forward-schema-new-worker")
        for client, expected_id in ((old_client, old_id), (new_client, new_id)):
            if client.request("/api/v1/auth/me/")["id"] != expected_id:
                raise RehearsalError(
                    "An existing authenticated session was lost during web rollback"
                )
        for side, expected_id in (("old", old_id), ("new", new_id)):
            if self.login(ApiClient(self.args.backend_port), side) != expected_id:
                raise RehearsalError(
                    "Fresh login on rolled back old web changed an account identity"
                )
        after = self.snapshot("rollback-preserved-durable-snapshot")
        for field in ("accounts_0006_applied", "users", "verifications"):
            if after[field] != before[field]:
                raise RehearsalError(
                    "Rollback changed a committed account, verification, or forward schema"
                )
        if (
            after["active_session_metadata"] < before["active_session_metadata"]
            or after["durable_sessions"] < before["durable_sessions"]
        ):
            raise RehearsalError("Rollback removed durable authenticated session records")
        self.emit("rollback-durable-records-existing-sessions-fresh-logins", snapshot=after)
        self.inventory()
        self.report["result"] = "passed"
        self.report["kept"] = self.args.keep
        self.emit(
            "mixed-backend-rehearsal-passed",
            retained_old_web=self.args.keep,
            retained_new_worker=self.args.keep,
        )

    def inventory(self):
        inventory = {}
        for service in ("postgres", "redis", "mailpit", "old-web", "new-worker"):
            identifier = self.compose_command(
                "ps", "--quiet", service, label=f"inventory-{service}-id"
            ).strip()
            if not identifier:
                raise RehearsalError(f"Expected retained {service} container is missing")
            raw = json.loads(
                self.command(
                    ["docker", "inspect", identifier], label=f"inventory-{service}-inspect"
                )
            )[0]
            if (
                raw["Config"]["Labels"].get("com.docker.compose.project") != PROJECT
                or not raw["State"]["Running"]
            ):
                raise RehearsalError(
                    "Retained container is outside the owned project or not running"
                )
            mounts = raw["Mounts"]
            if any(
                row["Type"] != "volume" or not row["Name"].startswith(PROJECT + "_")
                for row in mounts
            ):
                raise RehearsalError("Retained container has an unexpected host/external mount")
            if service in {"old-web", "new-worker"}:
                side = "old" if service == "old-web" else "new"
                if (
                    raw["Image"] != self.report["images"][side]["image_id"]
                    or raw["Config"]["User"] != "app"
                ):
                    raise RehearsalError(
                        "Retained backend does not use its immutable non-root production image"
                    )
            inventory[service] = {
                "container_id": raw["Id"],
                "image_id": raw["Image"],
                "mounts": [
                    {"type": row["Type"], "name": row["Name"], "destination": row["Destination"]}
                    for row in mounts
                ],
            }
        self.emit("retained-container-inventory", containers=inventory)


def cleanup(*, remove_files=False):
    owner = WORK / "owner.json"
    if (
        WORK.is_symlink()
        or not owner.is_file()
        or owner.is_symlink()
        or json.loads(owner.read_text()) != OWNER
    ):
        raise RehearsalError("Refusing cleanup without the exact isolated project ownership marker")
    compose_file = WORK / "compose.json"
    if compose_file.exists():
        # Use a minimal fresh definition: never execute a modified Compose file on cleanup.
        cleanup_file = WORK / "cleanup.json"
        cleanup_file.write_text(
            json.dumps(
                {
                    "services": {
                        name: {"image": "scratch"}
                        for name in (
                            "postgres",
                            "redis",
                            "mailpit",
                            "old-web",
                            "new-web",
                            "new-worker",
                        )
                    },
                    "volumes": {
                        name: {}
                        for name in ("postgres_data", "redis_data", "mailpit_data", "media_data")
                    },
                }
            )
        )
        result = subprocess.run(
            [
                "docker",
                "compose",
                "--project-name",
                PROJECT,
                "--file",
                str(cleanup_file),
                "down",
                "--volumes",
                "--remove-orphans",
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=120,
            check=False,
        )
        (WORK / "cleanup.log").write_text(result.stdout)
        if result.returncode:
            raise RehearsalError(f"Owned cleanup failed; inspect {WORK / 'cleanup.log'}")
    if remove_files:
        shutil.rmtree(WORK)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old-ref")
    parser.add_argument("--new-ref")
    parser.add_argument(
        "--old-image", help="Reuse a local production image whose revision label matches --old-ref"
    )
    parser.add_argument(
        "--new-image", help="Reuse a local production image whose revision label matches --new-ref"
    )
    parser.add_argument("--backend-port", type=int, default=18581)
    parser.add_argument("--frontend-port", type=int, default=18580)
    parser.add_argument("--mailpit-port", type=int, default=18525)
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Retain old web/new worker and isolated volumes for root's browser phase",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Remove only the exact owned nebrollout-a3 project and its temporary files",
    )
    args = parser.parse_args()
    if args.cleanup:
        try:
            cleanup(remove_files=True)
        except Exception as error:
            print(
                json.dumps({"project": PROJECT, "cleaned": False, "error": str(error)}),
                file=sys.stderr,
            )
            return 1
        print(json.dumps({"project": PROJECT, "cleaned": True}))
        return 0
    if not args.old_ref or not args.new_ref:
        parser.error("--old-ref and --new-ref are required for an immutable two-version rehearsal")
    ports = (args.backend_port, args.frontend_port, args.mailpit_port)
    if len(set(ports)) != 3 or any(not 1 <= value <= 65535 for value in ports):
        parser.error("Loopback ports must be distinct and between 1 and 65535")
    rehearsal = Rehearsal(args)
    exit_code = 0
    try:
        rehearsal.execute()
    except Exception as error:
        rehearsal.report["result"] = "failed"
        rehearsal.report["failed_stage"] = rehearsal.stage
        rehearsal.report["error"] = redact(str(error), rehearsal.private)
        rehearsal.save_report()
        print(
            json.dumps(
                {"result": "failed", "stage": rehearsal.stage, "error": rehearsal.report["error"]}
            ),
            file=sys.stderr,
        )
        exit_code = 1
    finally:
        if not args.keep and rehearsal.owned:
            try:
                cleanup()
            except Exception as error:
                rehearsal.report["cleanup_error"] = redact(str(error), rehearsal.private)
                rehearsal.report["kept"] = True
                rehearsal.save_report()
                print(
                    json.dumps(
                        {"result": "cleanup_failed", "error": rehearsal.report["cleanup_error"]}
                    ),
                    file=sys.stderr,
                )
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

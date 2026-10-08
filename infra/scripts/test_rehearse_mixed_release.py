"""Pure boundary regressions for the isolated rehearsal; no Docker or database."""

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "mixed_release", Path(__file__).with_name("rehearse-mixed-release.py")
)
rehearsal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rehearsal)


class RehearsalBoundaryTests(unittest.TestCase):
    origin = "http://localhost:18580"
    token = "a" * 64

    def test_original_legacy_and_hmac_mail_links_keep_the_token(self):
        for token in (self.token, "legacy_" + "b" * 36):
            with self.subTest(token_length=len(token)):
                body = (
                    f"Verify:\n{self.origin}/verify-email?token={token}\n"
                    f"Support: {self.origin}/support"
                )
                self.assertEqual(rehearsal.verification_token({"Text": body}, self.origin), token)

    def test_mail_cannot_redirect_credentials_to_a_foreign_origin_or_ambiguous_link(self):
        paths = (
            f"http://elsewhere.test/verify-email?token={self.token}",
            f"http://user:password@localhost:18580/verify-email?token={self.token}",
            f"{self.origin}/verify-email?token={self.token}&token={'b' * 64}",
            f"{self.origin}/verify-email?token={self.token}&extra=1",
            f"{self.origin}/verify-email?token={self.token}#fragment",
            f"{self.origin}/verify-email?token=short",
            f"{self.origin}/verify-email?token={self.token}\n"
            f"{self.origin}/verify-email?token={'b' * 64}",
        )
        for path in paths:
            with self.subTest(path=path.split("?")[0]):
                with self.assertRaises(rehearsal.RehearsalError):
                    rehearsal.verification_token({"Text": path}, self.origin)

    def test_redaction_removes_known_credentials_and_unseen_bearer_queries(self):
        private = "pw!with.special$chars"
        source = f"password={private} http://localhost/x?token={self.token}&uid=abc123 next"
        redacted = rehearsal.redact(source, [private])
        self.assertNotIn(private, redacted)
        self.assertNotIn(self.token, redacted)
        self.assertNotIn("abc123", redacted)
        self.assertIn("next", redacted)

    def test_archive_rejects_parent_escape_absolute_paths_and_symlinks(self):
        for name, mode in (
            ("backend/../../escape", 0o100644),
            ("/backend/file", 0o100644),
            ("backend/link", 0o120777),
        ):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                data = io.BytesIO()
                with zipfile.ZipFile(data, "w") as bundle:
                    entry = zipfile.ZipInfo(name)
                    entry.external_attr = mode << 16
                    bundle.writestr(entry, "outside")
                with self.assertRaises(rehearsal.RehearsalError):
                    rehearsal.extract_backend(data.getvalue(), Path(directory) / "source")
                self.assertFalse((Path(directory) / "escape").exists())

    def test_archive_preserves_executable_entrypoint_without_a_source_mount(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as bundle:
            entry = zipfile.ZipInfo("backend/docker-entrypoint.sh")
            entry.external_attr = 0o100755 << 16
            bundle.writestr(entry, '#!/bin/sh\nexec "$@"\n')
        with tempfile.TemporaryDirectory() as directory:
            rehearsal.extract_backend(data.getvalue(), Path(directory))
            target = Path(directory) / "backend/docker-entrypoint.sh"
            self.assertEqual(target.stat().st_mode & 0o777, 0o755)

    def test_secret_files_are_private_and_existing_files_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.env"
            rehearsal.private_file(path, "secret=value\n")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                rehearsal.private_file(path, "replacement")
            self.assertEqual(path.read_text(), "secret=value\n")

    def test_existing_work_directory_cannot_be_modified_or_implicitly_cleaned(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            report = work / "report.json"
            report.write_text("preserve me")
            argv = ["rehearse", "--old-ref", "old", "--new-ref", "new"]
            with (
                mock.patch.object(rehearsal, "WORK", work),
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(rehearsal, "cleanup") as clean,
                contextlib.redirect_stderr(io.StringIO()),
            ):
                self.assertEqual(rehearsal.main(), 1)
            clean.assert_not_called()
            self.assertEqual(report.read_text(), "preserve me")

    def test_cleanup_rejects_unowned_directory_without_calling_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / "owner.json").write_text(json.dumps({"project": "nebqa", "schema": 1}))
            with (
                mock.patch.object(rehearsal, "WORK", work),
                mock.patch.object(rehearsal.subprocess, "run") as run,
            ):
                with self.assertRaises(rehearsal.RehearsalError):
                    rehearsal.cleanup(remove_files=True)
            run.assert_not_called()
            self.assertTrue(work.exists())

    def test_provided_image_must_match_the_full_requested_revision(self):
        instance = rehearsal.Rehearsal(
            SimpleNamespace(backend_port=18581, frontend_port=18580, mailpit_port=18525)
        )
        sha = "a" * 40
        instance.report["images"]["old"] = {"git_sha": sha, "tag": "provided:old"}
        actual = {
            "Id": "sha256:" + "b" * 64,
            "Config": {
                "User": "app",
                "Entrypoint": ["/app/docker-entrypoint.sh"],
                "Labels": {"org.opencontainers.image.revision": sha},
            },
        }
        with mock.patch.object(instance, "command", return_value=json.dumps([actual])):
            instance.inspect_backend_image("old")
        self.assertEqual(instance.report["images"]["old"]["image_id"], actual["Id"])
        actual["Config"]["Labels"]["org.opencontainers.image.revision"] = "c" * 40
        with mock.patch.object(instance, "command", return_value=json.dumps([actual])):
            with self.assertRaises(rehearsal.RehearsalError):
                instance.inspect_backend_image("old")


if __name__ == "__main__":
    unittest.main()

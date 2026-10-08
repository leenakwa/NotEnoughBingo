"""Asset retention boundary tests: no Docker, database, application or browser."""

import importlib.util
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "frontend_assets", Path(__file__).with_name("retain-frontend-assets.py")
)
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


def metadata(number=1):
    identity = "sha256:" + str(number) * 64
    return {"image_id": identity, "image_reference": identity, "release": str(number) * 40}


class AssetRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name).resolve()
        self.root = self.work / "store"
        self.staging = self.work / "staging"
        self.staging.mkdir()

    def stage(self, files):
        inventory = {}
        for name, body in files.items():
            target = self.staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            # Each Docker export has fresh inodes; do not mutate a previously
            # published hardlink while preparing the next synthetic export.
            target.unlink(missing_ok=True)
            target.write_bytes(body)
            inventory[name] = {"bytes": len(body), "sha256": assets.digest_file(target)}
        return inventory

    def publish(self, files, image=None, budget=1000):
        with assets.locked_store(self.root):
            return assets.publish(self.root, self.staging, image or metadata(), files, budget, 0)

    def archive(self, members):
        archive = self.work / "assets.tar"
        with tarfile.open(archive, "w") as bundle:
            for name, kind, body in members:
                entry = tarfile.TarInfo(name)
                entry.type, entry.size = kind, len(body)
                if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                    entry.linkname = "outside.js"
                bundle.addfile(entry, io.BytesIO(body))
        return archive

    def test_tar_exports_only_regular_public_assets_and_keeps_hashes(self):
        archive = self.archive(
            [
                (".", tarfile.DIRTYPE, b""),
                ("./chunks", tarfile.DIRTYPE, b""),
                ("./chunks/[turbopack]-123.js", tarfile.REGTYPE, b"public javascript"),
                ("./media/font.woff2", tarfile.REGTYPE, b"public font"),
            ]
        )
        files = assets.extract_assets(archive, self.staging, 1000)
        self.assertEqual(set(files), {"chunks/[turbopack]-123.js", "media/font.woff2"})
        self.assertEqual(
            files["media/font.woff2"]["sha256"],
            assets.digest_file(self.staging / "media/font.woff2"),
        )

    def test_tar_rejects_traversal_links_maps_private_files_and_ambiguous_names(self):
        cases = [
            (name, tarfile.REGTYPE)
            for name in (
                "../outside.js",
                "/outside.js",
                "chunks/../../outside.js",
                "chunks//a.js",
                "chunks/%2e%2e.js",
                "chunks\\a.js",
                "chunks/a.js.map",
                ".env",
                "server/key.pem",
                "package.json",
                ".hidden/a.js",
            )
        ] + [("chunks/a.js", kind) for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE)]
        for name, kind in cases:
            with self.subTest(name=name, kind=kind):
                archive = self.archive([(name, kind, b"")])
                with self.assertRaises(assets.RetentionError):
                    assets.extract_assets(archive, self.staging, 1000)
        self.assertEqual(list(self.staging.iterdir()), [])
        self.assertFalse((self.work / "outside.js").exists())

    def test_tar_duplicate_and_byte_limit_fail(self):
        archive = self.archive([("a.js", tarfile.REGTYPE, b"1"), ("a.js", tarfile.REGTYPE, b"2")])
        with self.assertRaises(assets.RetentionError):
            assets.extract_assets(archive, self.staging, 1000)
        archive = self.archive([("b.js", tarfile.REGTYPE, b"too large")])
        with self.assertRaises(assets.RetentionError):
            assets.extract_assets(archive, self.staging, 2)
        self.assertFalse((self.staging / "b.js").exists())

    def test_same_url_same_bytes_is_allowed_and_rollback_keeps_both_releases(self):
        old = self.stage({"chunks/shared.js": b"shared", "chunks/old.js": b"old"})
        self.assertEqual(self.publish(old)["added_files"], 2)
        new = self.stage({"chunks/shared.js": b"shared", "chunks/new.js": b"new"})
        self.assertEqual(self.publish(new, metadata(2))["added_files"], 1)
        self.assertEqual(self.publish(old)["added_files"], 0)
        public = self.root / "public/_next/static/chunks"
        self.assertEqual(
            {path.name for path in public.iterdir()}, {"shared.js", "old.js", "new.js"}
        )
        self.assertEqual(len(list((self.root / "private/releases").glob("*.json"))), 2)
        self.assertEqual((public / "old.js").read_bytes(), b"old")

    def test_url_collision_preflights_entire_release_and_never_replaces_old_bytes(self):
        self.publish(self.stage({"old.js": b"old bytes"}))
        incoming = self.stage({"new.js": b"new", "old.js": b"changed bytes"})
        with self.assertRaises(assets.RetentionError):
            self.publish(incoming, metadata(2))
        self.assertFalse((self.root / "public/_next/static/new.js").exists())
        self.assertEqual((self.root / "public/_next/static/old.js").read_bytes(), b"old bytes")
        self.assertEqual(len(list((self.root / "private/releases").glob("*.json"))), 1)

    def test_budget_and_free_space_fail_before_publishing(self):
        self.publish(self.stage({"old.js": b"old"}))
        incoming = self.stage({"new.js": b"new"})
        with self.assertRaises(assets.RetentionError):
            self.publish(incoming, metadata(2), budget=5)
        with (
            assets.locked_store(self.root),
            mock.patch.object(assets.shutil, "disk_usage", return_value=mock.Mock(free=1)),
        ):
            with self.assertRaises(assets.RetentionError):
                assets.publish(self.root, self.staging, metadata(2), incoming, 1000, 2)
        self.assertFalse((self.root / "public/_next/static/new.js").exists())

    def test_interrupted_publish_keeps_complete_files_and_rerun_repairs_inventory(self):
        self.publish(self.stage({"old.js": b"old"}))
        incoming = self.stage({"first.js": b"first", "second.js": b"second"})
        real_link = os.link
        with mock.patch.object(
            assets.os, "link", side_effect=[None, OSError("interrupted")]
        ) as link:

            def interrupted(source, target):
                if link.call_count == 1:
                    return real_link(source, target)
                raise OSError("interrupted")

            link.side_effect = interrupted
            with self.assertRaises(OSError):
                self.publish(incoming, metadata(2))
        public = self.root / "public/_next/static"
        self.assertEqual((public / "old.js").read_bytes(), b"old")
        self.assertEqual((public / "first.js").read_bytes(), b"first")
        self.assertFalse((public / "second.js").exists())
        self.assertEqual(len(list((self.root / "private/releases").glob("*.json"))), 1)
        self.assertEqual(self.publish(incoming, metadata(2))["added_files"], 1)
        self.assertEqual(len(list((self.root / "private/releases").glob("*.json"))), 2)

    def test_inventory_failure_is_recoverable_without_removing_public_files(self):
        incoming = self.stage({"a.js": b"complete"})
        with (
            assets.locked_store(self.root),
            mock.patch.object(assets, "atomic_json", side_effect=OSError("interrupted inventory")),
        ):
            with self.assertRaises(OSError):
                assets.publish(self.root, self.staging, metadata(), incoming, 1000, 0)
        self.assertEqual((self.root / "public/_next/static/a.js").read_bytes(), b"complete")
        self.assertEqual(self.publish(incoming)["added_files"], 0)

    def test_unowned_directory_and_symlink_cannot_be_modified(self):
        self.root.mkdir()
        sentinel = self.root / "keep.js"
        sentinel.write_text("keep")
        with self.assertRaises(assets.RetentionError), assets.locked_store(self.root):
            pass
        self.assertEqual(sentinel.read_text(), "keep")
        self.assertEqual(set(self.root.iterdir()), {sentinel})
        link = self.work / "linked"
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(assets.RetentionError), assets.locked_store(link):
            pass
        sentinel.unlink()
        with assets.locked_store(self.root):
            pass
        destination = self.root / "public/_next/static/escape"
        destination.symlink_to(self.staging, target_is_directory=True)
        with self.assertRaises(assets.RetentionError):
            self.publish(self.stage({"escape/a.js": b"new"}))
        self.assertFalse((self.staging / "a.js").exists())

    def test_parent_file_conflict_and_tampered_staging_fail_before_publication(self):
        self.publish(self.stage({"parent.js": b"old"}))
        incoming = {
            "new.js": self.stage({"new.js": b"new"})["new.js"],
            "parent.js/a.js": {"bytes": 1, "sha256": "a" * 64},
        }
        with self.assertRaises(assets.RetentionError):
            self.publish(incoming, metadata(2))
        self.assertFalse((self.root / "public/_next/static/new.js").exists())
        incoming = self.stage({"tampered.js": b"expected"})
        (self.staging / "tampered.js").write_bytes(b"modified")
        with self.assertRaises(assets.RetentionError):
            self.publish(incoming, metadata(2))

    def test_image_identity_revision_environment_and_digest_are_exact(self):
        expected = metadata()
        reference = "example.test/frontend@sha256:" + "a" * 64
        image = {
            "Id": expected["image_id"],
            "RepoDigests": [reference],
            "Config": {
                "Labels": {"org.opencontainers.image.revision": expected["release"]},
                "Env": ["NEXT_PUBLIC_APP_RELEASE=" + expected["release"]],
            },
        }
        with mock.patch.object(assets, "command", return_value=json.dumps([image])) as run:
            self.assertEqual(
                assets.inspect_image(expected["image_id"], expected["release"]), expected
            )
            self.assertEqual(
                assets.inspect_image(reference, expected["release"])["image_id"],
                expected["image_id"],
            )
            with self.assertRaises(assets.RetentionError):
                assets.inspect_image("frontend:mutable", expected["release"])
            with self.assertRaises(assets.RetentionError):
                assets.inspect_image(metadata(2)["image_id"], expected["release"])
            image["Config"]["Env"] = ["NEXT_PUBLIC_APP_RELEASE=" + metadata(2)["release"]]
            run.return_value = json.dumps([image])
            with self.assertRaises(assets.RetentionError):
                assets.inspect_image(expected["image_id"], expected["release"])
            image["Config"]["Env"] = ["NEXT_PUBLIC_APP_RELEASE=" + expected["release"]]
            image["Config"]["Labels"]["org.opencontainers.image.revision"] = metadata(2)["release"]
            run.return_value = json.dumps([image])
            with self.assertRaises(assets.RetentionError):
                assets.inspect_image(expected["image_id"], expected["release"])

    def test_embedded_build_release_must_match_the_requested_revision(self):
        archive = self.archive([(".built-release", tarfile.REGTYPE, b"1" * 40 + b"\n")])
        assets.verify_built_release(archive, "1" * 40)
        with self.assertRaises(assets.RetentionError):
            assets.verify_built_release(archive, "2" * 40)

    def test_export_copies_only_public_tree_and_build_marker_without_starting_the_image(self):
        release = self.archive([(".built-release", tarfile.REGTYPE, b"1" * 40 + b"\n")])
        release_data = release.read_bytes()
        public = self.archive([("chunks/a.js", tarfile.REGTYPE, b"public")]).read_bytes()
        identity = metadata()
        container = "a" * 64
        args = SimpleNamespace(
            image=identity["image_id"],
            release=identity["release"],
            asset_dir=str(self.root),
            max_bytes=1000,
            min_free_bytes=0,
        )

        def copy_archive(actual_container, source, target, limit):
            self.assertEqual(actual_container, container)
            self.assertIn(source, {"/app/.built-release", "/app/.next/static/."})
            target.write_bytes(release_data if source == "/app/.built-release" else public)

        with (
            mock.patch.object(assets, "inspect_image", return_value=identity),
            mock.patch.object(
                assets, "command", side_effect=[container, identity["image_id"], ""]
            ) as run,
            mock.patch.object(assets, "docker_archive", side_effect=copy_archive) as copy,
            mock.patch.object(assets.shutil, "disk_usage", return_value=mock.Mock(free=10**9)),
        ):
            report = assets.retain(args)
        self.assertEqual(report["added_files"], 1)
        self.assertEqual(copy.call_count, 2)
        self.assertEqual(
            run.call_args_list,
            [
                mock.call(["docker", "create", identity["image_id"]]),
                mock.call(["docker", "inspect", "--format", "{{.Image}}", container]),
                mock.call(["docker", "rm", container]),
            ],
        )
        self.assertEqual(list((self.root / "private").glob("stage-*")), [])
        inventory = Path(report["inventory"])
        self.assertEqual(inventory.stat().st_mode & 0o777, 0o600)
        self.assertEqual(inventory.parent.stat().st_mode & 0o777, 0o700)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Verify crawler-visible heads from the exact locally built production image."""

import argparse
from html.parser import HTMLParser
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROUTES = (
    "/discover",
    "/explore",
    "/trending",
    "/privacy",
    "/terms",
    "/community-guidelines",
    "/support",
    "/explore?search=board&tags=games&languages=en&ordering=newest&page=2",
)
MAX_HTML_BYTES = 2_097_152


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.closed_head = False
        self.in_title = False
        self.titles = []
        self.meta = {}
        self.links = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "head":
            if self.in_head or self.closed_head:
                raise ValueError("Expected exactly one head")
            self.in_head = True
        if not self.in_head:
            return
        if tag == "title":
            self.titles.append("")
            self.in_title = True
        elif tag == "meta":
            key = attrs.get("property") or attrs.get("name")
            self.meta.setdefault(key, []).append(attrs.get("content", ""))
        elif tag == "link":
            for relation in attrs.get("rel", "").split():
                self.links.setdefault(relation, []).append(attrs.get("href", ""))

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        elif tag == "head" and self.in_head:
            self.in_head = False
            self.closed_head = True

    def handle_data(self, data):
        if self.in_head and self.in_title:
            self.titles[-1] += data


def single(values, label):
    if len(values) != 1 or not values[0].strip():
        raise ValueError(f"{label} must occur exactly once and be nonempty in head")
    return values[0]


def verify_head(html, path, origin):
    head = HeadParser()
    head.feed(html)
    head.close()
    if not head.closed_head:
        raise ValueError("Missing complete head in response source")
    title = single(head.titles, "title")
    description = single(head.meta.get("description", []), "description")
    canonical = origin + path.split("?", 1)[0]
    if single(head.links.get("canonical", []), "canonical") != canonical:
        raise ValueError("Canonical differs from the configured query-free route URL")
    expected = {
        "og:url": canonical,
        "og:type": "website",
        "og:site_name": "Not Enough Bingo",
        "og:title": title,
        "og:description": description,
        "og:image": origin + "/opengraph-image",
        "og:image:width": "1200",
        "og:image:height": "630",
        "og:image:alt": "Not Enough Bingo — create, play, and share community bingo boards",
        "twitter:card": "summary_large_image",
        "twitter:image": origin + "/opengraph-image",
    }
    for name, value in expected.items():
        if single(head.meta.get(name, []), name) != value:
            raise ValueError(f"{name} differs from the shared metadata contract")
    robots = single(head.meta.get("robots", []), "robots")
    if not {"noindex", "nofollow"}.issubset(
        {value.strip().lower() for value in robots.split(",")}
    ):
        raise ValueError("Staging must remain non-indexable and non-followable")
    icons = head.links.get("icon", [])
    if not icons or not any(re.search(r"favicon|icon", value) for value in icons):
        raise ValueError("Missing favicon link in head")
    return {"path": path, "status": 200, "canonical": canonical, "head_assertions": 16}


def docker(*args, timeout=20):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=timeout, check=False
    )
    if result.returncode:
        raise ValueError(f"docker {args[0]} failed: {result.stderr[-2000:].strip()}")
    return (
        result.stdout + result.stderr if args[0] == "logs" else result.stdout
    ).strip()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError("Metadata probe must return HTTP 200 without redirecting")


def fetch(opener, url, timeout=10):
    # Only the randomly published loopback port is requested, never the canonical origin.
    request = urllib.request.Request(  # noqa: S310
        url, headers={"User-Agent": "Twitterbot", "Accept": "text/html"}
    )
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("Metadata response must be HTTP 200")
        body = response.read(MAX_HTML_BYTES + 1)
    if len(body) > MAX_HTML_BYTES:
        raise ValueError("Metadata response exceeds the byte limit")
    return body.decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument("--expected-origin", required=True)
    args = parser.parse_args()
    origin = urllib.parse.urlsplit(args.expected_origin)
    if (
        origin.scheme != "https"
        or not origin.netloc
        or origin.username
        or origin.password
        or origin.path
        or origin.query
        or origin.fragment
        or not re.fullmatch(r"[a-f0-9]{40}", args.expected_release)
    ):
        parser.error("Use a full Git SHA and an HTTPS origin without a trailing slash")
    name = "neb-metadata-" + uuid.uuid4().hex
    attempted_create = False
    failed = True
    try:
        image_id = docker("image", "inspect", args.image, "--format", "{{.Id}}")
        attempted_create = True
        docker(
            "create",
            "--pull=never",
            "--name",
            name,
            "--memory=512m",
            "--cpus=1",
            "--publish",
            "127.0.0.1::3000",
            "--add-host",
            "backend:127.0.0.1",
            "--env",
            "APP_ENVIRONMENT=staging",
            image_id,
        )
        docker("start", name)
        runtime_image = docker("inspect", name, "--format", "{{.Image}}")
        if runtime_image != image_id:
            raise ValueError("Running container differs from the inspected built image")
        provenance = json.loads(
            docker(
                "exec",
                name,
                "node",
                "-e",
                "const fs=require('node:fs');console.log(JSON.stringify({"
                "node_env:process.env.NODE_ENV,environment:process.env.APP_ENVIRONMENT,"
                "release:process.env.NEXT_PUBLIC_APP_RELEASE,origin:process.env.NEXT_PUBLIC_APP_URL,"
                "built_release:fs.readFileSync('.built-release','utf8').trim(),"
                "built_origin:fs.readFileSync('.built-origin','utf8').trim()}))",
            )
        )
        if provenance != {
            "node_env": "production",
            "environment": "staging",
            "release": args.expected_release,
            "origin": args.expected_origin,
            "built_release": args.expected_release,
            "built_origin": args.expected_origin,
        }:
            raise ValueError(
                "Runtime production settings differ from the embedded CI build"
            )
        port = docker("port", name, "3000/tcp")
        if not re.fullmatch(r"127\.0\.0\.1:\d+", port):
            raise ValueError("Expected a single loopback-only published port")
        base = "http://" + port
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )
        deadline = time.monotonic() + 60
        while True:
            try:
                html = fetch(
                    opener,
                    base + ROUTES[0],
                    timeout=max(0.1, min(5, deadline - time.monotonic())),
                )
                break
            except (urllib.error.URLError, TimeoutError, OSError):
                if time.monotonic() >= deadline:
                    raise ValueError(
                        "Production frontend did not become HTTP-ready within 60s"
                    )
                time.sleep(0.5)
        routes = [verify_head(html, ROUTES[0], args.expected_origin)]
        for path in ROUTES[1:]:
            routes.append(
                verify_head(fetch(opener, base + path), path, args.expected_origin)
            )
        print(json.dumps({"image_id": runtime_image, **provenance, "routes": routes}))
        failed = False
    finally:
        if attempted_create:
            if failed:
                try:
                    print(
                        docker("logs", "--tail", "60", name, timeout=10)[-8000:],
                        file=sys.stderr,
                    )
                except (ValueError, subprocess.TimeoutExpired, OSError):
                    print("Own metadata container logs unavailable", file=sys.stderr)
            # Remove only this probe's uniquely named container, including after a start timeout.
            try:
                docker("rm", "--force", name, timeout=15)
            except (ValueError, subprocess.TimeoutExpired, OSError):
                if not failed:
                    raise
                print("Own metadata container cleanup failed", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        subprocess.TimeoutExpired,
        urllib.error.URLError,
        OSError,
    ) as error:
        raise SystemExit(f"Frontend metadata verification failed: {error}") from None

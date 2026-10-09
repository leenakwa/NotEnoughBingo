#!/usr/bin/env python3
"""Walk the public sitemap without credentials; fail on partial or invalid XML."""

import argparse
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
MAX_BYTES = 52_428_800
MAX_ENTRIES = 50_000
MAX_PART = 922_337_203_685_477
STATIC_PATHS = {
    "/discover",
    "/trending",
    "/explore",
    "/privacy",
    "/terms",
    "/community-guidelines",
    "/support",
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError("Sitemap requests must return directly from the expected origin")


class NoDoctype(ET.TreeBuilder):
    def doctype(self, name, public_id, system_id):
        raise ValueError("Sitemap XML must not contain a document type or entity declarations")


def origin(value, allow_local=False):
    url = urllib.parse.urlsplit(value)
    local = allow_local and url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1"}
    if (
        not url.netloc
        or (url.scheme != "https" and not local)
        or url.username
        or url.password
        or url.path not in {"", "/"}
        or url.query
        or url.fragment
    ):
        raise ValueError("Use an HTTPS origin, or explicit loopback HTTP for a local probe")
    return f"{url.scheme}://{url.netloc}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Origin to request, without credentials or a path")
    parser.add_argument("--canonical-origin", help="Expected XML origin; defaults to base_url")
    parser.add_argument("--allow-local-http", action="store_true")
    parser.add_argument(
        "--request-delay", type=float, default=0.6, help="Seconds between child requests"
    )
    args = parser.parse_args()
    base = origin(args.base_url, args.allow_local_http)
    canonical = origin(args.canonical_origin or base, args.allow_local_http)
    if not math.isfinite(args.request_delay) or args.request_delay < 0:
        parser.error("--request-delay must be finite and nonnegative")
    opener = urllib.request.build_opener(NoRedirect())
    report = {"parts": 0, "urls": 0, "bytes": 0, "canonical_origin": canonical}

    def fetch(path):
        # Origins are restricted above; every child path is validated before fetch.
        request = urllib.request.Request(  # noqa: S310
            base + path, headers={"Accept": "application/xml"}
        )
        with opener.open(request, timeout=20) as response:
            if response.status != 200:
                raise ValueError("Sitemap response is not HTTP 200")
            directives = {
                directive.strip().lower()
                for directive in response.headers.get("Cache-Control", "").split(",")
            }
            if "no-store" not in directives:
                raise ValueError("Sitemap must preserve its no-store visibility contract")
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("Sitemap exceeds the protocol byte limit")
        report["bytes"] += len(body)
        # Reject DTDs before expansion; payloads also have a strict byte ceiling.
        return ET.fromstring(body, parser=ET.XMLParser(target=NoDoctype()))  # noqa: S314

    def locations(root, tag):
        if root.tag != f"{{{NAMESPACE}}}{tag}":
            raise ValueError(f"Expected {tag} XML root")
        child_tag = "sitemap" if tag == "sitemapindex" else "url"
        children = root.findall(f"{{{NAMESPACE}}}{child_tag}")
        if len(children) != len(root):
            raise ValueError("Unexpected sitemap XML entry")
        if len(children) > MAX_ENTRIES:
            raise ValueError("Sitemap exceeds the protocol entry limit")
        values = []
        for child in children:
            elements = child.findall(f"{{{NAMESPACE}}}loc")
            if len(elements) != 1 or len(elements[0]):
                raise ValueError("Sitemap entry requires exactly one plain location")
            value = elements[0].text
            if not value or len(value) >= 2048:
                raise ValueError("Sitemap location is missing or too long")
            url = urllib.parse.urlsplit(value)
            if (
                f"{url.scheme}://{url.netloc}" != canonical
                or url.username
                or url.password
                or url.fragment
            ):
                raise ValueError("Sitemap location differs from the canonical origin")
            values.append(value)
        if len(set(values)) != len(values):
            raise ValueError("Duplicate locations within one sitemap document")
        return values

    parts = locations(fetch("/sitemap.xml"), "sitemapindex")
    static = canonical + "/sitemap.xml?part=static"
    if not parts or parts[0] != static or parts.count(static) != 1:
        raise ValueError("Production sitemap index must start with its unique static child")
    previous = -1
    for value in parts:
        url = urllib.parse.urlsplit(value)
        query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
        if url.path != "/sitemap.xml" or set(query) != {"part"} or len(query["part"]) != 1:
            raise ValueError("Unexpected sitemap child location")
        part = query["part"][0]
        if value != canonical + "/sitemap.xml?part=" + part:
            raise ValueError("Noncanonical sitemap child URL")
        if part != "static":
            if (
                not part.isascii()
                or not part.isdecimal()
                or len(part) > 15
                or str(int(part)) != part
                or not previous < int(part) <= MAX_PART
            ):
                raise ValueError("Sitemap parts must be canonical, bounded and increasing")
            previous = int(part)
        time.sleep(args.request_delay)
        urls = locations(fetch(url.path + "?" + url.query), "urlset")
        if part == "static" and set(urls) != {canonical + path for path in STATIC_PATHS}:
            raise ValueError("Static sitemap differs from the required public route set")
        report["parts"] += 1
        report["urls"] += len(urls)
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, urllib.error.URLError, ET.ParseError) as error:
        raise SystemExit(f"Sitemap verification failed: {error}") from None

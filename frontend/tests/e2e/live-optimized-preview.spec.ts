import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test, type Request, type Route } from "@playwright/test";

import type { BingoSummary, Page } from "../../lib/api/types";
import { readLiveFixture } from "./live-fixture";

const DEFAULT_PAGE_SIZE = 24;

function readProvenance(baseURL: string) {
  const source = JSON.parse(
    readFileSync(process.env.OPTIMIZED_PREVIEW_PROVENANCE!, "utf8"),
  ) as Record<string, unknown>;
  expect(source.schema_version).toBe(1);
  expect(source.image_id).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(source.expected_release).toMatch(/^[0-9a-f]{40}$/);
  expect(source.release).toBe(source.expected_release);
  expect(source.built_release).toBe(source.expected_release);
  expect(source.origin).toBe("https://ci.not-enough-bingo.invalid");
  expect(source.built_origin).toBe(source.origin);
  expect(source.node_env).toBe("production");
  expect(source.environment).toBe("staging");
  expect(source.api_base_url).toBe("http://backend:8000/api/v1");
  expect(source.backend_service_environment).toBe("development");
  expect(source.base_url).toBe(baseURL);
  expect(source.image_archive_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(source.backend_container_id).toMatch(/^[0-9a-f]{64}$/);
  expect(source.backend_network).toEqual(expect.any(String));
  // Keep arbitrary runner fields, environment dumps, and credentials out of attachments.
  return Object.fromEntries(
    [
      "schema_version",
      "image_id",
      "expected_release",
      "release",
      "built_release",
      "origin",
      "built_origin",
      "node_env",
      "environment",
      "api_base_url",
      "backend_service_environment",
      "backend_container_id",
      "backend_network",
      "image_archive_sha256",
      "runner_source_sha256",
      "base_url",
    ].map((key) => [key, source[key]]),
  );
}

/** Read the serialized server props, rather than searching HTML for field-name substrings. */
function initialPreviewProps(document: string): Page<BingoSummary> {
  const flight = [...document.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((match) => {
      const push = match[1]?.match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
      if (!push?.[1]) return [];
      const chunk = JSON.parse(push[1]) as unknown[];
      return chunk[0] === 1 && typeof chunk[1] === "string" ? [chunk[1]] : [];
    })
    .join("");
  const rows = new Map<string, unknown>();
  for (const line of flight.split("\n")) {
    const row = line.match(/^([0-9a-f]+):([\[{][\s\S]*)$/);
    if (row?.[1] && row[2]) rows.set(row[1], JSON.parse(row[2]));
  }
  function expand(value: unknown, seen = new Set<string>()): unknown {
    if (typeof value === "string") {
      const reference = value.match(/^\$([0-9a-f]+)$/)?.[1];
      if (reference && rows.has(reference) && !seen.has(reference)) {
        return expand(rows.get(reference), new Set([...seen, reference]));
      }
    }
    if (Array.isArray(value)) return value.map((item) => expand(item, seen));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, expand(item, seen)]),
      );
    }
    return value;
  }
  function find(value: unknown): Page<BingoSummary> | undefined {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const props = value as Record<string, unknown>;
      if (props.initialResult && typeof props.initialResult === "object") {
        return props.initialResult as Page<BingoSummary>;
      }
    }
    for (const item of Object.values(value)) {
      const result = find(item);
      if (result) return result;
    }
  }
  for (const row of rows.values()) {
    const result = find(expand(row));
    if (result) return result;
  }
  throw new Error("The document did not contain serialized initialResult preview props");
}

function isListRequest(request: Request): boolean {
  return (
    request.method() === "GET" &&
    ["/api/v1/feeds/discover/", "/api/v1/bingos/"].includes(new URL(request.url()).pathname)
  );
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
]) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });

    for (const surface of ["discover", "explore"] as const) {
      test(`${surface} renders real previews before scripts and avoids a hydration list GET`, async ({
        page,
        request,
        baseURL,
      }, testInfo) => {
        const bingo = readLiveFixture().bingos.public;
        const evidence: Record<string, unknown> = {
          scope: "Guest optimized frontend against development backend over loopback HTTP",
          surface,
          viewport,
          fixture: { id: bingo.id, title: bingo.title, cellCount: bingo.cell_texts.length },
          measurement: "Decoded document body bytes; browser list GETs only, not server fetches",
        };
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        let phase = "initial";
        const listRequests: {
          phase: string;
          path: string;
          query: string;
          resourceType: string;
          status: number | null;
        }[] = [];
        const recorded = new Map<Request, (typeof listRequests)[number]>();
        page.on("request", (browserRequest) => {
          if (!isListRequest(browserRequest)) return;
          const url = new URL(browserRequest.url());
          const entry = {
            phase,
            path: url.pathname,
            query: url.search,
            resourceType: browserRequest.resourceType(),
            status: null,
          };
          listRequests.push(entry);
          recorded.set(browserRequest, entry);
        });
        page.on("response", (response) => {
          const entry = recorded.get(response.request());
          if (entry) entry.status = response.status();
        });
        evidence.browserListRequests = listRequests;
        evidence.pageErrors = pageErrors;

        let releaseScripts!: () => void;
        const scriptsReady = new Promise<void>((resolve) => {
          releaseScripts = resolve;
        });
        const heldScripts: string[] = [];
        const scriptRoute = async (route: Route) => {
          const url = new URL(route.request().url());
          if (url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js")) {
            heldScripts.push(url.pathname);
            await scriptsReady;
          }
          await route.continue();
        };
        await page.route("**/*", scriptRoute);
        try {
          evidence.provenance = readProvenance(baseURL!);
          expect(await page.context().cookies()).toEqual([]);
          // APIRequestContext calls are real reference reads, outside the browser GET observer.
          const apiPath =
            surface === "discover" ? "/api/v1/feeds/discover/?page=1" : "/api/v1/bingos/";
          const reference = await request.get(apiPath);
          expect(reference.status()).toBe(200);
          const referenceBody = await reference.body();
          const referencePage = JSON.parse(referenceBody.toString("utf8")) as Page<BingoSummary>;
          expect(referencePage.results.length).toBe(
            Math.min(DEFAULT_PAGE_SIZE, referencePage.count),
          );
          const referenceBingo = referencePage.results.find((item) => item.id === bingo.id);
          expect(
            referenceBingo,
            "Seeded public board must be on the default first page",
          ).toBeTruthy();
          expect(referenceBingo!.preview!.cells.map((cell) => cell.text)).toEqual(bingo.cell_texts);
          for (const cell of referenceBingo!.preview!.cells) {
            expect(cell).toHaveProperty("position");
            expect(cell).toHaveProperty("image_asset_id");
          }
          evidence.apiReference = {
            path: apiPath,
            decodedBodyBytes: referenceBody.length,
            totalCount: referencePage.count,
            pageCardCount: referencePage.results.length,
          };

          const response = await page.goto(`/${surface}`, { waitUntil: "commit" });
          expect(response?.status()).toBe(200);
          const card = page.locator(".bingo-card").filter({
            has: page.locator(`.bingo-card__main[href="/bingo/${bingo.id}"]`),
          });
          await expect(card).toBeVisible();
          await expect(card.getByRole("heading", { name: bingo.title, exact: true })).toBeVisible();
          const cells = card.locator(".bingo-card-preview__text");
          await expect(cells).toHaveText(bingo.cell_texts);
          for (let index = 0; index < bingo.cell_texts.length; index += 1) {
            await expect(cells.nth(index)).toBeVisible();
          }
          await expect(page.locator(".bingo-card")).toHaveCount(referencePage.results.length);
          if (surface === "explore") {
            await expect(page.getByRole("searchbox", { name: "Search by title" })).toBeDisabled();
          }
          expect(heldScripts.length, "Next scripts must actually be held").toBeGreaterThan(0);
          expect(listRequests).toEqual([]);

          const documentBody = await response!.body();
          const documentEvidence = {
            decodedBodyBytes: documentBody.length,
            sha256: createHash("sha256").update(documentBody).digest("hex"),
            cardCount: await page.locator(".bingo-card").count(),
            fixturePreviewCellCount: await cells.count(),
            heldNextScriptCount: heldScripts.length,
          };
          evidence.document = documentEvidence;
          const serverProps = initialPreviewProps(documentBody.toString("utf8"));
          expect(serverProps.count).toBe(referencePage.count);
          expect(serverProps.results.map((item) => item.id).sort()).toEqual(
            referencePage.results.map((item) => item.id).sort(),
          );
          const serverBingo = serverProps.results.find((item) => item.id === bingo.id)!;
          expect(serverBingo.preview!.cells.map((cell) => cell.text)).toEqual(bingo.cell_texts);
          let serializedCellCount = 0;
          for (const board of serverProps.results) {
            for (const cell of board.preview?.cells ?? []) {
              expect(cell).not.toHaveProperty("position");
              expect(cell).not.toHaveProperty("image_asset_id");
              serializedCellCount += 1;
            }
          }
          expect(serializedCellCount).toBeGreaterThan(0);
          evidence.document = {
            ...documentEvidence,
            serializedPreviewCellCount: serializedCellCount,
            removedFields: ["position", "image_asset_id"],
          };

          if (surface === "discover") {
            releaseScripts();
            await page.waitForLoadState("load");
            await page.waitForLoadState("networkidle");
            await page.locator("header").getByRole("link", { name: "Log in", exact: true }).click();
            const dialog = page.getByRole("dialog");
            await expect(dialog).toBeVisible();
            await dialog.getByRole("button", { name: "Close account dialog" }).click();
            await expect(dialog).toHaveCount(0);
            await expect(page).toHaveURL(`${baseURL}/discover`);
            evidence.hydrationWitness = "Account dialog opened and closed through client handlers";
          } else {
            releaseScripts();
            await page.waitForLoadState("load");
            await expect(page.getByRole("searchbox", { name: "Search by title" })).toBeEnabled();
            await page.getByRole("searchbox", { name: "Search by title" }).fill(bingo.title);
            await page.waitForLoadState("networkidle");
            evidence.hydrationWitness =
              "Server-disabled search control became enabled and accepted input";
          }
          await expect(cells).toHaveText(bingo.cell_texts);
          await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
          expect(listRequests.filter((entry) => entry.phase === "initial")).toEqual([]);

          if (surface === "explore") {
            phase = "search";
            const absentQuery = `optimized-preview-absent-${randomUUID()}`;
            const searchEvidence: Record<string, unknown>[] = [];
            evidence.searches = searchEvidence;
            async function search(query: string) {
              await page.getByRole("searchbox", { name: "Search by title" }).fill(query);
              const searchResponse = page.waitForResponse((result) => {
                const url = new URL(result.url());
                return (
                  result.request().method() === "GET" &&
                  url.pathname === "/api/v1/bingos/" &&
                  url.searchParams.get("search") === query
                );
              });
              await page.getByRole("button", { name: "Search", exact: true }).click();
              const result = await searchResponse;
              expect(result.status()).toBe(200);
              const matches = (await result.json()) as Page<BingoSummary>;
              expect(new URL(page.url()).searchParams.get("search")).toBe(query);
              await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
              const expectedIds = matches.results.map((item) => item.id).sort();
              let renderedIds: (string | undefined)[] = [];
              await expect
                .poll(async () => {
                  renderedIds = await page
                    .locator(".bingo-card__main")
                    .evaluateAll((links) =>
                      links.map((link) => link.getAttribute("href")?.split("/").at(-1)).sort(),
                    );
                  return renderedIds;
                })
                .toEqual(expectedIds);
              searchEvidence.push({
                query,
                responseCardIds: expectedIds,
                renderedCardIds: renderedIds,
                responseCardCount: matches.results.length,
                status: result.status(),
              });
              return matches;
            }
            // A visible empty state proves the initial SSR results have actually changed.
            const absent = await search(absentQuery);
            expect(absent.count).toBe(0);
            expect(absent.results).toEqual([]);
            await expect(page.getByRole("heading", { name: "No matching bingos" })).toBeVisible();
            await expect(page.locator(".bingo-card")).toHaveCount(0);
            await expect(card).toHaveCount(0);

            const matches = await search(bingo.title);
            expect(matches.results.some((item) => item.id === bingo.id)).toBe(true);
            await expect(card).toBeVisible();
            await expect(cells).toHaveText(bingo.cell_texts);
            // Reject any deferred default-list GET, even after the search phase began.
            expect(listRequests).toHaveLength(2);
            expect(
              listRequests.map((entry) => new URLSearchParams(entry.query).get("search")).sort(),
            ).toEqual([absentQuery, bingo.title].sort());
            for (const entry of listRequests) {
              expect(entry.phase).toBe("search");
              expect(entry.path).toBe("/api/v1/bingos/");
              expect(entry.status).toBe(200);
            }
          } else {
            expect(listRequests).toEqual([]);
          }
          expect(pageErrors).toEqual([]);
        } finally {
          releaseScripts();
          await page.unroute("**/*", scriptRoute);
          await testInfo.attach("optimized-preview-evidence", {
            body: JSON.stringify(evidence, null, 2),
            contentType: "application/json",
          });
        }
      });
    }
  });
}

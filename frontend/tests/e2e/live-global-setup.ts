import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { request as playwrightRequest, type FullConfig } from "@playwright/test";

import {
  authStatePath,
  E2E_FIXTURE_PASSWORD,
  fixtureManifestPath,
  type FixtureRole,
  type LiveFixture,
} from "./live-fixture";

function lastJsonObject(output: string): LiveFixture {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line?.startsWith("{")) continue;
    const parsed = JSON.parse(line) as Partial<LiveFixture>;
    if (parsed.schema_version === 1 && parsed.users && parsed.bingos) {
      return parsed as LiveFixture;
    }
  }
  throw new Error(`The E2E fixture command did not return a manifest.\n${output}`);
}

async function createAuthenticationState(baseURL: string, role: FixtureRole, fixture: LiveFixture) {
  const api = await playwrightRequest.newContext({ baseURL });
  try {
    const csrfResponse = await api.get("/api/v1/auth/csrf/");
    if (!csrfResponse.ok()) {
      throw new Error(`CSRF bootstrap failed with HTTP ${csrfResponse.status()}.`);
    }
    const state = await api.storageState();
    const csrfCookieName = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "neb_csrf";
    const csrf = state.cookies.find((cookie) => cookie.name === csrfCookieName)?.value;
    if (!csrf) throw new Error("The backend did not set the E2E CSRF cookie.");
    const loginResponse = await api.post("/api/v1/auth/login/", {
      data: {
        email: fixture.users[role].email,
        password: E2E_FIXTURE_PASSWORD,
      },
      headers: { "X-CSRFToken": csrf },
    });
    if (!loginResponse.ok()) {
      throw new Error(
        `Fixture login for ${role} failed with HTTP ${loginResponse.status()}: ${await loginResponse.text()}`,
      );
    }
    await api.storageState({ path: authStatePath(role) });
  } finally {
    await api.dispose();
  }
}

export default async function liveGlobalSetup(config: FullConfig) {
  if (process.env.E2E_LIVE !== "1") return;

  const workspace = resolve(process.cwd(), "..");
  const environment = {
    ...process.env,
    E2E_LIVE: "1",
    E2E_FIXTURE_PASSWORD,
  };
  let output: string;
  const override = process.env.E2E_FIXTURE_COMMAND;
  if (override) {
    output = execSync(override, {
      cwd: workspace,
      env: environment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } else {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--project-directory",
        workspace,
        "-f",
        resolve(workspace, "compose.yml"),
        "exec",
        "-T",
        "-e",
        "E2E_LIVE",
        "-e",
        "E2E_FIXTURE_PASSWORD",
        "backend",
        "python",
        "manage.py",
        "seed_e2e",
        "--json",
      ],
      {
        cwd: workspace,
        env: environment,
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      throw new Error(
        [
          "Unable to prepare the live E2E fixture.",
          result.stdout,
          result.stderr,
          "Start the stack first with: docker compose up -d --build",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    output = result.stdout;
  }

  const manifest = lastJsonObject(output);
  mkdirSync(resolve(process.cwd(), "test-results"), { recursive: true });
  writeFileSync(fixtureManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const baseURL = String(
    config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
  ).replace(/\/$/, "");
  const ready = await fetch(`${baseURL}/api/v1/health/ready/`);
  if (!ready.ok) {
    throw new Error(`Backend readiness check failed with HTTP ${ready.status}.`);
  }
  for (const role of ["author", "player", "moderator"] as const) {
    await createAuthenticationState(baseURL, role, manifest);
  }
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const E2E_FIXTURE_PASSWORD = process.env.E2E_FIXTURE_PASSWORD ?? "E2E-Local-Password!2026";

export interface FixtureUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
}

export interface FixtureBingo {
  id: string;
  title: string;
  visibility: "public" | "unlisted" | "private";
  revision_id: string;
  revision_number: number;
  cell_ids: string[];
  cell_texts: string[];
}

export interface LiveFixture {
  schema_version: 1;
  users: {
    author: FixtureUser;
    player: FixtureUser;
    moderator: FixtureUser;
  };
  bingos: {
    public: FixtureBingo;
    unlisted: FixtureBingo;
    private: FixtureBingo;
    revision: FixtureBingo;
  };
  revision_snapshot: {
    bingo_id: string;
    share_id: string;
    title: string;
    revision_number: number;
    selected_cells: string[];
  };
}

export const fixtureManifestPath = resolve(process.cwd(), "test-results", "live-fixture.json");

export type FixtureRole = "author" | "player" | "moderator";

export function authStatePath(role: FixtureRole): string {
  return resolve(process.cwd(), "test-results", `live-auth-${role}.json`);
}

export function readLiveFixture(): LiveFixture {
  return JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as LiveFixture;
}

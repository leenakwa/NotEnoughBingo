import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAllProgressRecovery,
  clearProgressRecovery,
  readProgressRecovery,
  writeProgressRecovery,
} from "@/lib/progress-recovery";

const bingoId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => window.sessionStorage.clear());

describe("play progress recovery", () => {
  it("restores an interrupted selection only for the same account and revision", () => {
    expect(writeProgressRecovery("author-a", bingoId, revisionId, ["cell-one"])).toBe(true);
    expect(readProgressRecovery("author-b", bingoId, revisionId)).toBeNull();
    expect(readProgressRecovery("author-a", bingoId, revisionId)).toEqual(["cell-one"]);
    expect(readProgressRecovery("author-a", bingoId, "new-revision")).toBeNull();

    expect(writeProgressRecovery("author-a", bingoId, revisionId, [])).toBe(true);
    clearProgressRecovery("author-a", bingoId);
    expect(readProgressRecovery("author-a", bingoId, revisionId)).toBeNull();

    writeProgressRecovery("author-a", bingoId, revisionId, ["cell-one"]);
    clearAllProgressRecovery();
    expect(readProgressRecovery("author-a", bingoId, revisionId)).toBeNull();
  });
});

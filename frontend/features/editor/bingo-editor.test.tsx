import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BingoEditor } from "@/features/editor/bingo-editor";
import { writeEditorRecovery } from "@/features/editor/editor-recovery";
import { createEditorState, editorReducer } from "@/features/editor/editor-state";
import { ApiClientError } from "@/lib/api/client";
import { AUTH_SESSION_ENDED_EVENT, AUTH_SIGNED_OUT_EVENT } from "@/lib/auth-events";
import type { BingoDetail, BingoDraft, ExportJob, RevisionCell } from "@/lib/api/types";
import { uploadImage } from "@/lib/uploads";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getDraft: vi.fn(),
  getBingo: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  publishDraft: vi.fn(),
  createExport: vi.fn(),
  getExport: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/lib/uploads", () => ({
  uploadImage: vi.fn(),
}));

vi.mock("@/lib/api/client", () => {
  class MockApiClientError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details: unknown;

    constructor(status: number, payload: { code: string; message: string; details?: unknown }) {
      super(payload.message);
      this.status = status;
      this.code = payload.code;
      this.details = payload.details;
    }
  }
  return {
    ApiClientError: MockApiClientError,
    errorMessage: (error: unknown) =>
      error instanceof Error ? error.message : "The request failed.",
    api: {
      auth: { session: mocks.session },
      bingos: {
        getDraft: mocks.getDraft,
        get: mocks.getBingo,
        createDraft: mocks.createDraft,
        updateDraft: mocks.updateDraft,
        publishDraft: mocks.publishDraft,
      },
      exports: { create: mocks.createExport, get: mocks.getExport },
    },
  };
});

const BINGO_ID = "22222222-2222-4222-8222-222222222222";
const CELL_IMAGE = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "cell_image",
  status: "ready",
  url: "/api/v1/media/cell-image/",
  mime_type: "image/png",
} as const;

function cells(size: number): RevisionCell[] {
  return Array.from({ length: size * size }, (_, position) => ({
    id: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
    row: Math.floor(position / size),
    column: position % size,
    text: "",
    text_color: "#000000",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    background_color: "#ffffff",
    background_opacity: 1,
    image: null,
    image_alt: "",
    image_opacity: 1,
    border_color: "#000000",
    border_width: 1,
    border_style: "solid",
  }));
}

function draft(overrides: Partial<BingoDraft> = {}): BingoDraft {
  const size = overrides.size ?? 3;
  return {
    id: "11111111-1111-4111-8111-111111111111",
    bingo_id: BINGO_ID,
    title: "Draft title",
    description: "",
    language: "en",
    size,
    visibility: "public",
    completion_style: "checkmark",
    board_background: null,
    cover: null,
    tags: [],
    cells: cells(size),
    updated_at: "2026-08-07T10:00:00Z",
    version: 2,
    ...overrides,
  };
}

function responseFromPayload(payload: Record<string, unknown>, version: number): BingoDraft {
  const size = payload.size as number;
  const inputCells = payload.cells as Array<Record<string, unknown>>;
  return draft({
    size,
    title: payload.title as string,
    description: payload.description as string,
    visibility: payload.visibility as BingoDraft["visibility"],
    completion_style: payload.completion_style as BingoDraft["completion_style"],
    cells: inputCells.map((cell, position) => ({
      ...cells(size)[position]!,
      id:
        (cell.id as string | undefined) ??
        `10000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
      row: cell.row as number,
      column: cell.column as number,
      text: cell.text as string,
      text_color: cell.text_color as string,
      bold: cell.bold as boolean,
      italic: cell.italic as boolean,
      underline: cell.underline as boolean,
      strikethrough: cell.strikethrough as boolean,
      background_color: cell.background_color as string,
      background_opacity: cell.background_opacity as number,
      image_opacity: cell.image_opacity as number,
      image_alt: cell.image_alt as string,
      border_color: cell.border_color as string,
      border_width: cell.border_width as number,
      border_style: cell.border_style as RevisionCell["border_style"],
    })),
    version,
    updated_at: `2026-08-07T10:00:0${version}Z`,
  });
}

const bingo = {
  id: BINGO_ID,
  current_revision: { id: "published-revision" },
} as BingoDetail;

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openEditor(bingoId?: string) {
  render(<BingoEditor bingoId={bingoId} />);
  await settle();
  await settle();
}

async function advanceAutosave(milliseconds = 800) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BingoEditor autosave and safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/create");
    window.localStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.session.mockResolvedValue({
      id: "user-id",
      email: "author@example.test",
      username: "author",
      display_name: "Author",
      avatar: null,
      email_verified: true,
      deletion_scheduled_for: null,
    });
    mocks.getDraft.mockResolvedValue(draft());
    mocks.getBingo.mockResolvedValue(bingo);
    mocks.createDraft.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve(responseFromPayload(payload, 1)),
    );
    mocks.updateDraft.mockImplementation(
      (_bingoId: string, payload: Record<string, unknown>, version: number) =>
        Promise.resolve(responseFromPayload(payload, version + 1)),
    );
    mocks.createExport.mockResolvedValue({
      id: "export-id",
      status: "ready",
      download_url: null,
      error: null,
    } as ExportJob);
  });

  it("offers account creation to a guest without opening an editor draft", async () => {
    mocks.session.mockResolvedValueOnce(null);
    await openEditor();

    expect(screen.getByRole("heading", { name: "Create your own bingo", level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fcreate",
    );
    expect(mocks.getDraft).not.toHaveBeenCalled();
  });

  it("shows verification options for an unverified account with a draft link", async () => {
    mocks.session.mockResolvedValueOnce({
      id: "user-id",
      email: "author@example.test",
      username: "author",
      display_name: "Author",
      avatar: null,
      email_verified: false,
      deletion_scheduled_for: null,
    });
    await openEditor(BINGO_ID);

    expect(screen.getByRole("heading", { name: "Verify your email", level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Verification options" })).toBeVisible();
    expect(mocks.getDraft).not.toHaveBeenCalled();
  });

  it("lets the author cancel a pending image transfer without changing the board", async () => {
    vi.mocked(uploadImage).mockImplementation(
      (_file, _kind, options) =>
        new Promise((_resolve, reject) => {
          options?.onPhase?.("uploading");
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Upload cancelled.", "AbortError")),
          );
        }),
    );
    await openEditor();
    fireEvent.change(screen.getByLabelText("Upload background"), {
      target: { files: [new File(["image"], "background.png", { type: "image/png" })] },
    });
    await settle();
    expect(screen.getByText("Uploading image…")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await settle();

    expect(screen.getByText("Upload cancelled.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove background" })).not.toBeInTheDocument();
  });

  it("explains a session connection error and can retry into the editor", async () => {
    mocks.session.mockRejectedValueOnce(new Error("Connection unavailable"));
    await openEditor();

    expect(screen.getByRole("alert")).toHaveTextContent("Connection unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    await settle();
    expect(screen.getByRole("heading", { name: "Create bingo" })).toBeVisible();
    expect(mocks.session).toHaveBeenCalledTimes(2);
  });

  it("debounces rapid new-board edits and transitions dirty to saving to saved", async () => {
    let resolveCreate!: (value: BingoDraft) => void;
    mocks.createDraft.mockImplementation(
      (payload: Record<string, unknown>) =>
        new Promise<BingoDraft>((resolve) => {
          resolveCreate = () => resolve(responseFromPayload(payload, 1));
        }),
    );
    await openEditor();

    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    await advanceAutosave(799);
    expect(mocks.createDraft).not.toHaveBeenCalled();
    await advanceAutosave(1);
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(mocks.createDraft.mock.calls[0]?.[0]).toMatchObject({ size: 7 });
    expect(screen.getByText("Saving…")).toBeVisible();

    await act(async () => resolveCreate(draft({ size: 7, cells: cells(7), version: 1 })));
    await settle();
    expect(screen.getByText("Saved")).toBeVisible();
    expect(window.location.search).toBe(`?bingo=${BINGO_ID}`);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(["leave", "session ends"])("stops a pending creation after %s", async (boundary) => {
    let resolveCreate!: (value: BingoDraft) => void;
    mocks.createDraft.mockReturnValueOnce(
      new Promise<BingoDraft>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const view = render(<BingoEditor />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    if (boundary === "leave") view.unmount();
    else {
      mocks.session.mockResolvedValueOnce(null);
      act(() => window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT)));
      await settle();
    }
    await act(async () => resolveCreate(draft({ size: 6, cells: cells(6), version: 1 })));
    await advanceAutosave(1600);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("does not apply the previous board's pending save to the next editor", async () => {
    let resolveUpdate!: (value: BingoDraft) => void;
    mocks.updateDraft.mockReturnValueOnce(
      new Promise<BingoDraft>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    const nextId = "33333333-3333-4333-8333-333333333333";
    mocks.getDraft.mockResolvedValueOnce(
      draft({ bingo_id: nextId, title: "Next draft", version: 8 }),
    );
    view.rerender(<BingoEditor bingoId={nextId} />);
    await settle();
    await act(async () => resolveUpdate(draft({ size: 4, cells: cells(4), version: 3 })));
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Next draft");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Next draft edit" } });
    await advanceAutosave();
    expect(mocks.updateDraft).toHaveBeenLastCalledWith(
      nextId,
      expect.objectContaining({ title: "Next draft edit" }),
      8,
    );
  });

  it("starts a separate blank board when moving from an existing draft to create", async () => {
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    view.rerender(<BingoEditor />);
    await settle();
    expect(screen.getByRole("heading", { name: "Create bingo" })).toBeVisible();
    expect(screen.getByText("5 × 5")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("does not navigate after a publication completes in a departed editor", async () => {
    const filled = cells(3);
    filled[0]!.text = "Publish this";
    mocks.getDraft.mockResolvedValueOnce(draft({ cells: filled }));
    let resolvePublish!: (value: BingoDetail) => void;
    mocks.publishDraft.mockReturnValueOnce(
      new Promise<BingoDetail>((resolve) => {
        resolvePublish = resolve;
      }),
    );
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    await settle();
    expect(mocks.publishDraft).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolvePublish(bingo));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("stops export polling after leaving the editor", async () => {
    mocks.createExport.mockResolvedValueOnce({ id: "pending-export", status: "pending" });
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.click(screen.getByText("Download published version"));
    fireEvent.click(screen.getByRole("button", { name: "Published PNG" }));
    await settle();
    view.unmount();
    await advanceAutosave(1000);
    expect(mocks.getExport).not.toHaveBeenCalled();
  });

  it("does not recreate purged recovery after a pending save rejects on logout", async () => {
    let rejectCreate!: (error: Error) => void;
    mocks.createDraft.mockReturnValueOnce(
      new Promise<BingoDraft>((_resolve, reject) => {
        rejectCreate = reject;
      }),
    );
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    window.localStorage.clear();
    mocks.session.mockResolvedValueOnce(null);
    act(() => window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT)));
    await settle();
    await act(async () => rejectCreate(new Error("Old save failed")));
    expect(window.localStorage.length).toBe(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not continue publication after its pending save outlives the editor", async () => {
    const filled = cells(3);
    filled[0]!.text = "Publish this";
    mocks.getDraft.mockResolvedValueOnce(draft({ cells: filled }));
    let resolveUpdate!: (value: BingoDraft) => void;
    mocks.updateDraft.mockReturnValueOnce(
      new Promise<BingoDraft>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Pending publication" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    await settle();
    expect(mocks.updateDraft).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () =>
      resolveUpdate(draft({ title: "Pending publication", cells: filled, version: 3 })),
    );
    expect(mocks.publishDraft).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps an upload active during its own first saved-draft URL transition", async () => {
    let uploadSignal: AbortSignal | undefined;
    vi.mocked(uploadImage).mockImplementationOnce((_file, _kind, options) => {
      uploadSignal = options?.signal;
      return new Promise(() => undefined);
    });
    const view = render(<BingoEditor />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    expect(window.location.search).toBe(`?bingo=${BINGO_ID}`);
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Upload background"), {
      target: { files: [new File(["image"], "board.png", { type: "image/png" })] },
    });
    expect(uploadSignal).toBeDefined();
    view.rerender(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    expect(uploadSignal!.aborted).toBe(false);
  });

  it("queues edits made while a save is in flight and persists them afterward", async () => {
    let resolveCreate!: (value: BingoDraft) => void;
    mocks.createDraft.mockImplementation(
      () =>
        new Promise<BingoDraft>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await settle();
    await act(async () => resolveCreate(draft({ size: 6, cells: cells(6), version: 1 })));
    await settle();

    expect(mocks.updateDraft).toHaveBeenCalledTimes(1);
    expect(mocks.updateDraft.mock.calls[0]?.[1]).toMatchObject({ size: 7 });
    expect(mocks.updateDraft.mock.calls[0]?.[2]).toBe(1);
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("keeps failed work dirty and retries with the same idempotent creation", async () => {
    mocks.createDraft
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce((payload: Record<string, unknown>) =>
        Promise.resolve(responseFromPayload(payload, 1)),
      );
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    await settle();

    expect(screen.getByText("Save failed — Retry")).toBeVisible();
    expect(window.localStorage.length).toBeGreaterThan(0);
    const firstKey = mocks.createDraft.mock.calls[0]?.[1];

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    await settle();

    expect(mocks.createDraft).toHaveBeenCalledTimes(2);
    expect(mocks.createDraft.mock.calls[1]?.[1]).toBe(firstKey);
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("does not autosave a hydrated draft until persistent content changes", async () => {
    await openEditor(BINGO_ID);
    expect(screen.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
    await advanceAutosave(1600);
    expect(mocks.updateDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      BINGO_ID,
      expect.objectContaining({ size: 4 }),
      2,
    );
  });

  it("keeps a loaded draft editable when published-download lookup fails and retries it independently", async () => {
    mocks.getBingo.mockRejectedValueOnce(new Error("Published downloads are unavailable."));
    await openEditor(BINGO_ID);
    expect(screen.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Draft title");
    expect(screen.queryByText("Download published version")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Your draft is still editable.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByText("Download published version")).toBeVisible();
    expect(mocks.getDraft).toHaveBeenCalledTimes(1);
    expect(mocks.getBingo).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Title")).toHaveValue("Draft title");
    await advanceAutosave();
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      BINGO_ID,
      expect.objectContaining({ size: 4 }),
      2,
    );
  });

  it("opens and preserves edits before a slow published-download lookup finishes", async () => {
    let resolve: (value: BingoDetail) => void = () => undefined;
    mocks.getBingo.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unsaved current title" },
    });
    expect(screen.getByText("Checking published downloads…")).toBeVisible();
    await act(async () => resolve(bingo));
    expect(screen.getByText("Download published version")).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveValue("Unsaved current title");
    expect(mocks.getDraft).toHaveBeenCalledTimes(1);
  });

  it("requires the draft itself and lets a failed draft load be retried", async () => {
    mocks.getDraft.mockRejectedValueOnce(new Error("Draft is temporarily unavailable."));
    await openEditor(BINGO_ID);
    expect(screen.getByRole("alert")).toHaveTextContent("Draft is temporarily unavailable.");
    expect(screen.queryByRole("button", { name: "Finish creating →" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByRole("button", { name: "Finish creating →" })).toBeEnabled();
    expect(mocks.getDraft).toHaveBeenCalledTimes(2);
    expect(mocks.getBingo).toHaveBeenCalledTimes(1);
  });

  it("does not replace the current draft or download state with late responses from another board", async () => {
    let resolveOldDraft: (value: BingoDraft) => void = () => undefined;
    let resolveOldBingo: (value: BingoDetail) => void = () => undefined;
    const currentId = "33333333-3333-4333-8333-333333333333";
    mocks.getDraft.mockReturnValueOnce(
      new Promise((done) => {
        resolveOldDraft = done;
      }),
    );
    mocks.getDraft.mockResolvedValueOnce(
      draft({ bingo_id: currentId, title: "Current draft", size: 4 }),
    );
    mocks.getBingo.mockReturnValueOnce(
      new Promise((done) => {
        resolveOldBingo = done;
      }),
    );
    mocks.getBingo.mockResolvedValueOnce({ ...bingo, id: currentId, current_revision: null });
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    view.rerender(<BingoEditor bingoId={currentId} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Current draft");
    await act(async () => {
      resolveOldDraft(draft({ title: "Obsolete draft" }));
      resolveOldBingo(bingo);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Current draft");
    expect(screen.queryByText("Download published version")).not.toBeInTheDocument();
    await advanceAutosave(1600);
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("hides the previous board if loading the next draft fails", async () => {
    const view = render(<BingoEditor bingoId={BINGO_ID} />);
    await settle();
    await settle();
    expect(screen.getByRole("button", { name: "Finish creating →" })).toBeEnabled();
    mocks.getDraft.mockRejectedValueOnce(new Error("Next draft is temporarily unavailable."));
    view.rerender(<BingoEditor bingoId="33333333-3333-4333-8333-333333333333" />);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Next draft is temporarily unavailable.");
    expect(screen.queryByRole("button", { name: "Finish creating →" })).not.toBeInTheDocument();
    expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
    await advanceAutosave(1600);
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("preserves local edits on a version conflict and overwrites only after explicit choice", async () => {
    const conflict = new ApiClientError(412, {
      code: "draft_version_conflict",
      message: "The draft changed since it was loaded.",
    });
    mocks.getDraft
      .mockResolvedValueOnce(draft({ version: 2 }))
      .mockResolvedValueOnce(draft({ version: 8 }));
    mocks.updateDraft
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(
        (_bingoId: string, payload: Record<string, unknown>, version: number) =>
          Promise.resolve(responseFromPayload(payload, version + 1)),
      );
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await advanceAutosave();
    await settle();

    expect(screen.getByText("This draft was changed in another session.")).toBeVisible();
    expect(screen.getByText("4 × 4")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Keep and save mine" }));
    await settle();
    await settle();

    expect(mocks.updateDraft).toHaveBeenLastCalledWith(
      BINGO_ID,
      expect.objectContaining({ size: 4 }),
      8,
    );
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("warns before unloading while changes are unsaved", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    await settle();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("requires confirmation before shrinking away customized cells", async () => {
    const customized = cells(5);
    customized[24] = { ...customized[24]!, text: "Do not lose me" };
    mocks.getDraft.mockResolvedValue(draft({ size: 5, cells: customized }));
    vi.mocked(window.confirm).mockReturnValue(false);
    await openEditor(BINGO_ID);

    fireEvent.click(screen.getByRole("button", { name: "Decrease bingo size" }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("remove 1 customized cell"),
    );
    expect(screen.getByText("5 × 5")).toBeVisible();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Decrease bingo size" }));
    expect(screen.getByText("4 × 4")).toBeVisible();
  });

  it("supports undo and redo buttons plus platform keyboard shortcuts", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    expect(screen.getByText("6 × 6")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("5 × 5")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("6 × 6")).toBeVisible();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getByText("5 × 5")).toBeVisible();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(screen.getByText("6 × 6")).toBeVisible();
  });

  it("offers and autosaves emergency recovery from an earlier visit", async () => {
    const recovered = editorReducer(createEditorState(5), { type: "set-size", size: 6 });
    writeEditorRecovery("user-id", recovered);

    await openEditor();
    expect(window.confirm).toHaveBeenCalledWith(
      "We found unsaved changes from an earlier visit. Restore them?",
    );
    expect(screen.getByText("6 × 6")).toBeVisible();

    await advanceAutosave();
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ size: 6 }),
      expect.any(String),
    );
  });

  it("exports the published revision without saving the current draft first", async () => {
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Increase bingo size" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.click(screen.getByText("Download published version"));
    fireEvent.click(screen.getByRole("button", { name: "Published PNG" }));
    await settle();

    expect(mocks.createExport).toHaveBeenCalledWith(BINGO_ID, "png", expect.any(String));
    expect(mocks.updateDraft).not.toHaveBeenCalled();
    expect(screen.getByText(/Downloads use the currently published revision/)).toBeVisible();
  });

  it("guards publication and reuses its key after a lost response", async () => {
    const filledCells = cells(3);
    filledCells[0]!.text = "Publish once";
    mocks.getDraft.mockResolvedValueOnce(draft({ cells: filledCells }));
    let reject!: (error: Error) => void;
    mocks.publishDraft.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    const publish = screen.getByRole("button", { name: "Publish bingo" });
    await act(async () => {
      fireEvent.click(publish);
      fireEvent.click(publish);
    });
    expect(mocks.publishDraft).toHaveBeenCalledOnce();
    const firstKey = mocks.publishDraft.mock.calls[0]![1];
    await act(async () => {
      reject(new Error("The response was lost."));
    });
    mocks.publishDraft.mockResolvedValueOnce(bingo);
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    await settle();
    expect(mocks.publishDraft).toHaveBeenCalledTimes(2);
    expect(mocks.publishDraft.mock.calls[1]![1]).toBe(firstKey);
    expect(mocks.push).toHaveBeenCalledWith(`/bingo/${BINGO_ID}`);
  });

  it("focuses an image-only publication error, preserves the board, and publishes its correction", async () => {
    const imageCells = cells(3);
    imageCells[0]!.text = "Keep this text";
    imageCells[4]!.image = CELL_IMAGE;
    mocks.getDraft.mockResolvedValueOnce(draft({ cells: imageCells }));
    mocks.publishDraft.mockResolvedValueOnce(bingo);
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Row 1, column 1: Keep this text" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));

    const description = screen.getByRole("textbox", { name: "Image description" });
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAttribute("aria-required", "true");
    expect(description).toHaveAccessibleDescription(
      "Required for image-only cells so everyone can understand them. Up to 160 characters. Describe this image-only cell before publishing.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Describe this image-only cell before publishing.",
    );
    expect(screen.getByRole("gridcell", { name: "Row 2, column 2: empty" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("gridcell", { name: "Row 1, column 1: Keep this text" }),
    ).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Saved")).toBeVisible();
    expect(mocks.updateDraft).not.toHaveBeenCalled();
    expect(mocks.publishDraft).not.toHaveBeenCalled();

    fireEvent.change(description, { target: { value: "A blue square" } });
    expect(description).toHaveAttribute("aria-invalid", "false");
    expect(description).toHaveAccessibleDescription(
      "Required for image-only cells so everyone can understand them. Up to 160 characters.",
    );
    expect(
      screen.queryByText("Describe this image-only cell before publishing."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "Row 2, column 2: A blue square" }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Draft title");
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    await settle();

    expect(mocks.updateDraft).toHaveBeenCalledWith(
      BINGO_ID,
      expect.objectContaining({
        cells: expect.arrayContaining([
          expect.objectContaining({ row: 0, column: 0, text: "Keep this text" }),
          expect.objectContaining({
            row: 1,
            column: 1,
            image_asset_id: CELL_IMAGE.id,
            image_alt: "A blue square",
          }),
        ]),
      }),
      2,
    );
    expect(mocks.publishDraft).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith(`/bingo/${BINGO_ID}`);
  });

  it("keeps title and language errors first before opening an invalid image-only cell", async () => {
    const imageCells = cells(3);
    imageCells[0]!.image = CELL_IMAGE;
    mocks.getDraft.mockResolvedValueOnce(draft({ title: "", language: "", cells: imageCells }));
    await openEditor(BINGO_ID);
    fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    const title = screen.getByLabelText("Title");
    expect(title).toHaveFocus();
    expect(title).toHaveAccessibleDescription(
      "Up to 70 characters. Add a title before publishing.",
    );
    expect(screen.queryByRole("textbox", { name: "Image description" })).not.toBeInTheDocument();

    fireEvent.change(title, { target: { value: "Image board" } });
    expect(title).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    const language = screen.getByRole("combobox", { name: "Bingo language" });
    expect(language).toHaveFocus();
    expect(language).toHaveAccessibleDescription("Choose a bingo language before publishing.");
    fireEvent.change(language, { target: { value: "en" } });
    expect(language).toHaveAttribute("aria-invalid", "false");
    expect(
      screen.getByRole("textbox", { name: "Description optional" }),
    ).toHaveAccessibleDescription("Up to 500 characters.");
    expect(screen.getByRole("textbox", { name: "Tag" })).toHaveAccessibleDescription(
      "Up to 40 characters per tag.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
    expect(screen.getByRole("textbox", { name: "Image description" })).toHaveFocus();
    expect(mocks.publishDraft).not.toHaveBeenCalled();
  });

  it.each(["another draft", "blank board", "session check"])(
    "clears image-description publication validation after opening %s",
    async (boundary) => {
      const imageCells = cells(3);
      imageCells[0]!.image = CELL_IMAGE;
      mocks.getDraft.mockResolvedValueOnce(draft({ cells: imageCells }));
      const view = render(<BingoEditor bingoId={BINGO_ID} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Finish creating →" }));
      fireEvent.click(screen.getByRole("button", { name: "Publish bingo" }));
      expect(screen.getByRole("textbox", { name: "Image description" })).toHaveAttribute(
        "aria-invalid",
        "true",
      );

      if (boundary === "another draft") {
        const nextId = "33333333-3333-4333-8333-333333333333";
        mocks.getDraft.mockResolvedValueOnce(draft({ bingo_id: nextId, cells: imageCells }));
        view.rerender(<BingoEditor bingoId={nextId} />);
        await settle();
      } else if (boundary === "blank board") {
        view.rerender(<BingoEditor />);
        await settle();
        vi.mocked(uploadImage).mockResolvedValueOnce(CELL_IMAGE);
        fireEvent.click(screen.getByRole("button", { name: "Row 1, column 1: empty" }));
        fireEvent.change(screen.getByLabelText("Add image to cell"), {
          target: { files: [new File(["image"], "cell.png", { type: "image/png" })] },
        });
        await settle();
      } else {
        act(() => window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT)));
        await settle();
      }

      if (boundary === "another draft") {
        fireEvent.click(screen.getByRole("button", { name: "Row 1, column 1: empty" }));
      }
      const description = screen.getByRole("textbox", { name: "Image description" });
      expect(description).toHaveAttribute("aria-invalid", "false");
      expect(description).toHaveValue("");
      expect(
        screen.queryByText("Describe this image-only cell before publishing."),
      ).not.toBeInTheDocument();
      expect(mocks.publishDraft).not.toHaveBeenCalled();
    },
  );
});

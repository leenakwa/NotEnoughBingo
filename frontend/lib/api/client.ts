import type {
  ApiErrorPayload,
  AccountDeletionResult,
  AccountExportResult,
  AuthResult,
  AuthenticatedUser,
  BingoDetail,
  BingoDraft,
  BingoExportFormat,
  BingoSummary,
  ClientInteraction,
  Comment,
  ExportJob,
  MediaAsset,
  Notification,
  NotificationPreferences,
  Page,
  PlayProgress,
  ProfilePlayHistoryItem,
  ProfileSharedResultItem,
  ProfileUpdate,
  PublicId,
  PublicUser,
  RegistrationResult,
  ReportCreated,
  ReportReason,
  ReportTargetType,
  SessionMetadata,
  SharedResult,
  Tag,
  UploadIntent,
  UploadTicket,
  UserPrivacySettings,
  UserProfile,
} from "@/lib/api/types";

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue | QueryValue[]>;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Query;
  idempotencyKey?: string;
  skipCsrfBootstrap?: boolean;
}

const publicApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api/v1";
const serverApiBase =
  process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000/api/v1";
const csrfCookieName = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "neb_csrf";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
    this.requestId = payload.request_id;
  }
}

function apiBase(): string {
  return typeof window === "undefined" ? serverApiBase : publicApiBase;
}

function buildUrl(path: string, query?: Query): string {
  const cleanPath = path.replace(/^\/+/, "");
  const url = `${apiBase()}/${cleanPath}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== null && value !== undefined && value !== "") {
        search.append(key, String(value));
      }
    }
  }
  const suffix = search.toString();
  return suffix ? `${url}?${suffix}` : url;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

async function bootstrapCsrf(): Promise<void> {
  if (typeof window === "undefined" || getCookie(csrfCookieName)) return;
  await fetch(buildUrl("auth/csrf/"), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
}

function normalizeError(status: number, data: unknown): ApiErrorPayload {
  if (data && typeof data === "object" && "error" in data) {
    const wrapped = (data as { error?: unknown }).error;
    if (wrapped && typeof wrapped === "object") {
      const error = wrapped as Partial<ApiErrorPayload>;
      return {
        code: error.code ?? `http_${status}`,
        message: error.message ?? "The request could not be completed.",
        details: error.details,
        request_id: error.request_id,
      };
    }
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const detail = typeof record.detail === "string" ? record.detail : null;
    return {
      code: `http_${status}`,
      message: detail ?? "Please check the highlighted fields and try again.",
      details: data,
    };
  }

  return {
    code: `http_${status}`,
    message: status >= 500 ? "The service is temporarily unavailable." : "The request failed.",
  };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (unsafeMethods.has(method) && typeof window !== "undefined" && !options.skipCsrfBootstrap) {
    await bootstrapCsrf();
  }

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  const csrf = getCookie(csrfCookieName);
  if (unsafeMethods.has(method) && csrf) {
    headers.set("X-CSRFToken", csrf);
  }

  let body: BodyInit | undefined;
  if (options.body instanceof FormData || options.body instanceof Blob) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(path, options.query), {
    ...options,
    method,
    body,
    headers,
    credentials: "include",
    cache: options.cache ?? "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data: unknown = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new ApiClientError(response.status, normalizeError(response.status, data));
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const detail = firstValidationDetail(error.details);
    return detail ?? error.message;
  }
  if (error instanceof TypeError) {
    return "Unable to reach the service. Check your connection and try again.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function firstValidationDetail(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstValidationDetail(item, path);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    const field = path
      .filter((part) => !/^\d+$/.test(part))
      .map((part) => part.replaceAll("_", " "))
      .join(" · ");
    return field ? `${field}: ${record.message}` : record.message;
  }
  for (const [key, item] of Object.entries(record)) {
    const found = firstValidationDetail(item, [...path, key]);
    if (found) return found;
  }
  return null;
}

export const api = {
  auth: {
    csrf: () => apiRequest<void>("auth/csrf/", { skipCsrfBootstrap: true }),
    me: () => apiRequest<AuthenticatedUser>("auth/me/"),
    register: (input: { email: string; username: string; password: string }) =>
      apiRequest<RegistrationResult>("auth/register/", {
        method: "POST",
        body: input,
      }),
    login: (input: { email: string; password: string }) =>
      apiRequest<AuthResult>("auth/login/", { method: "POST", body: input }),
    logout: () => apiRequest<void>("auth/logout/", { method: "POST" }),
    verifyEmail: (token: string) =>
      apiRequest<AuthenticatedUser>("auth/verify-email/", {
        method: "POST",
        body: { token },
      }),
    resendVerification: (email: string) =>
      apiRequest<void>("auth/resend-verification/", {
        method: "POST",
        body: { email },
      }),
    requestPasswordReset: (email: string) =>
      apiRequest<void>("auth/password-reset/", { method: "POST", body: { email } }),
    resetPassword: (input: { uid: string; token: string; new_password: string }) =>
      apiRequest<void>("auth/password-reset/confirm/", {
        method: "POST",
        body: input,
      }),
    changePassword: (input: { current_password: string; new_password: string }) =>
      apiRequest<void>("auth/password-change/", {
        method: "POST",
        body: input,
      }),
    sessions: () => apiRequest<Page<SessionMetadata>>("auth/sessions/"),
    revokeSession: (sessionId: PublicId) =>
      apiRequest<void>(`auth/sessions/${sessionId}/`, { method: "DELETE" }),
    requestAccountExport: () =>
      apiRequest<AccountExportResult>("auth/account-export/", {
        method: "POST",
      }),
    scheduleAccountDeletion: (password: string) =>
      apiRequest<AccountDeletionResult>("auth/account-deletion/", {
        method: "POST",
        body: { password },
      }),
    cancelAccountDeletion: () => apiRequest<void>("auth/account-deletion/", { method: "DELETE" }),
  },
  feeds: {
    discover: (page = 1, signal?: AbortSignal) =>
      apiRequest<Page<BingoSummary>>("feeds/discover/", {
        query: { page },
        signal,
      }),
    trending: (page = 1, signal?: AbortSignal) =>
      apiRequest<Page<BingoSummary>>("feeds/trending/", {
        query: { page },
        signal,
      }),
  },
  tags: {
    list: (search = "", page = 1, signal?: AbortSignal) =>
      apiRequest<Page<Tag>>("tags/", {
        query: { search, page },
        signal,
      }),
  },
  bingos: {
    explore: (
      query: {
        search?: string;
        author?: string;
        tags?: string[];
        ordering?: "popular" | "newest";
        page?: number;
      },
      signal?: AbortSignal,
    ) => apiRequest<Page<BingoSummary>>("bingos/", { query, signal }),
    get: (id: PublicId, signal?: AbortSignal) =>
      apiRequest<BingoDetail>(`bingos/${id}/`, { signal }),
    createDraft: (input: unknown, idempotencyKey: string) =>
      apiRequest<BingoDraft>("drafts/", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    getDraft: (bingoId: PublicId, signal?: AbortSignal) =>
      apiRequest<BingoDraft>(`bingos/${bingoId}/draft/`, { signal }),
    updateDraft: (bingoId: PublicId, input: unknown, version: number) =>
      apiRequest<BingoDraft>(`bingos/${bingoId}/draft/`, {
        method: "PUT",
        body: { ...asRecord(input), version },
      }),
    publishDraft: (bingoId: PublicId, idempotencyKey: string) =>
      apiRequest<BingoDetail>(`bingos/${bingoId}/publish/`, {
        method: "POST",
        idempotencyKey,
      }),
    like: (id: PublicId) => apiRequest<BingoSummary>(`bingos/${id}/likes/`, { method: "POST" }),
    unlike: (id: PublicId) => apiRequest<void>(`bingos/${id}/likes/`, { method: "DELETE" }),
    archive: (id: PublicId) => apiRequest<BingoDetail>(`bingos/${id}/archive/`, { method: "POST" }),
    restore: (id: PublicId) => apiRequest<BingoDetail>(`bingos/${id}/restore/`, { method: "POST" }),
    remove: (id: PublicId) => apiRequest<void>(`bingos/${id}/`, { method: "DELETE" }),
  },
  uploads: {
    createIntent: (intent: UploadIntent) =>
      apiRequest<UploadTicket>("uploads/intents/", { method: "POST", body: intent }),
    complete: (assetId: PublicId) =>
      apiRequest<MediaAsset>(`uploads/${assetId}/complete/`, { method: "POST" }),
    uploadContent: (assetId: PublicId, file: Blob, headers: Record<string, string>) =>
      apiRequest<MediaAsset>(`uploads/${assetId}/content/`, {
        method: "PUT",
        headers,
        body: file,
      }),
    get: (assetId: PublicId, signal?: AbortSignal) =>
      apiRequest<MediaAsset>(`uploads/${assetId}/`, { signal }),
    remove: (assetId: PublicId) => apiRequest<void>(`uploads/${assetId}/`, { method: "DELETE" }),
  },
  exports: {
    create: (bingoId: PublicId, format: BingoExportFormat, idempotencyKey: string) =>
      apiRequest<ExportJob>(`bingos/${bingoId}/exports/`, {
        method: "POST",
        body: { format },
        idempotencyKey,
      }),
    get: (jobId: PublicId, signal?: AbortSignal) =>
      apiRequest<ExportJob>(`exports/${jobId}/`, { signal }),
  },
  progress: {
    get: (bingoId: PublicId, signal?: AbortSignal) =>
      apiRequest<PlayProgress>(`progress/${bingoId}/`, { signal }),
    save: (bingoId: PublicId, revisionId: PublicId, selectedCells: string[], version: number) =>
      apiRequest<PlayProgress>(`progress/${bingoId}/`, {
        method: "PUT",
        body: {
          revision_id: revisionId,
          selected_cells: selectedCells,
          version,
        },
      }),
    reset: (bingoId: PublicId) => apiRequest<void>(`progress/${bingoId}/`, { method: "DELETE" }),
  },
  shares: {
    get: (bingoId: PublicId, shareId: PublicId, signal?: AbortSignal) =>
      apiRequest<SharedResult>(`shares/${bingoId}/${shareId}/`, { signal }),
    create: (
      bingoId: PublicId,
      input: {
        revision_id: PublicId;
        selected_cells: string[];
        display_name?: string;
      },
      idempotencyKey: string,
    ) =>
      apiRequest<SharedResult>(`bingos/${bingoId}/shares/`, {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
  },
  profiles: {
    me: () => apiRequest<UserProfile>("profiles/me/"),
    get: (username: string, signal?: AbortSignal) =>
      apiRequest<UserProfile>(`profiles/${encodeURIComponent(username)}/`, {
        signal,
      }),
    update: (input: ProfileUpdate) =>
      apiRequest<UserProfile>("profiles/me/", { method: "PATCH", body: input }),
    updatePrivacy: (input: UserPrivacySettings) =>
      apiRequest<UserPrivacySettings>("profiles/me/privacy/", {
        method: "PUT",
        body: input,
      }),
    notificationPreferences: () =>
      apiRequest<NotificationPreferences>("profiles/notification-preferences/"),
    updateNotificationPreferences: (input: Partial<NotificationPreferences>) =>
      apiRequest<NotificationPreferences>("profiles/notification-preferences/", {
        method: "PATCH",
        body: input,
      }),
    bingos: (username: string, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<BingoSummary>>(`profiles/${encodeURIComponent(username)}/bingos/`, {
        query: { page },
        signal,
      }),
    playHistory: (username: string, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<ProfilePlayHistoryItem>>(
        `profiles/${encodeURIComponent(username)}/play-history/`,
        { query: { page }, signal },
      ),
    sharedResults: (username: string, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<ProfileSharedResultItem>>(
        `profiles/${encodeURIComponent(username)}/shared-results/`,
        { query: { page }, signal },
      ),
    followers: (username: string, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<PublicUser>>(`profiles/${encodeURIComponent(username)}/followers/`, {
        query: { page },
        signal,
      }),
    following: (username: string, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<PublicUser>>(`profiles/${encodeURIComponent(username)}/following/`, {
        query: { page },
        signal,
      }),
  },
  follows: {
    follow: (userId: PublicId) =>
      apiRequest<void>(`users/${userId}/followers/`, { method: "POST" }),
    unfollow: (userId: PublicId) =>
      apiRequest<void>(`users/${userId}/followers/`, { method: "DELETE" }),
  },
  notifications: {
    list: (page = 1, signal?: AbortSignal) =>
      apiRequest<Page<Notification>>("notifications/", {
        query: { page },
        signal,
      }),
    markRead: (id: PublicId) =>
      apiRequest<Notification>(`notifications/${id}/read/`, { method: "POST" }),
    markAllRead: () =>
      apiRequest<{ updated: number }>("notifications/read-all/", {
        method: "POST",
      }),
    unreadCount: () => apiRequest<{ count: number }>("notifications/unread-count/"),
  },
  comments: {
    list: (bingoId: PublicId, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<Comment>>(`bingos/${bingoId}/comments/`, {
        query: { page },
        signal,
      }),
    create: (bingoId: PublicId, body: string) =>
      apiRequest<Comment>(`bingos/${bingoId}/comments/`, {
        method: "POST",
        body: { body },
      }),
    replies: (commentId: PublicId, page = 1, signal?: AbortSignal) =>
      apiRequest<Page<Comment>>(`comments/${commentId}/replies/`, {
        query: { page },
        signal,
      }),
    reply: (commentId: PublicId, body: string) =>
      apiRequest<Comment>(`comments/${commentId}/replies/`, {
        method: "POST",
        body: { body },
      }),
    update: (commentId: PublicId, body: string) =>
      apiRequest<Comment>(`comments/${commentId}/`, {
        method: "PATCH",
        body: { body },
      }),
    remove: (commentId: PublicId) =>
      apiRequest<void>(`comments/${commentId}/`, { method: "DELETE" }),
    like: (commentId: PublicId) =>
      apiRequest<{ liked: true }>(`comments/${commentId}/likes/`, {
        method: "POST",
      }),
    unlike: (commentId: PublicId) =>
      apiRequest<void>(`comments/${commentId}/likes/`, { method: "DELETE" }),
  },
  reports: {
    create: (input: {
      target_type: ReportTargetType;
      target_id: PublicId;
      reason: ReportReason;
      description?: string;
    }) =>
      apiRequest<ReportCreated>("reports/", {
        method: "POST",
        body: input,
      }),
  },
  analytics: {
    record: (events: ClientInteraction[]) =>
      apiRequest<{ accepted: number }>("interactions/", {
        method: "POST",
        body: { events },
      }),
  },
};

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

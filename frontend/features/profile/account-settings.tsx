"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PasswordField } from "@/components/auth/password-field";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { UploadStatus } from "@/components/ui/upload-status";
import { clearAllEditorRecovery } from "@/features/editor/editor-recovery";
import { clearAllProgressRecovery } from "@/lib/progress-recovery";
import { clearProfileEdits } from "@/features/profile/profile-edit-cache";
import { notifyAuthChanged, notifySignedOut } from "@/lib/auth-events";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";
import type {
  AuthenticatedUser,
  ExportJob,
  NotificationPreferences,
  Page,
  SessionMetadata,
  UserProfile,
} from "@/lib/api/types";
import { uploadImage, type UploadPhase } from "@/lib/uploads";
import { formatLocalDateTime } from "@/lib/date-time";

const preferenceLabels: Record<keyof NotificationPreferences, string> = {
  new_comment: "New comments on my bingos",
  comment_reply: "Replies to my comments",
  bingo_like: "Likes on my bingos",
  comment_like: "Likes on my comments",
  new_follower: "New followers",
  marketing_email: "Optional product email",
};

export function AccountSettings({
  profile,
  onProfileChange,
}: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [sessions, setSessions] = useState<Page<SessionMetadata> | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [newEmailError, setNewEmailError] = useState("");
  const [emailChangePasswordError, setEmailChangePasswordError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [pending, setPending] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadPhase, setAvatarUploadPhase] = useState<UploadPhase>("preparing");
  const avatarUploadController = useRef<AbortController | null>(null);
  const actionInFlight = useRef(false);
  const [feedbackAction, setFeedbackAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setInitialLoading(true);
    setInitialError("");
    api.auth
      .me(controller.signal)
      .then((currentUser) => {
        if (controller.signal.aborted) return;
        setUser(currentUser);
        setDeletionScheduledFor(currentUser.deletion_scheduled_for);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setInitialError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitialLoading(false);
      });
    return () => controller.abort();
  }, [loadVersion, profile.id]);

  useEffect(() => {
    const controller = new AbortController();
    setSessions(null);
    setSessionsLoading(true);
    setSessionsError("");
    api.auth
      .sessions(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSessions(value);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setSessionsError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionsLoading(false);
      });
    return () => controller.abort();
  }, [loadVersion, sessionsVersion, profile.id]);

  useEffect(() => {
    const controller = new AbortController();
    setPreferences(null);
    setPreferencesLoading(true);
    setPreferencesError("");
    api.profiles
      .notificationPreferences(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPreferences(value);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setPreferencesError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreferencesLoading(false);
      });
    return () => controller.abort();
  }, [loadVersion, preferencesVersion, profile.id]);

  useEffect(() => () => avatarUploadController.current?.abort(), []);

  function cancelAvatarUpload() {
    avatarUploadController.current?.abort();
    setError("");
    setMessage("Upload cancelled.");
  }

  function beginAction(action: string) {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setPending(action);
    setFeedbackAction(action);
    setMessage("");
    setError("");
    setEmailFeedback(null);
    return true;
  }

  function finishAction() {
    actionInFlight.current = false;
    setPending("");
  }

  function actionFeedback(action: string) {
    if (!(feedbackAction === action || feedbackAction.startsWith(`${action}-`))) return null;
    if (!error && !message) return null;
    return (
      <p
        className={error ? "form-message form-message--error" : "form-message"}
        role={error ? "alert" : "status"}
      >
        {error || message}
      </p>
    );
  }

  async function updateAvatar(file: File) {
    if (pending || !beginAction("avatar")) return;
    const controller = new AbortController();
    avatarUploadController.current = controller;
    setAvatarUploading(true);
    setAvatarUploadPhase("preparing");
    try {
      const asset = await uploadImage(file, "avatar", {
        signal: controller.signal,
        onPhase: setAvatarUploadPhase,
      });
      avatarUploadController.current = null;
      setAvatarUploading(false);
      const updated = await api.profiles.update({ avatar_id: asset.id });
      onProfileChange(updated);
      setUser((current) => (current ? { ...current, avatar: asset } : current));
      notifyAuthChanged();
      setMessage("Avatar updated.");
    } catch (caught) {
      if (controller.signal.aborted) setMessage("Upload cancelled.");
      else setError(errorMessage(caught));
    } finally {
      if (avatarUploadController.current === controller) avatarUploadController.current = null;
      setAvatarUploading(false);
      finishAction();
    }
  }

  async function removeAvatar() {
    if (pending || !beginAction("avatar")) return;
    try {
      const updated = await api.profiles.update({ avatar_id: null });
      onProfileChange(updated);
      setUser((current) => (current ? { ...current, avatar: null } : current));
      notifyAuthChanged();
      setMessage("Avatar removed.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (pending || actionInFlight.current) return;
    const data = new FormData(form);
    const submittedCurrentPassword = String(data.get("current_password") ?? "");
    const submittedNewPassword = String(data.get("new_password") ?? "");
    const submittedConfirmation = String(data.get("confirm-new-password") ?? "");
    setCurrentPassword(submittedCurrentPassword);
    setNewPassword(submittedNewPassword);
    setConfirmPassword(submittedConfirmation);
    if (submittedNewPassword !== submittedConfirmation) {
      setError("");
      setMessage("");
      setConfirmPasswordError("The new passwords do not match.");
      form.querySelector<HTMLInputElement>('input[name="confirm-new-password"]')?.focus();
      return;
    }
    setConfirmPasswordError("");
    setCurrentPasswordError("");
    setNewPasswordError("");
    if (!beginAction("password")) return;
    try {
      await api.auth.changePassword({
        current_password: submittedCurrentPassword,
        new_password: submittedNewPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed. Other sessions were signed out.");
      setSessions(null);
      setSessionsVersion((version) => version + 1);
    } catch (caught) {
      const currentFieldError = fieldValidationMessage(caught, "current_password");
      const newFieldError = fieldValidationMessage(caught, "new_password");
      setCurrentPasswordError(currentFieldError ?? "");
      setNewPasswordError(newFieldError ?? "");
      if (currentFieldError) {
        form.querySelector<HTMLInputElement>('input[name="current_password"]')?.focus();
      } else if (newFieldError) {
        form.querySelector<HTMLInputElement>('input[name="new_password"]')?.focus();
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      finishAction();
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (pending || actionInFlight.current) return;
    const data = new FormData(form);
    const submittedEmail = String(data.get("new_email") ?? "").trim();
    const submittedPassword = String(data.get("email-change-password") ?? "");
    setNewEmail(submittedEmail);
    setEmailChangePassword(submittedPassword);
    if (!beginAction("email")) return;
    setNewEmailError("");
    setEmailChangePasswordError("");
    try {
      await api.auth.requestEmailChange({
        current_password: submittedPassword,
        new_email: submittedEmail,
      });
      setEmailChangePassword("");
      setEmailFeedback({
        error: false,
        text: "Check the new email address for a confirmation link. Your current address remains active until you confirm it.",
      });
    } catch (caught) {
      const emailFieldError = fieldValidationMessage(caught, "new_email");
      const passwordFieldError = fieldValidationMessage(caught, "current_password");
      setNewEmailError(emailFieldError ?? "");
      setEmailChangePasswordError(passwordFieldError ?? "");
      if (emailFieldError) {
        form.querySelector<HTMLInputElement>('input[name="new_email"]')?.focus();
      } else if (passwordFieldError) {
        form.querySelector<HTMLInputElement>('input[name="email-change-password"]')?.focus();
      } else {
        setEmailFeedback({ error: true, text: errorMessage(caught) });
      }
    } finally {
      finishAction();
    }
  }

  async function revokeSession(session: SessionMetadata) {
    if (pending || !beginAction(`session-${session.id}`)) return;
    try {
      await api.auth.revokeSession(session.id);
      if (session.current) {
        clearAllEditorRecovery();
        clearAllProgressRecovery();
        clearProfileEdits();
        notifySignedOut();
        router.replace("/login");
        router.refresh();
        return;
      }
      setSessions((current) =>
        current
          ? {
              ...current,
              count: Math.max(0, current.count - 1),
              results: current.results.filter((item) => item.id !== session.id),
            }
          : current,
      );
      setMessage("Session signed out.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!preferences || pending || !beginAction(`preference-${key}`)) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    try {
      setPreferences(await api.profiles.updateNotificationPreferences({ [key]: value }));
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setPreferences(previous);
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function requestExport() {
    if (pending || !beginAction("export")) return;
    try {
      const requested = await api.auth.requestAccountExport();
      let job = await api.exports.get(requested.job_id);
      setExportJob(job);
      for (
        let attempt = 0;
        attempt < 40 && ["queued", "processing"].includes(job.status);
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        job = await api.exports.get(requested.job_id);
        setExportJob(job);
      }
      if (job.status === "ready") {
        setMessage("Your data export is ready to download.");
      } else if (job.status === "failed" || job.status === "expired") {
        throw new Error(job.error || "The data export could not be prepared.");
      } else {
        setMessage("Your export is still processing. Check this page again shortly.");
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function scheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending ||
      actionInFlight.current ||
      !window.confirm("Schedule account deletion? You can cancel during the grace period.")
    ) {
      return;
    }
    const submittedPassword = String(
      new FormData(event.currentTarget).get("deletion_password") ?? "",
    );
    setDeletionPassword(submittedPassword);
    if (!beginAction("deletion")) return;
    try {
      const scheduled = await api.auth.scheduleAccountDeletion(submittedPassword);
      clearAllEditorRecovery();
      clearAllProgressRecovery();
      clearProfileEdits();
      setDeletionPassword("");
      setDeletionScheduledFor(scheduled.scheduled_for);
      notifySignedOut();
      router.replace("/login?next=%2Fprofile&reason=deletion-scheduled");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function cancelDeletion() {
    if (pending || !beginAction("deletion")) return;
    try {
      await api.auth.cancelAccountDeletion();
      setDeletionScheduledFor(null);
      setUser((current) => (current ? { ...current, deletion_scheduled_for: null } : current));
      setMessage("Account deletion cancelled.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function logout() {
    if (pending || !beginAction("logout")) return;
    try {
      await api.auth.logout();
      clearAllEditorRecovery();
      clearAllProgressRecovery();
      clearProfileEdits();
      notifySignedOut();
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      finishAction();
    }
  }

  if (initialLoading) {
    return (
      <section className="account-settings" aria-labelledby="account-settings-title">
        <h2 id="account-settings-title">Account settings</h2>
        <LoadingState label="Loading account settings…" />
      </section>
    );
  }

  if (initialError || !user) {
    return (
      <section className="account-settings" aria-labelledby="account-settings-title">
        <h2 id="account-settings-title">Account settings</h2>
        <ErrorState
          message={initialError || "Account settings could not be loaded."}
          onRetry={() => setLoadVersion((current) => current + 1)}
        />
      </section>
    );
  }

  return (
    <section className="account-settings" aria-labelledby="account-settings-title">
      <div className="section-heading">
        <p className="eyebrow">Security and data</p>
        <h2 id="account-settings-title">Account settings</h2>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h3>Avatar</h3>
          <p>JPEG, PNG, WebP, or AVIF, up to 5 MB.</p>
          <div className="inline-actions">
            <label className="button button--secondary upload-button">
              {pending === "avatar" ? "Processing…" : "Upload avatar"}
              <input
                type="file"
                name="avatar"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={Boolean(pending)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void updateAvatar(file);
                  event.target.value = "";
                }}
              />
            </label>
            {profile.avatar ? (
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pending)}
                onClick={() => void removeAvatar()}
              >
                Remove
              </button>
            ) : null}
          </div>
          {avatarUploading ? (
            <UploadStatus phase={avatarUploadPhase} onCancel={cancelAvatarUpload} />
          ) : null}
          {actionFeedback("avatar")}
        </div>

        <div className="settings-card">
          <h3>Signed-in account</h3>
          <p>{user.email}</p>
          <p>{user.email_verified ? "Email verified" : "Email verification required"}</p>
          <button
            type="button"
            className="button button--secondary"
            disabled={Boolean(pending)}
            onClick={() => void logout()}
          >
            {pending === "logout" ? "Logging out…" : "Log out"}
          </button>
          {actionFeedback("logout")}
        </div>

        <form className="settings-card" onSubmit={requestEmailChange}>
          <h3>Change email</h3>
          <p>Current address: {user.email}</p>
          <label className="field">
            <span>New email address</span>
            <input
              type="email"
              name="new_email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={newEmail}
              aria-invalid={Boolean(newEmailError)}
              aria-describedby={newEmailError ? "new-email-error" : undefined}
              onChange={(event) => {
                setNewEmail(event.target.value);
                setNewEmailError("");
                setEmailFeedback(null);
              }}
            />
            {newEmailError ? (
              <small id="new-email-error" className="form-message--error" role="alert">
                {newEmailError}
              </small>
            ) : null}
          </label>
          <PasswordField
            label="Current password for email change"
            name="email-change-password"
            autoComplete="current-password"
            value={emailChangePassword}
            onChange={(event) => {
              setEmailChangePassword(event.target.value);
              setEmailChangePasswordError("");
              setEmailFeedback(null);
            }}
            error={emailChangePasswordError}
          />
          <button type="submit" className="button button--primary" disabled={Boolean(pending)}>
            {pending === "email" ? "Sending…" : "Send confirmation email"}
          </button>
          {emailFeedback ? (
            <p
              className={emailFeedback.error ? "form-message form-message--error" : "form-message"}
              role={emailFeedback.error ? "alert" : "status"}
            >
              {emailFeedback.text}
            </p>
          ) : null}
        </form>

        <form className="settings-card" onSubmit={changePassword}>
          <h3>Change password</h3>
          <PasswordField
            label="Current password"
            name="current_password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setCurrentPasswordError("");
            }}
            error={currentPasswordError}
          />
          <PasswordField
            label="New password"
            name="new_password"
            autoComplete="new-password"
            minLength={12}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setNewPasswordError("");
            }}
            error={newPasswordError}
          />
          <PasswordField
            label="Confirm new password"
            name="confirm-new-password"
            autoComplete="new-password"
            minLength={12}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmPasswordError("");
            }}
            error={confirmPasswordError}
          />
          <button type="submit" className="button button--primary" disabled={Boolean(pending)}>
            {pending === "password" ? "Changing…" : "Change password"}
          </button>
          <Link href="/forgot-password" className="text-button">
            Forgot your current password?
          </Link>
          {actionFeedback("password")}
        </form>

        <div className="settings-card">
          <h3>Active sessions</h3>
          {sessionsLoading ? <LoadingState label="Loading active sessions…" /> : null}
          {sessionsError ? (
            <ErrorState
              message={sessionsError}
              onRetry={() => setSessionsVersion((version) => version + 1)}
            />
          ) : null}
          {sessions?.results.length ? (
            <ul className="session-list">
              {sessions.results.map((session) => (
                <li key={session.id}>
                  <div>
                    <b>{session.current ? "This device" : "Signed-in device"}</b>
                    <small>{session.user_agent || "Unknown browser"}</small>
                    <time dateTime={session.last_seen_at}>
                      Last active {formatLocalDateTime(session.last_seen_at)}
                    </time>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    disabled={Boolean(pending)}
                    onClick={() => void revokeSession(session)}
                  >
                    Sign out
                  </button>
                </li>
              ))}
            </ul>
          ) : sessions ? (
            <p>No active sessions were returned.</p>
          ) : null}
          {actionFeedback("session")}
        </div>

        <div className="settings-card">
          <h3>Notification preferences</h3>
          {preferencesLoading ? <LoadingState label="Loading notification preferences…" /> : null}
          {preferencesError ? (
            <ErrorState
              message={preferencesError}
              onRetry={() => setPreferencesVersion((version) => version + 1)}
            />
          ) : null}
          {preferences ? (
            <div className="switch-list">
              {(
                Object.entries(preferenceLabels) as Array<[keyof NotificationPreferences, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    disabled={Boolean(pending)}
                    onChange={(event) => void updatePreference(key, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ) : null}
          {actionFeedback("preference")}
        </div>

        <div className="settings-card">
          <h3>Export your data</h3>
          <p>Create a time-limited ZIP with your account and product data.</p>
          {exportJob?.status === "ready" && exportJob.download_url ? (
            <a className="button button--primary" href={exportJob.download_url}>
              Download data export
            </a>
          ) : (
            <button
              type="button"
              className="button button--secondary"
              disabled={Boolean(pending)}
              onClick={() => void requestExport()}
            >
              {pending === "export" ? "Preparing export…" : "Request data export"}
            </button>
          )}
          {actionFeedback("export")}
        </div>

        <form className="settings-card settings-card--danger" onSubmit={scheduleDeletion}>
          <h3>Delete account</h3>
          <p>
            Deletion is scheduled after a grace period. Shared public snapshots remain stable but
            are anonymized according to the deletion policy.
          </p>
          {deletionScheduledFor ? (
            <>
              <p>
                Scheduled for{" "}
                <time dateTime={deletionScheduledFor}>
                  {formatLocalDateTime(deletionScheduledFor)}
                </time>
              </p>
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pending)}
                onClick={() => void cancelDeletion()}
              >
                Cancel deletion
              </button>
            </>
          ) : (
            <>
              <PasswordField
                label="Confirm with your password"
                name="deletion_password"
                autoComplete="current-password"
                value={deletionPassword}
                onChange={(event) => setDeletionPassword(event.target.value)}
              />
              <button type="submit" className="button button--danger" disabled={Boolean(pending)}>
                {pending === "deletion" ? "Scheduling…" : "Schedule account deletion"}
              </button>
            </>
          )}
          {actionFeedback("deletion")}
        </form>
      </div>
    </section>
  );
}

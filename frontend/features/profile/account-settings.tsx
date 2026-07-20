"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { notifyAuthChanged } from "@/lib/auth-events";
import { api, errorMessage } from "@/lib/api/client";
import type {
  AccountDeletionResult,
  AuthenticatedUser,
  ExportJob,
  NotificationPreferences,
  Page,
  SessionMetadata,
  UserProfile,
} from "@/lib/api/types";
import { uploadImage } from "@/lib/uploads";

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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletion, setDeletion] = useState<AccountDeletionResult | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setInitialError("");
    Promise.all([api.auth.me(), api.auth.sessions(), api.profiles.notificationPreferences()])
      .then(([currentUser, activeSessions, notificationPreferences]) => {
        if (!active) return;
        setUser(currentUser);
        setSessions(activeSessions);
        setPreferences(notificationPreferences);
      })
      .catch((caught) => {
        if (active) setInitialError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadVersion]);

  function beginAction(action: string) {
    setPending(action);
    setMessage("");
    setError("");
  }

  async function updateAvatar(file: File) {
    if (pending) return;
    beginAction("avatar");
    try {
      const asset = await uploadImage(file, "avatar");
      const updated = await api.profiles.update({ avatar_id: asset.id });
      onProfileChange(updated);
      setUser((current) => (current ? { ...current, avatar: asset } : current));
      notifyAuthChanged();
      setMessage("Avatar updated.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function removeAvatar() {
    if (pending) return;
    beginAction("avatar");
    try {
      const updated = await api.profiles.update({ avatar_id: null });
      onProfileChange(updated);
      setUser((current) => (current ? { ...current, avatar: null } : current));
      notifyAuthChanged();
      setMessage("Avatar removed.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    beginAction("password");
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed. Other sessions were signed out.");
      setSessions(await api.auth.sessions());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function revokeSession(session: SessionMetadata) {
    if (pending) return;
    beginAction(`session-${session.id}`);
    try {
      await api.auth.revokeSession(session.id);
      if (session.current) {
        notifyAuthChanged();
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
      setPending("");
    }
  }

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!preferences || pending) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    beginAction(`preference-${key}`);
    try {
      setPreferences(await api.profiles.updateNotificationPreferences({ [key]: value }));
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setPreferences(previous);
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function requestExport() {
    if (pending) return;
    beginAction("export");
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
      setPending("");
    }
  }

  async function scheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending ||
      !window.confirm("Schedule account deletion? You can cancel during the grace period.")
    ) {
      return;
    }
    beginAction("deletion");
    try {
      const scheduled = await api.auth.scheduleAccountDeletion(deletionPassword);
      setDeletion(scheduled);
      setDeletionPassword("");
      setMessage(
        `Account deletion is scheduled for ${new Date(scheduled.scheduled_for).toLocaleString()}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function cancelDeletion() {
    if (pending) return;
    beginAction("deletion");
    try {
      await api.auth.cancelAccountDeletion();
      setDeletion(null);
      setMessage("Account deletion cancelled.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  }

  async function logout() {
    if (pending) return;
    beginAction("logout");
    try {
      await api.auth.logout();
      notifyAuthChanged();
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending("");
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

  if (initialError || !user || !sessions || !preferences) {
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
                hidden
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
        </div>

        <form className="settings-card" onSubmit={changePassword}>
          <h3>Change password</h3>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="button button--primary" disabled={Boolean(pending)}>
            {pending === "password" ? "Changing…" : "Change password"}
          </button>
        </form>

        <div className="settings-card">
          <h3>Active sessions</h3>
          {sessions.results.length ? (
            <ul className="session-list">
              {sessions.results.map((session) => (
                <li key={session.id}>
                  <div>
                    <b>{session.current ? "This device" : "Signed-in device"}</b>
                    <small>{session.user_agent || "Unknown browser"}</small>
                    <time dateTime={session.last_seen_at}>
                      Last active {new Date(session.last_seen_at).toLocaleString()}
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
          ) : (
            <p>No active sessions were returned.</p>
          )}
        </div>

        <div className="settings-card">
          <h3>Notification preferences</h3>
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
        </div>

        <form className="settings-card settings-card--danger" onSubmit={scheduleDeletion}>
          <h3>Delete account</h3>
          <p>
            Deletion is scheduled after a grace period. Shared public snapshots remain stable but
            are anonymized according to the deletion policy.
          </p>
          {deletion ? (
            <>
              <p>
                Scheduled for{" "}
                <time dateTime={deletion.scheduled_for}>
                  {new Date(deletion.scheduled_for).toLocaleString()}
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
              <label className="field">
                <span>Confirm with your password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={deletionPassword}
                  onChange={(event) => setDeletionPassword(event.target.value)}
                />
              </label>
              <button type="submit" className="button button--danger" disabled={Boolean(pending)}>
                {pending === "deletion" ? "Scheduling…" : "Schedule account deletion"}
              </button>
            </>
          )}
        </form>
      </div>

      <p
        className={error ? "form-message form-message--error" : "form-message"}
        role={error ? "alert" : "status"}
      >
        {error || message}
      </p>
    </section>
  );
}

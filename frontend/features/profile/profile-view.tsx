"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { AccountSettings } from "@/features/profile/account-settings";
import { ProfileCollections } from "@/features/profile/profile-collections";
import { ReportDialog } from "@/features/social/report-dialog";
import { notifyAuthChanged } from "@/lib/auth-events";
import { api, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import type { AuthenticatedUser, UserPrivacySettings, UserProfile } from "@/lib/api/types";

const privacyLabels: Record<keyof UserPrivacySettings, string> = {
  show_bio: "Show bio",
  show_created_bingos: "Show created bingos",
  show_play_history: "Show play history",
  show_shared_results: "Show shared results",
  show_followers: "Show followers",
  show_following: "Show following",
};

export function ProfileView({ username }: { username?: string }) {
  const ownProfile = !username;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState<AuthenticatedUser | "guest" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAuthRequired(false);
    const request = username ? api.profiles.get(username, controller.signal) : api.profiles.me();
    request
      .then((value) => {
        setProfile(value);
        setDisplayName(value.display_name);
        setUsernameValue(value.username);
        setBio(value.bio);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (!username && isAuthenticationRequiredError(caught)) {
          setAuthRequired(true);
        } else {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadVersion, username]);

  useEffect(() => {
    if (ownProfile) return;
    let active = true;
    api.auth
      .me()
      .then((user) => {
        if (active) setViewer(user);
      })
      .catch(() => {
        if (active) setViewer("guest");
      });
    return () => {
      active = false;
    };
  }, [ownProfile]);

  async function saveProfile() {
    if (!profile || pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.profiles.update({
        username: usernameValue,
        display_name: displayName,
        bio,
      });
      setProfile(updated);
      setUsernameValue(updated.username);
      notifyAuthChanged();
      setMessage("Profile saved.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function updatePrivacy(key: keyof UserPrivacySettings, checked: boolean) {
    if (!profile || pending) return;
    const privacy = { ...profile.privacy, [key]: checked };
    setProfile({ ...profile, privacy });
    setPending(true);
    setError("");
    try {
      const saved = await api.profiles.updatePrivacy(privacy);
      setProfile((current) => (current ? { ...current, privacy: saved } : current));
      setMessage("Privacy settings saved.");
    } catch (caught) {
      setProfile((current) => (current ? { ...current, privacy: profile.privacy } : current));
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function toggleFollow() {
    if (!profile || pending) return;
    const next = !profile.is_following;
    setPending(true);
    setError("");
    try {
      if (next) await api.follows.follow(profile.id);
      else await api.follows.unfollow(profile.id);
      setProfile({
        ...profile,
        is_following: next,
        follower_count: Math.max(0, profile.follower_count + (next ? 1 : -1)),
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <main id="main-content" className="page-shell">
        <LoadingState label="Loading profile…" />
      </main>
    );
  }
  if (authRequired) {
    return (
      <main id="main-content" className="page-shell">
        <EmptyState
          title="Log in to view your profile"
          description="Your profile, privacy controls, sessions, and account settings require an authenticated session."
          action={{ href: "/login?next=%2Fprofile", label: "Log in" }}
        />
      </main>
    );
  }
  if (!profile) {
    return (
      <main id="main-content" className="page-shell">
        <ErrorState
          message={error || "Profile not found."}
          onRetry={() => setLoadVersion((current) => current + 1)}
        />
      </main>
    );
  }

  const avatarUrl = profile.avatar?.url;
  return (
    <main id="main-content" className="page-shell profile-page">
      <header className="profile-header">
        {avatarUrl ? (
          // The API returns a sanitized avatar asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={112} height={112} />
        ) : (
          <span className="profile-avatar" aria-hidden="true">
            {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="eyebrow">@{profile.username}</p>
          <h1>{profile.display_name}</h1>
          {profile.bio ? <p>{profile.bio}</p> : null}
          <p className="profile-counts">
            <span>
              <b>{profile.follower_count}</b> followers
            </span>
            <span>
              <b>{profile.following_count}</b> following
            </span>
          </p>
        </div>
        {!ownProfile && viewer !== "guest" && viewer?.id !== profile.id ? (
          <button
            type="button"
            className={profile.is_following ? "button button--secondary" : "button button--primary"}
            aria-pressed={profile.is_following}
            disabled={pending}
            onClick={() => void toggleFollow()}
          >
            {profile.is_following ? "Following" : "Follow"}
          </button>
        ) : !ownProfile && viewer === "guest" ? (
          <Link
            className="button button--primary"
            href={`/login?next=${encodeURIComponent(`/profile/${profile.username}`)}`}
          >
            Log in to follow
          </Link>
        ) : null}
      </header>

      {!ownProfile && viewer !== "guest" && viewer?.id !== profile.id ? (
        <div className="profile-moderation-actions">
          <button type="button" className="text-button" onClick={() => setReportOpen(true)}>
            Report profile
          </button>
        </div>
      ) : null}

      {ownProfile ? (
        <section className="settings-grid" aria-labelledby="profile-settings-title">
          <form
            className="settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <h2 id="profile-settings-title">Profile details</h2>
            <label className="field">
              <span>Username</span>
              <input
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                required
                value={usernameValue}
                onChange={(event) => setUsernameValue(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Bio</span>
              <textarea
                rows={4}
                maxLength={280}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </label>
            <button type="submit" className="button button--primary" disabled={pending}>
              Save profile
            </button>
          </form>
          <div className="settings-card">
            <h2>Privacy</h2>
            <p>Control which profile sections other people can see.</p>
            <div className="switch-list">
              {Object.entries(privacyLabels).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={profile.privacy[key as keyof UserPrivacySettings]}
                    disabled={pending}
                    onChange={(event) =>
                      void updatePrivacy(key as keyof UserPrivacySettings, event.target.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <p
        className={error ? "form-message form-message--error" : "form-message"}
        role={error ? "alert" : "status"}
      >
        {error || message}
      </p>

      <ProfileCollections username={profile.username} ownProfile={ownProfile} />
      {ownProfile ? (
        <AccountSettings
          profile={profile}
          onProfileChange={(updated) => {
            setProfile(updated);
            setDisplayName(updated.display_name);
            setUsernameValue(updated.username);
            setBio(updated.bio);
          }}
        />
      ) : null}
      {reportOpen ? (
        <ReportDialog
          targetType="profile"
          targetId={profile.id}
          targetLabel="profile"
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </main>
  );
}

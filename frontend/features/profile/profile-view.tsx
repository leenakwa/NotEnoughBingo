"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { AvatarImage } from "@/components/ui/avatar-image";
import { LanguagePicker } from "@/components/ui/language-picker";
import { AccountSettings } from "@/features/profile/account-settings";
import { ProfileCollections } from "@/features/profile/profile-collections";
import { readProfileEdits, rememberProfileEdits } from "@/features/profile/profile-edit-cache";
import { ReportDialog } from "@/features/social/report-dialog";
import { notifyAuthChanged } from "@/lib/auth-events";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
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

export function ProfileView({
  username,
  initialProfile,
}: {
  username?: string;
  initialProfile?: UserProfile | null;
}) {
  const ownProfile = !username;
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile ?? null);
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? "");
  const [usernameValue, setUsernameValue] = useState(initialProfile?.username ?? "");
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [preferredLanguages, setPreferredLanguages] = useState<string[]>([]);
  const [savedPreferredLanguages, setSavedPreferredLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(!initialProfile);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [feedbackAction, setFeedbackAction] = useState("profile");
  const [viewer, setViewer] = useState<AuthenticatedUser | "guest" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const initialProfileConsumed = useRef(false);
  const actionInFlight = useRef(false);

  useUnsavedChangesWarning(
    ownProfile &&
      !loading &&
      Boolean(profile) &&
      (displayName !== profile?.display_name ||
        usernameValue !== profile?.username ||
        bio !== profile?.bio ||
        [...preferredLanguages].sort().join(",") !== [...savedPreferredLanguages].sort().join(",")),
    "Your profile changes have not been saved. Leave anyway?",
  );

  useEffect(() => {
    if (!ownProfile || loading || !profile) return;
    rememberProfileEdits(profile.id, {
      ...(usernameValue !== profile.username ? { username: usernameValue } : {}),
      ...(displayName !== profile.display_name ? { displayName } : {}),
      ...(bio !== profile.bio ? { bio } : {}),
      ...([...preferredLanguages].sort().join(",") !== [...savedPreferredLanguages].sort().join(",")
        ? { preferredLanguages }
        : {}),
    });
  }, [
    ownProfile,
    loading,
    profile,
    usernameValue,
    displayName,
    bio,
    preferredLanguages,
    savedPreferredLanguages,
  ]);

  useEffect(() => {
    if (!initialProfileConsumed.current && loadVersion === 0 && initialProfile) {
      initialProfileConsumed.current = true;
      return;
    }
    initialProfileConsumed.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAuthRequired(false);
    const request = username ? api.profiles.get(username, controller.signal) : api.profiles.me();
    request
      .then((value) => {
        if (controller.signal.aborted) return;
        const edits = ownProfile ? readProfileEdits(value.id) : undefined;
        setProfile(value);
        setDisplayName(edits?.displayName ?? value.display_name);
        setUsernameValue(edits?.username ?? value.username);
        setBio(edits?.bio ?? value.bio);
        if (edits)
          setMessage("Your unsaved profile changes have been restored. Save them when ready.");
        if (
          ownProfile &&
          "preferred_languages" in value &&
          Array.isArray(value.preferred_languages)
        ) {
          setPreferredLanguages(edits?.preferredLanguages ?? value.preferred_languages);
          setSavedPreferredLanguages(value.preferred_languages);
        }
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
  }, [initialProfile, loadVersion, ownProfile, username]);

  useEffect(() => {
    if (ownProfile) return;
    let active = true;
    api.auth
      .session()
      .then((user) => {
        if (active) setViewer(user ?? "guest");
      })
      .catch(() => {
        if (active) setViewer("guest");
      });
    return () => {
      active = false;
    };
  }, [ownProfile]);

  async function saveProfile() {
    if (!profile || actionInFlight.current) return;
    actionInFlight.current = true;
    setFeedbackAction("profile");
    setPending(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.profiles.update({
        username: usernameValue.trim(),
        display_name: displayName,
        bio,
      });
      setProfile(updated);
      setUsernameValue(updated.username);
      setDisplayName(updated.display_name);
      setBio(updated.bio);
      notifyAuthChanged();
      setMessage("Profile saved.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  async function updatePrivacy(key: keyof UserPrivacySettings, checked: boolean) {
    if (!profile || actionInFlight.current) return;
    actionInFlight.current = true;
    setFeedbackAction("privacy");
    const privacy = { ...profile.privacy, [key]: checked };
    setProfile({ ...profile, privacy });
    setPending(true);
    setError("");
    setMessage("");
    try {
      const saved = await api.profiles.updatePrivacy(privacy);
      setProfile((current) => (current ? { ...current, privacy: saved } : current));
      setMessage("Privacy settings saved.");
    } catch (caught) {
      setProfile((current) => (current ? { ...current, privacy: profile.privacy } : current));
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  async function saveLanguagePreferences() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setFeedbackAction("languages");
    setPending(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.profiles.update({ preferred_languages: preferredLanguages });
      setProfile(updated);
      setSavedPreferredLanguages(preferredLanguages);
      setMessage("Bingo languages saved.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  async function toggleFollow() {
    if (!profile || actionInFlight.current) return;
    actionInFlight.current = true;
    setFeedbackAction("follow");
    const next = !profile.is_following;
    setPending(true);
    setError("");
    setMessage("");
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
      actionInFlight.current = false;
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

  const avatarUrl = profile.avatar?.thumbnail_url ?? profile.avatar?.url;
  const feedback =
    error || message || pending ? (
      <p
        className={error ? "form-message form-message--error" : "form-message"}
        role={error ? "alert" : "status"}
      >
        {error || (pending ? "Saving changes…" : message)}
      </p>
    ) : null;
  return (
    <main id="main-content" className="page-shell profile-page">
      <header className="profile-header">
        <AvatarImage
          src={avatarUrl}
          width={112}
          height={112}
          fallback={
            <span className="profile-avatar" aria-hidden="true">
              {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
            </span>
          }
        />
        <div>
          <p className="eyebrow">@{profile.username}</p>
          <h1>{profile.display_name || profile.username}</h1>
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
            {pending ? "Saving…" : profile.is_following ? "Following" : "Follow"}
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
                name="username"
                disabled={pending}
                minLength={3}
                maxLength={30}
                pattern="\s*[A-Za-z0-9_]+\s*"
                autoComplete="username"
                required
                value={usernameValue}
                onChange={(event) => setUsernameValue(event.target.value)}
                onBlur={(event) => setUsernameValue(event.target.value.trim())}
              />
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                name="name"
                autoComplete="name"
                disabled={pending}
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Bio</span>
              <textarea
                name="bio"
                disabled={pending}
                rows={4}
                maxLength={280}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </label>
            <button type="submit" className="button button--primary" disabled={pending}>
              {pending && feedbackAction === "profile" ? "Saving profile…" : "Save profile"}
            </button>
            {feedbackAction === "profile" ? feedback : null}
          </form>
          <div className="settings-card">
            <h2>Bingo languages</h2>
            <p>Choose the languages you want to see in Discover. Select none to see all.</p>
            <LanguagePicker
              value={preferredLanguages}
              onChange={setPreferredLanguages}
              label="Preferred languages"
              disabled={pending}
            />
            <button
              type="button"
              className="button button--primary"
              disabled={pending}
              onClick={() => void saveLanguagePreferences()}
            >
              {pending && feedbackAction === "languages" ? "Saving languages…" : "Save languages"}
            </button>
            {feedbackAction === "languages" ? feedback : null}
          </div>
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
            {feedbackAction === "privacy" ? feedback : null}
          </div>
        </section>
      ) : null}

      {!ownProfile ? feedback : null}

      <ProfileCollections username={profile.username} ownProfile={ownProfile} />
      {ownProfile ? (
        <AccountSettings
          profile={profile}
          onProfileChange={(updated) => {
            setProfile(updated);
            setDisplayName((current) =>
              current === profile.display_name ? updated.display_name : current,
            );
            setUsernameValue((current) =>
              current === profile.username ? updated.username : current,
            );
            setBio((current) => (current === profile.bio ? updated.bio : current));
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

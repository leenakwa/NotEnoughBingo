"use client";

import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LanguagePicker } from "@/components/ui/language-picker";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import { bingoLanguages } from "@/lib/languages";
import { notifyLanguagePreferencesChanged } from "@/lib/registration-onboarding";

export function LanguageOnboarding({
  userId,
  onComplete,
  onPendingChange,
  onReminderChange,
}: {
  userId: string;
  onComplete: () => void;
  onPendingChange: (pending: boolean) => void;
  onReminderChange: (reminder: boolean) => void;
}) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const saveInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    onPendingChange(true);
    api.profiles
      .me()
      .then((profile) => {
        if (!active) return;
        if (profile.id !== userId || profile.language_preferences_confirmed) {
          onComplete();
          return;
        }
        const browserCode = navigator.language.slice(0, 2).toLowerCase();
        setLanguages(
          profile.preferred_languages.length
            ? profile.preferred_languages
            : [bingoLanguages.find((language) => language.code === browserCode)?.code ?? "en"],
        );
      })
      .catch((caught) => {
        if (active) setLoadError(errorMessage(caught));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          onPendingChange(false);
        }
      });
    return () => {
      active = false;
    };
  }, [onComplete, onPendingChange, requestVersion, userId]);

  async function save(preferredLanguages: string[]) {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError("");
    onPendingChange(true);
    try {
      await api.profiles.update({ preferred_languages: preferredLanguages });
      notifyLanguagePreferencesChanged();
      onComplete();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
      onPendingChange(false);
    }
  }

  return (
    <AuthShell
      presentation="dialog"
      eyebrow={reminder ? "Maybe later" : "Your bingo languages"}
      title={reminder ? "Language settings" : "Which bingo languages do you prefer?"}
      description={
        reminder
          ? "You can change your bingo languages anytime in Profile settings, under Bingo languages."
          : "Choose one or more languages for Discover. You can change them later in your settings."
      }
    >
      {loading ? (
        <LoadingState label="Loading language settings..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => setRequestVersion((value) => value + 1)} />
      ) : reminder ? (
        <button
          type="button"
          className="button button--primary"
          data-modal-autofocus
          disabled={saving}
          onClick={() => void save([])}
        >
          {saving ? "Saving..." : "Got it"}
        </button>
      ) : (
        <>
          <LanguagePicker
            value={languages}
            onChange={setLanguages}
            label="Preferred languages"
            disabled={saving}
          />
          <div className="inline-actions language-onboarding__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={!languages.length || saving}
              onClick={() => void save(languages)}
            >
              {saving ? "Saving..." : "Save preferences"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={saving}
              onClick={() => {
                setSaveError("");
                setReminder(true);
                onReminderChange(true);
              }}
            >
              Maybe later
            </button>
          </div>
        </>
      )}
      {saveError ? (
        <p role="alert" className="form-message form-message--error">
          {saveError}
        </p>
      ) : null}
    </AuthShell>
  );
}

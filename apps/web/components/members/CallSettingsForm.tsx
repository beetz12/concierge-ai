"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MemberApiError,
  normalizeUsPhone,
  updateMemberSettings,
  US_E164_REGEX,
  VOICEMAIL_POLICY_OPTIONS,
  type MemberCallSettings,
  type VoicemailPolicy,
} from "@/lib/services/memberService";

/**
 * Per-org outbound call settings form (PUT /api/v1/members/settings).
 * Used by onboarding step 2 and the ongoing Settings page.
 */
export function CallSettingsForm({
  initial,
  submitLabel = "Save settings",
  onSaved,
}: {
  initial: MemberCallSettings;
  submitLabel?: string;
  onSaved?: (settings: MemberCallSettings) => void;
}) {
  const [callerIdentity, setCallerIdentity] = useState(
    initial.callerIdentity ?? "",
  );
  const [voicemailPolicy, setVoicemailPolicy] = useState<VoicemailPolicy>(
    initial.voicemailPolicy,
  );
  const [transferNumber, setTransferNumber] = useState(
    initial.transferNumber ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const trimmedIdentity = callerIdentity.trim();
    const rawTransfer = transferNumber.trim();
    const normalizedTransfer = rawTransfer ? normalizeUsPhone(rawTransfer) : "";
    if (normalizedTransfer && !US_E164_REGEX.test(normalizedTransfer)) {
      setError(
        "Transfer number must be a US number: +1 followed by 10 digits.",
      );
      return;
    }

    setSaving(true);
    try {
      const { settings } = await updateMemberSettings({
        callerIdentity: trimmedIdentity || null,
        voicemailPolicy,
        transferNumber: normalizedTransfer || null,
      });
      setCallerIdentity(settings.callerIdentity ?? "");
      setVoicemailPolicy(settings.voicemailPolicy);
      setTransferNumber(settings.transferNumber ?? "");
      setSaved(true);
      onSaved?.(settings);
    } catch (err) {
      setError(
        err instanceof MemberApiError
          ? err.message
          : "Could not save settings. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="caller-identity">Caller identity</Label>
        <Input
          id="caller-identity"
          data-testid="caller-identity"
          maxLength={200}
          placeholder='e.g. "Alex, assistant for the Chen household"'
          value={callerIdentity}
          onChange={(e) => setCallerIdentity(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          How the AI introduces itself on your calls. Leave blank for the
          default introduction.
        </p>
      </div>

      <div className="space-y-2 max-w-sm">
        <Label htmlFor="voicemail-policy">If voicemail answers</Label>
        <select
          id="voicemail-policy"
          data-testid="voicemail-policy"
          value={voicemailPolicy}
          onChange={(e) => setVoicemailPolicy(e.target.value as VoicemailPolicy)}
          className="w-full bg-surface-highlight border border-surface-highlight rounded-xl px-3 py-2 text-sm text-slate-200"
        >
          {VOICEMAIL_POLICY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 max-w-sm">
        <Label htmlFor="transfer-number">Transfer number (optional)</Label>
        <Input
          id="transfer-number"
          data-testid="transfer-number"
          type="tel"
          placeholder="(864) 555-1234"
          value={transferNumber}
          onChange={(e) => setTransferNumber(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Where a call gets handed off if the business asks for a human. US
          numbers only.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          data-testid="save-settings"
          disabled={saving}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

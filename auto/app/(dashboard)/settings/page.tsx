"use client";

import { useEffect, useState } from "react";
import { COMMON_TIMEZONES } from "@/lib/utils/timezone";
import { Settings as SettingsIcon, Check, Loader2, Globe, User, Shield, Palette } from "lucide-react";
import { ThemeSelector } from "@/components/ThemeToggle";

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [defaultPrivacy, setDefaultPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setDisplayName(data.profile.display_name || "");
          setEmail(data.profile.email || "");
          setTimezone(data.profile.timezone || "UTC");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, timezone }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Manage your profile preferences, publishing defaults, and timezone
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Appearance & Theme Card */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200 dark:border-[#1E2230] space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-500" />
            <span>Appearance & Theme</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Choose your preferred theme across the entire BEWEB Social Automation dashboard.
          </p>
          <ThemeSelector />
        </div>

        {/* Profile Card */}
        <div className="glass-card rounded-2xl p-6 border border-[#1E2230] space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400" />
            <span>Profile & Account</span>
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Creator"
                className="w-full px-3.5 py-2.5 bg-[#181B26] border border-[#1E2230] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={email}
                className="w-full px-3.5 py-2.5 bg-[#141620] border border-[#1E2230] rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Timezone Card */}
        <div className="glass-card rounded-2xl p-6 border border-[#1E2230] space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>Scheduling Timezone</span>
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Default Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#181B26] border border-[#1E2230] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              All scheduled dates and times will automatically convert relative to this timezone.
            </p>
          </div>
        </div>

        {/* Defaults Card */}
        <div className="glass-card rounded-2xl p-6 border border-[#1E2230] space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Publishing Preferences</span>
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Default YouTube Visibility
            </label>
            <select
              value={defaultPrivacy}
              onChange={(e) =>
                setDefaultPrivacy(e.target.value as "public" | "unlisted" | "private")
              }
              className="w-full px-3.5 py-2.5 bg-[#181B26] border border-[#1E2230] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="public">Public (Default)</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Preferences Saved!</span>
              </>
            ) : (
              <span>Save Preferences</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

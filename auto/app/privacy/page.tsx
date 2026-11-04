import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Share2,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
  EyeOff,
  Globe,
  Youtube,
  Instagram,
  Facebook,
  KeyRound,
  Database,
  UserX,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for BEWEB Social Automation. Learn how we connect Facebook Pages, Instagram Professional accounts, and YouTube channels to automate content publishing securely.",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "September 21, 2026";

  return (
    <div className="min-h-screen bg-[#090A0F] text-gray-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-indigo-600/10 via-purple-600/5 to-transparent blur-[140px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-[#1E2230] bg-[#090A0F]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-white hover:text-indigo-400 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm sm:text-base tracking-tight text-white block leading-tight">
                BEWEB Social Automation
              </span>
              <span className="text-[10px] text-gray-400 block leading-none">
                Automated Social Publishing
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#141724] hover:bg-[#1C2030] border border-[#272D40] text-xs font-medium text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10 relative z-10">
        {/* Title & Introduction */}
        <div className="space-y-3 border-b border-[#1E2230] pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Official Policy</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </h1>

          <p className="text-sm text-gray-400">
            Last Updated: <strong className="text-gray-300 font-semibold">{lastUpdated}</strong>
          </p>

          <p className="text-sm sm:text-base text-gray-300 leading-relaxed pt-2">
            Welcome to <strong className="text-white">BEWEB Social Automation</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;).
            This Privacy Policy explains how we collect, use, safeguard, and disclose your information when you use our social media automation web application.
            We are committed to protecting your privacy and ensuring your personal information and social media tokens remain secure and confidential.
          </p>
        </div>

        {/* Highlight Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">We Do Not Sell Data</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Your personal and account data is never sold, traded, or rented to third parties.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 flex-shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">OAuth Permission Only</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Tokens are accessed solely via official OAuth consent for automated publishing.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Disconnect Anytime</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Disconnect accounts or request full deletion of your stored credentials at any time.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Connected Platforms */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-indigo-400">
              <Globe className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">1. Platforms We Connect</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            <strong className="text-white">BEWEB Social Automation</strong> enables users to connect their verified social platform accounts for automated content scheduling and video publishing:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] space-y-1.5">
              <div className="flex items-center gap-2 text-blue-500">
                <Facebook className="w-4 h-4" />
                <span className="text-xs font-bold text-white">Facebook Pages</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Connects user-managed Facebook Business Pages via Meta Graph API v21.0 to publish page videos and status updates.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] space-y-1.5">
              <div className="flex items-center gap-2 text-pink-500">
                <Instagram className="w-4 h-4" />
                <span className="text-xs font-bold text-white">Instagram Professional</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Connects Instagram Professional (Business or Creator) accounts linked to your Facebook Page for publishing Instagram Reels.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] space-y-1.5">
              <div className="flex items-center gap-2 text-red-500">
                <Youtube className="w-4 h-4" />
                <span className="text-xs font-bold text-white">YouTube Channels</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Connects YouTube channels using Google OAuth 2.0 and YouTube Data API v3 to upload regular videos and Shorts.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Information We Access */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">2. Information We Access and Collect</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            We only access and collect data that is strictly necessary for our automated publishing features. We request access <strong className="text-white">only after you explicitly grant permission</strong> through official OAuth consent dialogs provided by Google or Meta:
          </p>

          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Account Identifiers:</strong> Unique public IDs such as Facebook Page ID, Instagram Business Account ID, and YouTube Channel ID.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Page and Channel Information:</strong> Facebook Page name, YouTube channel title, and Instagram username so you can identify your connected accounts in the dashboard.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Profile Information:</strong> Public channel/page profile pictures and connected Google/Facebook email addresses, used solely for account identification.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">OAuth Authorization Tokens:</strong> Access tokens and refresh tokens returned by Google and Meta, encrypted securely at rest using industry-standard AES-256 encryption.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Publishing Content:</strong> Video files, captions, titles, tags, and privacy settings uploaded by you specifically for publishing.
              </span>
            </li>
          </ul>

          <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/15 text-xs text-gray-300 leading-relaxed">
            <strong className="text-white">What We Never Access:</strong> We do not access your private direct messages (DMs), friends lists, personal feeds, personal Facebook timelines, browser history, or payment details.
          </div>
        </section>

        {/* Section 3: How Tokens Are Used */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-indigo-400">
              <Lock className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">3. How We Use OAuth Tokens</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            OAuth authorization tokens are used <strong className="text-white">only to publish content and manage connected social accounts</strong> in accordance with your explicit actions:
          </p>

          <div className="space-y-2 text-sm text-gray-300">
            <div className="p-3.5 rounded-xl bg-[#11131A] border border-[#1E2230] flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0 mt-0.5">
                <Share2 className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <strong className="text-white block mb-0.5">Publishing Content:</strong>
                Uploading videos, titles, captions, and tags to your chosen Facebook Page, Instagram account, or YouTube channel when you click Publish or schedule a post.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#11131A] border border-[#1E2230] flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <strong className="text-white block mb-0.5">Maintaining Connection Health:</strong>
                Automatically refreshing expired Google access tokens using stored offline refresh tokens so that scheduled uploads do not fail.
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: We Do Not Sell Data */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-emerald-400">
              <EyeOff className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">4. We Do Not Sell User Data</h2>
          </div>

          <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <h3 className="text-sm font-bold text-emerald-300">Strict Anti-Monetization Guarantee</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              <strong className="text-white">BEWEB Social Automation</strong> does not sell, rent, lease, license, or transfer your personal data, profile information, or social media tokens to any data brokers, marketers, or third-party advertisers. Your information is strictly utilized to operate the publishing services you request.
            </p>
          </div>
        </section>

        {/* Section 5: Account Disconnection & Revocation */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-indigo-400">
              <UserX className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">5. Disconnecting Your Accounts</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            You retain complete control over your connections. Users can disconnect their social accounts at any time:
          </p>

          <ol className="list-decimal list-inside space-y-2 text-xs text-gray-300 pl-2">
            <li>
              Navigate to the <strong className="text-white">Accounts</strong> section of the dashboard.
            </li>
            <li>
              Click the <strong className="text-red-400">Disconnect</strong> button on the respective social platform card (Instagram + Facebook or YouTube).
            </li>
            <li>
              The app immediately deletes the stored access tokens, refresh tokens, and channel metadata from our database.
            </li>
          </ol>

          <p className="text-xs text-gray-400">
            You may also revoke permissions externally at any time via your provider settings:
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11131A] hover:bg-[#181B26] border border-[#272D40] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <span>Google Security Settings</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://www.facebook.com/settings?tab=business_tools"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11131A] hover:bg-[#181B26] border border-[#272D40] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <span>Facebook Business Integrations</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </section>

        {/* Section 6: Data Deletion Request */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">6. User Data Deletion Instructions</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            In compliance with Meta Platform Policies, Google User Data Policies, and global privacy regulations (such as GDPR and CCPA), you have the absolute right to request the complete deletion of all data associated with your account:
          </p>

          <div className="p-4 rounded-xl bg-[#11131A] border border-[#1E2230] space-y-3">
            <h4 className="text-xs font-bold text-white">How to Perform Full Data Deletion:</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              You can permanently delete all stored credentials and account data directly within the application at any time by navigating to <strong className="text-white">Connected Accounts</strong> and clicking <strong className="text-red-400">Disconnect</strong>.
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Upon clicking Disconnect, all access tokens, refresh tokens, and linked channel or page records are instantly and permanently purged from our databases. You can also revoke access at any time directly through your Google Account Security settings or Facebook Business Integrations page.
            </p>
          </div>
        </section>

        {/* Section 7: Third-Party API Terms Compliance */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#272D40] flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-white">7. Platform Terms of Service</h2>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            Our service utilizes official APIs from third-party social platforms. By connecting your accounts, you also agree to adhere to the respective platform terms:
          </p>

          <ul className="space-y-2 text-xs text-gray-400 list-disc list-inside">
            <li>
              <strong className="text-gray-200">YouTube / Google:</strong> Users are subject to the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline"
              >
                YouTube Terms of Service
              </a>{" "}
              and the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline"
              >
                Google Privacy Policy
              </a>.
            </li>
            <li>
              <strong className="text-gray-200">Meta (Facebook & Instagram):</strong> Users are subject to the{" "}
              <a
                href="https://www.facebook.com/terms.php"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline"
              >
                Meta Terms of Service
              </a>{" "}
              and the{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline"
              >
                Meta Privacy Policy
              </a>.
            </li>
          </ul>
        </section>

        {/* 8. Contact Us & Ownership */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">8. Contact Us & Ownership</h2>
          </div>
          <p className="text-gray-300 leading-relaxed text-sm">
            If you have questions, privacy concerns, or data deletion requests regarding BEWEB Social Automation, contact the application owner directly:
          </p>
          <div className="p-4 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-2 text-xs">
            <div>
              <span className="text-gray-400">Application: </span>
              <strong className="text-white">BEWEB Social Automation</strong>
            </div>
            <div>
              <span className="text-gray-400">Owner & Support Contact: </span>
              <a
                href="mailto:explorewithharizz@gmail.com"
                className="text-indigo-400 font-semibold hover:underline"
              >
                explorewithharizz@gmail.com
              </a>
            </div>
            <div>
              <span className="text-gray-400">Response Window: </span>
              <span className="text-gray-300">Within 24–48 business hours</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1E2230] bg-[#090A0F] py-8 text-center text-xs text-gray-500 relative z-10">
        <div className="max-w-5xl mx-auto px-4 space-y-2">
          <p>© {new Date().getFullYear()} BEWEB Social Automation. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 text-[11px] text-gray-400">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span>•</span>
            <Link href="/privacy" className="text-indigo-400 hover:underline">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <span>•</span>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

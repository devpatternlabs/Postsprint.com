import type { Metadata } from "next";
import Link from "next/link";
import {
  Share2,
  Youtube,
  Facebook,
  Instagram,
  ShieldCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  Mail,
  ExternalLink,
  Layers,
  Clock,
  Sparkles,
  KeyRound,
  FileText,
} from "lucide-react";

export const metadata: Metadata = {
  title: "BEWEB Social Automation",
  description:
    "BEWEB Social Automation helps users securely connect and publish content to YouTube, Facebook and Instagram from one dashboard.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#08090E] text-gray-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-600/15 via-purple-600/5 to-transparent blur-[160px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-[#1A1E2C] bg-[#08090E]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform duration-200">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white block leading-tight">
                BEWEB Social Automation
              </span>
              <span className="text-[11px] text-gray-400 block leading-none font-medium">
                Multi-Platform Publishing
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs text-gray-300 font-medium">
            <a href="#about" className="hover:text-white transition-colors">About</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#platforms" className="hover:text-white transition-colors">Platforms</a>
            <a href="#security" className="hover:text-white transition-colors">Security</a>
            <a href="#support" className="hover:text-white transition-colors">Support</a>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-[#151926] border border-transparent hover:border-[#262D40] transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Official Social Media Publishing Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.15]">
            BEWEB Social Automation
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-xl text-gray-300 leading-relaxed">
            BEWEB Social Automation helps users securely connect and publish content to YouTube, Facebook and Instagram from one dashboard.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold shadow-xl shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5"
            >
              <span>Connect Your Accounts</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#121520] hover:bg-[#1A1F30] border border-[#262D40] text-gray-200 hover:text-white text-sm font-semibold transition-colors"
            >
              <span>Sign In to Dashboard</span>
            </Link>
          </div>

          {/* Platform Trust Pills */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-gray-400">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10131E] border border-[#1F2437]">
              <Youtube className="w-4 h-4 text-red-500" />
              <span>YouTube Data API v3</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10131E] border border-[#1F2437]">
              <Facebook className="w-4 h-4 text-blue-500" />
              <span>Meta Graph API v21.0</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10131E] border border-[#1F2437]">
              <Instagram className="w-4 h-4 text-pink-500" />
              <span>Instagram Content Publishing API</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: What BEWEB Social Automation Does */}
      <section id="about" className="py-16 border-t border-[#161926] bg-[#0A0C14]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>Product Capabilities</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              What BEWEB Social Automation Does
            </h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto">
              A unified automation hub engineered to publish high-quality media across official video and social networks simultaneously.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Unified Video Upload</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Upload your video once with custom title, caption, and tags. BEWEB Social Automation dispatches the content to YouTube, Facebook Pages, and Instagram Reels in parallel.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Intelligent Scheduling</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Schedule your video posts across multiple timezones. Scheduled jobs are stored securely and published automatically at the chosen hour.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Strict API Compliance</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                We integrate solely through official developer APIs from Google and Meta. No scraping, no bot automation, and no unauthorized account access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: How It Works & Authorization Guarantee */}
      <section id="how-it-works" className="py-16 border-t border-[#161926]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Authorization & Account Security</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              How Users Connect & Authorize Publishing
            </h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto">
              Transparency and explicit user consent are fundamental to BEWEB Social Automation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">1</span>
                <h4 className="text-sm font-bold text-white">Users Connect Own Accounts</h4>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Users independently connect their own YouTube channels and Meta Business accounts using standard OAuth 2.0 consent windows. We never request or store your social account passwords.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">2</span>
                <h4 className="text-sm font-bold text-white">Publishing Only After Authorization</h4>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Publishing happens <strong>only after explicit user authorization</strong>. BEWEB Social Automation never publishes, modifies, or deletes any video or post without your direct action in the dashboard.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">3</span>
                <h4 className="text-sm font-bold text-white">Revoke & Disconnect Anytime</h4>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                You remain in full control. Disconnecting an account immediately removes all stored OAuth tokens from our database, or you can revoke access anytime in your Google Security settings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Supported Social Platforms */}
      <section id="platforms" className="py-16 border-t border-[#161926] bg-[#0A0C14]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Supported Platforms
            </h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto">
              Direct, verified integrations with leading creator platforms.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="p-5 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/25 flex items-center justify-center text-red-500">
                  <Youtube className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">YouTube</h4>
                  <span className="text-[11px] text-gray-400">Google OAuth 2.0</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Connect your YouTube Channel to upload standard videos and YouTube Shorts directly via YouTube Data API v3 with custom titles and privacy settings.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-500">
                  <Facebook className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Facebook</h4>
                  <span className="text-[11px] text-gray-400">Meta Graph API</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Publish high-resolution videos and status updates to your user-managed Facebook Pages using verified Page Access Tokens.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-600/15 border border-pink-500/25 flex items-center justify-center text-pink-500">
                  <Instagram className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Instagram</h4>
                  <span className="text-[11px] text-gray-400">Instagram Graph API</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Post Instagram Reels to connected Instagram Professional (Creator or Business) accounts linked to your authorized Facebook Page.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Security & Compliance */}
      <section id="security" className="py-16 border-t border-[#161926]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Enterprise-Grade Data Security
            </h2>
            <p className="text-sm text-gray-300 max-w-xl mx-auto leading-relaxed">
              All OAuth access tokens and refresh tokens are encrypted at rest using industry-standard AES-256 encryption. We never sell, share, or monetize user data.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10131E] hover:bg-[#181D2E] border border-[#22273B] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Read Full Privacy Policy</span>
            </Link>
            <Link
              href="/terms"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10131E] hover:bg-[#181D2E] border border-[#22273B] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Read Terms of Service</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Section 5: Support & Contact */}
      <section id="support" className="py-16 border-t border-[#161926] bg-[#0A0C14]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
              <Mail className="w-3.5 h-3.5" />
              <span>Help & Assistance</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Contact Support
            </h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto">
              Need assistance with your account, OAuth authorization, or publishing? The BEWEB Social Automation support team is available to help.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            <div className="p-5 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-2">
              <span className="text-xs font-semibold text-gray-400 block">Email Support</span>
              <a
                href="mailto:explorewithharizz@gmail.com"
                className="text-sm font-bold text-indigo-400 hover:underline flex items-center gap-1.5"
              >
                <span>explorewithharizz@gmail.com</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="text-[11px] text-gray-400 pt-1">
                Inquiries are typically answered within 24–48 business hours.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#10131E] border border-[#1E2437] space-y-2">
              <span className="text-xs font-semibold text-gray-400 block">Application Owner & Developer</span>
              <p className="text-sm font-bold text-white">BEWEB Social Automation</p>
              <p className="text-[11px] text-gray-400 pt-1">
                Owner Contact: <a href="mailto:explorewithharizz@gmail.com" className="text-indigo-400 hover:underline">explorewithharizz@gmail.com</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#161926] bg-[#07080C] py-10 text-xs text-gray-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">BEWEB Social Automation</span>
              <span className="text-[11px] text-gray-400">© {new Date().getFullYear()} BEWEB Social Automation. All rights reserved.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-gray-400">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/signup" className="hover:text-white transition-colors">
              Create Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

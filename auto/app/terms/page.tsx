import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  ShieldCheck,
  Lock,
  Share2,
  ArrowLeft,
  ExternalLink,
  Scale,
  Youtube,
  Facebook,
  Instagram,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for BEWEB Social Automation. Review terms governing our multi-platform social automation and publishing service.",
};

export default function TermsOfServicePage() {
  const lastUpdated = "September 22, 2026";

  return (
    <div className="min-h-screen bg-[#08090E] text-gray-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-indigo-600/10 via-purple-600/5 to-transparent blur-[160px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-[#1A1E2C] bg-[#08090E]/85 backdrop-blur-md">
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
                Multi-Platform Publishing
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#121520] hover:bg-[#1A1F30] border border-[#262D40] text-xs font-medium text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10 relative z-10">
        {/* Title & Introduction */}
        <div className="space-y-3 border-b border-[#1A1E2C] pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <Scale className="w-3.5 h-3.5" />
            <span>Legal Agreement</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Terms of Service
          </h1>

          <p className="text-sm text-gray-400">
            Last Updated: <strong className="text-gray-300 font-semibold">{lastUpdated}</strong>
          </p>

          <p className="text-sm sm:text-base text-gray-300 leading-relaxed pt-2">
            Welcome to <strong className="text-white">BEWEB Social Automation</strong> (&quot;Service&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the BEWEB Social Automation web platform located at <strong className="text-indigo-400">https://socialauto-official.vercel.app</strong> and any associated APIs, tools, and services.
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">
            By creating an account, connecting a social media account, or utilizing any features of BEWEB Social Automation, you agree to be legally bound by these Terms and our Privacy Policy. If you do not agree to these Terms, please do not use our Service.
          </p>
        </div>

        {/* Section 1: Acceptance of Terms */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>1. Acceptance of Terms</span>
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            By accessing or using <strong className="text-white">BEWEB Social Automation</strong>, you represent and warrant that you are at least 18 years old or the age of legal majority in your jurisdiction, and have full legal power and authority to enter into these Terms on your own behalf or on behalf of the business entity you represent.
          </p>
        </section>

        {/* Section 2: Description of the Service */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>2. Description of the Service</span>
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            <strong className="text-white">BEWEB Social Automation</strong> provides creator productivity software that allows users to connect their own social platform accounts (YouTube, Facebook Pages, and Instagram Professional accounts) via official OAuth 2.0 and publish or schedule multimedia content, titles, and descriptions across multiple platforms from a unified dashboard.
          </p>
        </section>

        {/* Section 3: User Accounts & Connection of Own Accounts */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>3. User Accounts and Account Ownership</span>
          </h2>
          <div className="space-y-2 text-sm text-gray-300 leading-relaxed">
            <p>
              Users connect their own social platform accounts directly using official third-party authorization dialogs:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 pl-2">
              <li>You must possess all necessary rights and administrative permissions for any YouTube channel, Facebook Page, or Instagram account you connect to BEWEB Social Automation.</li>
              <li>You are strictly responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You agree to notify us immediately of any unauthorized access or security breach involving your account.</li>
            </ul>
          </div>
        </section>

        {/* Section 4: Explicit Authorization Policy */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>4. Explicit Authorization for Content Publishing</span>
          </h2>
          <div className="p-4 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-2">
            <h4 className="text-xs font-bold text-indigo-400">Strict Publishing Policy</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              BEWEB Social Automation publishes or schedules content <strong className="text-white">only after explicit user authorization</strong>. We do not generate, post, alter, or delete content autonomously without direct user request in the dashboard.
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Users retain 100% ownership and copyright of all video files, images, titles, descriptions, and metadata submitted through the Service.
            </p>
          </div>
        </section>

        {/* Section 5: Third-Party Platform Policies */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>5. Third-Party Platform Terms Compliance</span>
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Our Service relies on and integrates with third-party APIs. By using BEWEB Social Automation to connect to and publish on these platforms, you explicitly agree to comply with the respective terms and policies:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-1.5">
              <div className="flex items-center gap-2 text-red-500">
                <Youtube className="w-4 h-4" />
                <span className="text-xs font-bold text-white">YouTube</span>
              </div>
              <p className="text-[11px] text-gray-400">
                You agree to be bound by the{" "}
                <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  YouTube Terms of Service
                </a>{" "}
                and the{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  Google Privacy Policy
                </a>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-1.5">
              <div className="flex items-center gap-2 text-blue-500">
                <Facebook className="w-4 h-4" />
                <span className="text-xs font-bold text-white">Facebook</span>
              </div>
              <p className="text-[11px] text-gray-400">
                You agree to adhere to the{" "}
                <a href="https://www.facebook.com/terms.php" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  Meta Terms of Service
                </a>{" "}
                and Meta Platform Policies.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-1.5">
              <div className="flex items-center gap-2 text-pink-500">
                <Instagram className="w-4 h-4" />
                <span className="text-xs font-bold text-white">Instagram</span>
              </div>
              <p className="text-[11px] text-gray-400">
                You agree to comply with the{" "}
                <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  Instagram Terms of Use
                </a>{" "}
                and Community Guidelines.
              </p>
            </div>
          </div>
        </section>

        {/* Section 6: Prohibited Activities */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>6. Prohibited Activities</span>
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            You agree NOT to use BEWEB Social Automation to:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 pl-2">
            <li>Publish content that violates copyright, trademark, privacy, or other intellectual property rights.</li>
            <li>Distribute spam, malware, deceptive schemes, or misleading clickbait content.</li>
            <li>Post violent, abusive, defamatory, sexually explicit, or unlawful media.</li>
            <li>Attempt to reverse-engineer, decompile, or tamper with the application infrastructure or API protocols.</li>
            <li>Circumvent or attempt to bypass platform upload limits, quotas, or security safeguards.</li>
          </ul>
        </section>

        {/* Section 7: Account Disconnection and Termination */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>7. Disconnection and Account Termination</span>
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            You may disconnect any connected social account or terminate your BEWEB Social Automation service at any time through the <strong className="text-white">Connected Accounts</strong> interface or by revoking permissions directly in your Google Security settings or Facebook Business Integrations page. Upon disconnection, stored access tokens and refresh tokens are permanently purged.
          </p>
        </section>

        {/* Section 8: Disclaimer of Warranties */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>8. Disclaimer of Warranties & Limitation of Liability</span>
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            BEWEB Social Automation is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express or implied. In no event shall BEWEB Social Automation, its developers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages arising from the use of or inability to use the Service or changes in third-party API availability.
          </p>
        </section>

        {/* Section 9: Support and Contact */}
        <section className="space-y-4 border-t border-[#1A1E2C] pt-6">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">9. Contact Support</h2>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            If you have questions, feedback, or need assistance regarding these Terms of Service or BEWEB Social Automation, please contact our support team:
          </p>
          <div className="p-4 rounded-xl bg-[#10131E] border border-[#1E2437] space-y-2 text-xs">
            <div>
              <span className="text-gray-400">Application: </span>
              <strong className="text-white">BEWEB Social Automation</strong>
            </div>
            <div>
              <span className="text-gray-400">Owner & Support Email: </span>
              <a href="mailto:explorewithharizz@gmail.com" className="text-indigo-400 font-semibold hover:underline">
                explorewithharizz@gmail.com
              </a>
            </div>
            <div>
              <span className="text-gray-400">Response Time: </span>
              <span className="text-gray-300">Within 24–48 business hours</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1A1E2C] bg-[#07080C] py-8 text-center text-xs text-gray-400 relative z-10">
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
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

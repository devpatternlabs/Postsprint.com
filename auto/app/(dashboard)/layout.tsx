import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { MockModeBadge } from "@/components/MockModeBadge";

import { getAuthenticatedUser } from "@/lib/auth/session";

import { ThemeToggle } from "@/components/ThemeToggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { email: string; displayName: string; profileImage?: string } | null = null;
  const authUser = await getAuthenticatedUser();

  if (authUser) {
    user = {
      email: authUser.email || "",
      displayName: authUser.name || authUser.email.split("@")[0] || "Creator",
      profileImage: authUser.profileImage || undefined,
    };
  }

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground transition-colors duration-200">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <MobileNav />
        {/* Top bar for mock indicator, theme switcher, and status */}
        <header className="px-6 py-3 border-b border-gray-200 dark:border-[#1E2230]/60 bg-white/80 dark:bg-[#0D0F17]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-30 transition-colors">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:inline">
            BEWEB Social Automation Engine
          </span>
          <div className="flex items-center gap-3">
            <MockModeBadge />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

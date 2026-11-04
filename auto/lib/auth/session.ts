import { cookies } from "next/headers";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AppUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  profileImage: string | null;
  createdAt: string;
}

import os from "os";

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), "postflow_data")
  : path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "app_users.json");
const SESSION_COOKIE = "socialauto_session";

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[Auth] Could not create data directory", err);
  }
}

export function getAllUsers(): AppUser[] {
  try {
    ensureDataDir();
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) || [];
    }
  } catch (err) {
    console.warn("[Auth] Could not read app_users.json", err);
  }
  return [];
}

export function saveAllUsers(users: AppUser[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Auth] Could not write app_users.json", err);
  }
}

export async function findOrCreateUser(profile: {
  googleId: string;
  email: string;
  name: string;
  picture: string;
}): Promise<AppUser> {
  // 1. Check Supabase profiles table first so existing connected accounts match
  try {
    const admin = createAdminClient();
    const { data: dbProfile } = await admin
      .from("profiles")
      .select("*")
      .eq("email", profile.email)
      .maybeSingle();

    if (dbProfile) {
      return {
        id: dbProfile.id,
        googleId: profile.googleId,
        email: dbProfile.email,
        name: dbProfile.display_name || profile.name,
        profileImage: profile.picture,
        createdAt: dbProfile.created_at,
      };
    }
  } catch (err) {
    // Supabase query error - continue to local store
  }

  const allUsers = getAllUsers();
  let user = allUsers.find((u) => u.googleId === profile.googleId || u.email === profile.email);

  if (user) {
    user.name = profile.name;
    user.profileImage = profile.picture;
    user.googleId = profile.googleId;
    saveAllUsers(allUsers);
  } else {
    user = {
      id: "usr_" + crypto.randomBytes(12).toString("hex"),
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      profileImage: profile.picture,
      createdAt: new Date().toISOString(),
    };
    allUsers.push(user);
    saveAllUsers(allUsers);

    try {
      const admin = createAdminClient();
      await admin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        display_name: user.name,
      }, { onConflict: "id" });
    } catch {}
  }

  return user;
}

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"; // 32 bytes fallback

function encryptSession(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptSession(encryptedText: string): string | null {
  try {
    const parts = encryptedText.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
}

export function setSession(user: AppUser) {
  const payload = JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    profileImage: user.profileImage,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  
  const encrypted = encryptSession(payload);
  
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function getSession(): AppUser | null {
  const cookieStore = cookies();
  const val = cookieStore.get(SESSION_COOKIE)?.value;
  if (!val) return null;

  const decrypted = decryptSession(val);
  if (!decrypted) return null;

  try {
    const parsed = JSON.parse(decrypted);
    if (parsed.exp < Date.now()) {
      return null;
    }
    
    // On serverless environments (like Vercel), local files don't persist.
    // The AES-256 encrypted session is secure enough to trust.
    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      googleId: parsed.id,
      profileImage: parsed.profileImage || null,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  const cookieStore = cookies();
  try {
    cookieStore.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    cookieStore.delete(SESSION_COOKIE);
  } catch {}
}

/**
 * Standard secure authenticated user resolver for all API routes and services.
 * Strictly verifies identity from active session. Never falls back to default users.
 */
export async function getAuthenticatedUser(): Promise<AppUser | null> {
  // 1. Check Supabase auth if active
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.id) {
      return {
        id: user.id,
        email: user.email || "",
        name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
        googleId: user.id,
        profileImage: user.user_metadata?.avatar_url || null,
        createdAt: user.created_at || new Date().toISOString(),
      };
    }
  } catch {
    // Supabase auth not active or configured
  }

  // 2. Check custom AES-256 encrypted session cookie
  try {
    const appUser = getSession();
    if (appUser && appUser.id) {
      return appUser;
    }
  } catch {}

  return null;
}

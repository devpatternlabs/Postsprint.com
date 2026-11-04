import crypto from "crypto";
import { AppUser, getAllUsers, saveAllUsers } from "./session";

export interface StoredUser extends AppUser {
  passwordHash?: string;
}

/**
 * Hashes a plain-text password using crypto.scrypt with a random 16-byte salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a password against the stored salt:hash string.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Registers a new user with email and password.
 */
export async function registerWithPassword(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user?: AppUser; error?: string }> {
  const { name, email, password } = params;
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  const allUsers = getAllUsers() as StoredUser[];
  const existing = allUsers.find((u) => u.email.toLowerCase() === cleanEmail);

  if (existing) {
    return { error: "An account with this email already exists. Please log in." };
  }

  const newUser: StoredUser = {
    id: "usr_" + crypto.randomBytes(12).toString("hex"),
    googleId: "",
    email: cleanEmail,
    name: name.trim() || cleanEmail.split("@")[0],
    profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  allUsers.push(newUser);
  saveAllUsers(allUsers as AppUser[]);

  return { user: newUser };
}

/**
 * Authenticates a user with email and password.
 */
export async function authenticateWithPassword(params: {
  email: string;
  password: string;
}): Promise<{ user?: AppUser; error?: string }> {
  const { email, password } = params;
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    return { error: "Email and password are required." };
  }

  const allUsers = getAllUsers() as StoredUser[];
  const user = allUsers.find((u) => u.email.toLowerCase() === cleanEmail);

  if (!user || !user.passwordHash) {
    return { error: "Invalid email or password." };
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  return { user };
}

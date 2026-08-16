import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { users } from "../db/schema";
import { getChatGPTUser, chatGPTSignInPath, type ChatGPTUser } from "../app/chatgpt-auth";

// Emails granted catalog-management rights. Edit this list to add admins.
const ADMIN_EMAILS = new Set<string>([]);

export type AppUser = {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

// Local `npm run dev` never receives the `oai-authenticated-user-email`
// header — that's injected by the ChatGPT Sites dispatch proxy, which only
// exists once the site is actually published there. Without this fallback,
// every page load in local dev would just bounce to a sign-in route that
// doesn't exist outside that platform. Never active in a production build.
const DEV_FALLBACK_USER: ChatGPTUser | null =
  process.env.NODE_ENV === "production"
    ? null
    : { displayName: "Você (dev local)", email: "dev-local@beerrats.app", fullName: "Você (dev local)" };

async function resolveChatGPTUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  return user ?? DEV_FALLBACK_USER;
}

export async function requireAppUser(returnTo: string): Promise<AppUser> {
  const chatGPTUser = await resolveChatGPTUser();
  if (!chatGPTUser) redirect(chatGPTSignInPath(returnTo));
  return getOrCreateUser(chatGPTUser);
}

// For API route handlers: never redirects, returns null when signed out so
// the route can respond with 401 JSON instead of an HTML redirect.
export async function getAppUser(): Promise<AppUser | null> {
  const chatGPTUser = await resolveChatGPTUser();
  if (!chatGPTUser) return null;
  return getOrCreateUser(chatGPTUser);
}

export async function getOrCreateUser(chatGPTUser: ChatGPTUser): Promise<AppUser> {
  const db = getDb();
  const email = chatGPTUser.email;
  const displayName = chatGPTUser.fullName ?? chatGPTUser.email.split("@")[0];
  const isAdmin = ADMIN_EMAILS.has(email) ? 1 : 0;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    const row = existing[0];
    if (row.displayName !== displayName || (row.isAdmin === 1) !== (isAdmin === 1)) {
      await db.update(users).set({ displayName, isAdmin }).where(eq(users.id, row.id));
    }
    return { id: row.id, email: row.email, displayName, isAdmin: isAdmin === 1 };
  }

  const [created] = await db
    .insert(users)
    .values({ email, displayName, isAdmin })
    .returning();
  return { id: created.id, email: created.email, displayName, isAdmin: isAdmin === 1 };
}

export function avatarInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  ageConfirmed: integer("age_confirmed").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

export const drinks = sqliteTable("drinks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  abv: real("abv").notNull(),
  note: text("note"),
  active: integer("active").notNull().default(1),
}, (t) => ({
  categoryIdx: index("drinks_category_idx").on(t.category),
}));

export const communities = sqliteTable("communities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("🍻"),
  inviteCode: text("invite_code").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  inviteCodeIdx: uniqueIndex("communities_invite_code_idx").on(t.inviteCode),
}));

export const communityMembers = sqliteTable("community_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  memberIdx: uniqueIndex("community_members_unique_idx").on(t.communityId, t.userId),
  communityIdx: index("community_members_community_idx").on(t.communityId),
  userIdx: index("community_members_user_idx").on(t.userId),
}));

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  name: text("name").notNull(),
  prize: text("prize"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  communityIdx: index("events_community_idx").on(t.communityId, t.startsAt),
}));

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  communityId: integer("community_id").references(() => communities.id),
  drinkId: integer("drink_id").notNull().references(() => drinks.id),
  title: text("title").notNull(),
  description: text("description"),
  amountRaw: real("amount_raw").notNull(),
  unitLabel: text("unit_label").notNull(),
  amountMl: integer("amount_ml").notNull(),
  points: integer("points").notNull(),
  photoKey: text("photo_key").notNull(),
  // 1 = an image model confirmed a drink is visible, null = unverified
  // (no AI binding available, or it didn't return a confident answer).
  // Never set to a hard 0 here — a confident "not a drink" is rejected
  // before the check-in is ever inserted.
  photoVerified: integer("photo_verified"),
  flagged: integer("flagged").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userIdx: index("checkins_user_idx").on(t.userId),
  communityIdx: index("checkins_community_idx").on(t.communityId, t.createdAt),
  createdAtIdx: index("checkins_created_at_idx").on(t.createdAt),
}));

import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  admin: text("admin").notNull(),
  whatsapp: text("whatsapp").notNull().default(""),
  anchor: text("anchor").notNull(),
});

export const marketers = sqliteTable("marketers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  password: text("password").notNull(),
  active: integer("active").notNull().default(1),
  rate: integer("rate").notNull(),
  method: text("method"),
  beneficiary: text("beneficiary"),
  account: text("account"),
});

export const payouts = sqliteTable("payouts", {
  id: text("id").primaryKey(),
  marketer: text("marketer").notNull().references(() => marketers.id),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  reference: text("reference").notNull(),
  method: text("method").notNull(),
  beneficiary: text("beneficiary").notNull(),
  account: text("account").notNull(),
}, table => [uniqueIndex("payout_marketer_reference").on(table.marketer, table.reference)]);

export const referrals = sqliteTable("referrals", {
  id: text("id").primaryKey(),
  marketer: text("marketer").notNull().references(() => marketers.id),
  customer: text("customer").notNull(),
  project: text("project").notNull(),
  rate: integer("rate").notNull(),
  date: text("date").notNull(),
  state: text("state").notNull().default("pending"),
  paid: integer("paid").notNull().default(0),
  commission: integer("commission").notNull().default(0),
});

export const history = sqliteTable("history", {
  id: text("id").primaryKey(),
  referral: text("referral").notNull().references(() => referrals.id),
  state: text("state").notNull(),
  paid: integer("paid").notNull(),
  commission: integer("commission").notNull(),
  date: text("date").notNull(),
});


export const earnings = sqliteTable("earnings", {
  id: text("id").primaryKey(),
  referral: text("referral").notNull().references(() => referrals.id),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  payout: text("payout").references(() => payouts.id),
});


export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  principal: text("principal").notNull(),
  expires: integer("expires").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  bucket: text("bucket").primaryKey(),
  attempts: integer("attempts").notNull(),
  expires: integer("expires").notNull(),
});

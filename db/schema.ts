import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text().notNull(),
  username: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text().notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const uploads = pgTable("uploads", {
  id: serial().primaryKey(),
  storeId: text("store_id").notNull(),
  storeName: text("store_name").notNull(),
  filename: text().notNull(),
  label: text().notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
  totalItems: doublePrecision("total_items").notNull(),
  totalValue: doublePrecision("total_value").notNull(),
  uniqueSkus: integer("unique_skus").notNull(),
  matched: integer().notNull(),
  results: jsonb().notNull(),
  notFound: jsonb("not_found").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ntiItems = pgTable("nti_items", {
  itemNumber: text("item_number").primaryKey(),
  name: text().notNull(),
  price: doublePrecision().notNull(),
  classification: text().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

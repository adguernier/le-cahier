import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  defaultCostOfLiving: integer("default_cost_of_living").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  archivedAt: integer("archived_at"),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isDefault: integer("is_default").notNull().default(0),
  },
  (t) => ({
    nameIdx: uniqueIndex("categories_name_idx").on(t.name),
  })
);

export const months = sqliteTable(
  "months",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
  },
  (t) => ({
    yearMonthIdx: uniqueIndex("months_year_month_idx").on(t.year, t.month),
  })
);

export const monthlyIncomes = sqliteTable(
  "monthly_incomes",
  {
    monthId: integer("month_id")
      .notNull()
      .references(() => months.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    amount: integer("amount").notNull(),
    costOfLiving: integer("cost_of_living").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.monthId, t.memberId] }),
  })
);

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => months.id, { onDelete: "cascade" }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
});

export const expenseMembers = sqliteTable(
  "expense_members",
  {
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.expenseId, t.memberId] }),
  })
);

import { eq } from "drizzle-orm";
import { db } from "~/lib/db.server";
import { categories } from "~/lib/schema";

const DEFAULTS = [
  "Loyer",
  "Électricité",
  "Gaz",
  "Internet",
  "Eau",
  "Courses",
  "Assurance",
  "Autre",
];

for (const name of DEFAULTS) {
  const existing = db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!existing) {
    db.insert(categories).values({ name, isDefault: 1 }).run();
    console.log(`Seeded category: ${name}`);
  }
}
console.log("Done.");

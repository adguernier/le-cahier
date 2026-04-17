import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run set-password -- <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const sessionSecret = randomBytes(32).toString("hex");

const envPath = ".env";
let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

function upsert(key: string, value: string) {
  // Single-quote values containing $ to prevent dotenv variable expansion
  const quoted = value.includes("$") ? `'${value}'` : value;
  const line = `${key}=${quoted}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    content += `${sep}${line}\n`;
  }
}

upsert("HOUSEHOLD_PASSWORD_HASH", hash);
if (!/^SESSION_SECRET=/m.test(content)) upsert("SESSION_SECRET", sessionSecret);

writeFileSync(envPath, content);
console.log("Password set. .env updated.");

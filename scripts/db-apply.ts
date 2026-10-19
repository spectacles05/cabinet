// Applies a SQL migration file to the Supabase database.
// Usage: npm run db:apply -- supabase/migrations/0002_grants.sql
// Requires SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler connection string).
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function main() {
  const file = process.argv[2];
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!file) throw new Error("Pass the migration file path, e.g. supabase/migrations/0002_grants.sql");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set in .env.local");

  const sql = readFileSync(file, "utf8");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`Applied ${file}`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Print the database error message only (never the connection string).
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

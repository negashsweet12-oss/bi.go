import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();

const getDbCredentials = () => {
  if (databaseUrl) {
    console.log("Using DATABASE_URL to connect to database.");
    return {
      url: databaseUrl,
    };
  }

  const sqlHost = process.env.SQL_HOST;
  const sqlDbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

  if (!sqlHost) {
    throw new Error("DATABASE_URL or SQL_HOST must be set in environment variables.");
  }
  if (!sqlDbName) {
    throw new Error("SQL_DB_NAME must be set in environment variables.");
  }
  if (!user) {
    throw new Error("SQL_ADMIN_USER must be set in environment variables.");
  }
  if (!password) {
    throw new Error("SQL_ADMIN_PASSWORD must be set in environment variables.");
  }
  console.log(`Using user: ${user} to connect to database.`);

  return {
    host: sqlHost,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: false,
  };
};

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: getDbCredentials(),
  verbose: true,
});

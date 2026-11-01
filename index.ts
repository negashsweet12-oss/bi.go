import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    let connectionString =
      process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();

    if (connectionString) {
      if (
        !process.env.TARGET_DB &&
        connectionString.includes('cloud_sql_development_database')
      ) {
        connectionString = connectionString.replace(
          'cloud_sql_development_database',
          'cloud_sql_production_database'
        );
      }

      const isLocal =
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1') ||
        connectionString.includes('/cloudsql/');
      const disableSsl = connectionString.includes('sslmode=disable');

      global._postgresPool = new Pool({
        connectionString,
        ...(isLocal || disableSsl
          ? {}
          : {
              ssl: {
                rejectUnauthorized: false,
              },
            }),
        max: 20,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 35000,
        keepAlive: true,
      });
    } else {
      const databaseName =
        process.env.TARGET_DB ||
        (process.env.SQL_DB_NAME && process.env.SQL_DB_NAME !== 'cloud_sql_development_database'
          ? process.env.SQL_DB_NAME
          : 'cloud_sql_production_database');

      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: databaseName,
        max: 20,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 35000,
        keepAlive: true,
      });
    }

    // Wrap pool.query with automatic retry for transient Cloud SQL scale-to-zero wake-up timeouts
    const rawQuery = global._postgresPool.query.bind(global._postgresPool);
    (global._postgresPool as any).query = async (...args: any[]) => {
      // Only wrap Promise-returning calls (when no callback is passed as the last argument)
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'function') {
        return rawQuery(...(args as [any]));
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await rawQuery(...(args as [any]));
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          const isTransientConnect =
            msg.includes('timeout exceeded when trying to connect') ||
            msg.includes('Connection terminated') ||
            msg.includes('connection ended') ||
            msg.includes('ECONNRESET');
          if (attempt === 0 && isTransientConnect) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          throw err;
        }
      }
    };

    global._postgresPool.on('error', (err) => {
      console.warn('Idle SQL pool client notice:', err?.message || err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });

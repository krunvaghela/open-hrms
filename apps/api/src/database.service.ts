import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { migrations } from './migrations';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    for (const key of ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
      if (!process.env[key]) throw new Error(`Missing required configuration: ${key}`);
    }
    this.pool = new Pool({
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      statement_timeout: 3000,
      query_timeout: 4000,
      application_name: 'open-hrms-api',
    });
    this.pool.on('error', () => this.logger.error('An idle PostgreSQL connection failed.'));
  }

  async onModuleInit(): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427001)');
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      for (const migration of migrations) {
        const applied = await client.query('SELECT id FROM schema_migrations WHERE id = $1', [
          migration.id,
        ]);
        if (!applied.rowCount) {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        }
      }
    });
  }

  query<T extends QueryResultRow = any>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

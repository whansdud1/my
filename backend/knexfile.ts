import type { Knex } from 'knex';
import { config } from './src/config.js';

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    },
    migrations: { directory: './src/db/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './src/db/seeds' },
    pool: { min: 2, max: 10 },
  },
  production: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    },
    migrations: { directory: './dist/db/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './dist/db/seeds' },
    pool: { min: 2, max: 30 },
  },
};

export default knexConfig;

import { config } from 'dotenv';
import { resolve } from 'node:path';

const result = config({
  path: resolve(__dirname, '../.env.test'),
  override: true,
});

if (result.error) {
  throw result.error;
}

const databaseUrl = process.env.DATABASE_URL;

if (
  !databaseUrl ||
  !databaseUrl.includes('/nexus_test')
) {
  throw new Error(
    'SECURITE E2E : les tests doivent utiliser la base nexus_test',
  );
}
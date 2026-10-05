import { openDatabase } from '@/index/database.ts';
import { loadConfig } from '@/shared/config.ts';

type Db = ReturnType<typeof openDatabase>;

let handle: Db | undefined;

/** Open the database once and reuse it for the life of the process. */
export function getDb(): Db {
  if (!handle) handle = openDatabase(loadConfig().dbPath);
  return handle;
}

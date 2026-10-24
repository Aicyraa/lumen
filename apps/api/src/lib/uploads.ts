import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

// Upload files are named "<tenantId>__<uuid>" so a deleted project's leftovers can be found. Ids are made of letters, digits and "-" only,
// so the "__" separator can never appear inside the id part and one tenant's prefix cannot match another's files.
const safe = (tenantId: string) => tenantId.replace(/[^A-Za-z0-9-]/g, "-");
export const uploadName = (tenantId: string, uuid: string) => `${safe(tenantId)}__${uuid}`;

// Returns how many files were removed; a missing directory or file is not an error.
export async function removeTenantUploads(dir: string, tenantId: string): Promise<number> {
  const prefix = `${safe(tenantId)}__`;
  let removed = 0;
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (name.startsWith(prefix) && await unlink(join(dir, name)).then(() => true, () => false)) removed++;
  }
  return removed;
}

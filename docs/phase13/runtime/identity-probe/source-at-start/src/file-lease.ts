import { open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
/** Local single-writer lease; not a distributed filesystem lock. */
export async function acquireFileLease(path: string) {
  const token = randomUUID(),
    payload = JSON.stringify({ pid: process.pid, token });
  for (let attempt = 0; attempt < 2; attempt++) {
    let file;
    try {
      file = await open(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raw = await readFile(path, "utf8");
      let owner: { pid: number };
      try {
        owner = JSON.parse(raw);
      } catch {
        throw Error("Invalid raw writer lock; inspection required");
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
        throw Error("Invalid raw writer lock");
      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code === "ESRCH" &&
          (await readFile(path, "utf8")) === raw
        ) {
          await unlink(path);
          continue;
        }
        throw e;
      }
      throw Error("Raw audit file already has an active writer");
    }
    try {
      await file.writeFile(payload);
      await file.sync();
    } finally {
      await file.close();
    }
    return async () => {
      if ((await readFile(path, "utf8")) !== payload)
        throw Error("Raw writer lease ownership changed");
      await unlink(path);
    };
  }
  throw Error("Unable to acquire raw writer lease");
}

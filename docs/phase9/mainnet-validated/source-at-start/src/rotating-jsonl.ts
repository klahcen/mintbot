import {
  open,
  rename,
  readdir,
  stat,
  unlink,
  readFile,
  statfs,
} from "node:fs/promises";
import { acquireFileLease } from "./file-lease.js";
import { constants } from "node:fs";
import { dirname, basename, join } from "node:path";
import { BoundedStage } from "./stages.js";
import { telemetry, type Telemetry } from "./telemetry.js";
interface Archive {
  name: string;
  bytes: number;
  firstSlot: number | null;
  lastSlot: number | null;
}
export interface RotationOptions {
  maxBytes?: number;
  maxArchives?: number;
  capacity?: number;
}
/** Bounded single writer; retention tombstones are fsynced before archive removal. Never touches a WAL. */
export class RotatingJsonl {
  private release: (() => Promise<void>) | undefined;
  private stage: BoundedStage;
  private bytes = 0;
  private sequence = 0;
  private archives: Archive[] = [];
  private deletedBytes = 0;
  private deletedFiles = 0;
  private firstSlot: number | null = null;
  private lastSlot: number | null = null;
  private diskAvailableBytes: number | null = null;
  private removedThrough = 0;
  private removedCoverage: {
    fromSlot: number | null;
    toSlot: number | null;
    unknown: boolean;
  } = { fromSlot: null, toSlot: null, unknown: false };
  private constructor(
    readonly path: string,
    private options: RotationOptions,
    private metrics: Telemetry,
  ) {
    if (
      !Number.isSafeInteger(options.maxBytes ?? 16 * 1024 * 1024) ||
      (options.maxBytes ?? 16 * 1024 * 1024) < 1024 ||
      !Number.isInteger(options.maxArchives ?? 4) ||
      (options.maxArchives ?? 4) < 1 ||
      (options.maxArchives ?? 4) > 64
    )
      throw Error("Invalid rotation bounds");
    this.stage = new BoundedStage(
      "raw.persistence",
      options.capacity ?? 64,
      1,
      metrics,
    );
  }
  static async open(
    path: string,
    options: RotationOptions = {},
    metrics: Telemetry = telemetry,
  ) {
    const w = new RotatingJsonl(path, options, metrics);
    w.release = await acquireFileLease(path + ".writer.lock");
    try {
      try {
        const saved = JSON.parse(
          await readFile(path + ".retention.json", "utf8"),
        );
        if (saved.version !== 1 || !Array.isArray(saved.archives))
          throw Error("Invalid retention manifest");
        w.sequence = saved.sequence;
        w.deletedBytes = saved.deletedBytes;
        w.deletedFiles = saved.deletedFiles;
        w.archives = saved.archives;
        w.removedThrough = saved.removedThrough ?? 0;
        w.removedCoverage = saved.removedCoverage ?? w.removedCoverage;
        if (
          !Number.isSafeInteger(w.sequence) ||
          w.sequence < 0 ||
          !Number.isSafeInteger(w.deletedFiles) ||
          w.deletedFiles < 0 ||
          !Number.isSafeInteger(w.deletedBytes) ||
          w.deletedBytes < 0 ||
          w.archives.length > 128
        )
          throw Error("Invalid bounded retention metadata");
        for (const a of w.archives)
          if (
            !new RegExp(
              "^" +
                basename(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                "\\.archive-\\d{10}$",
            ).test(a.name)
          )
            throw Error("Invalid archive ownership");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      try {
        w.bytes = (await stat(path)).size;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      // Discover rename-before-manifest crash orphans; adopt them without deleting their contents silently.
      for (const name of await readdir(dirname(path))) {
        const prefix = basename(path) + ".archive-";
        if (
          name.startsWith(prefix) &&
          /^\d{10}$/.test(name.slice(prefix.length))
        ) {
          w.sequence = Math.max(w.sequence, Number(name.slice(prefix.length)));
          if (Number(name.slice(prefix.length)) <= w.removedThrough) {
            await unlink(join(dirname(path), name));
            continue;
          }
          if (!w.archives.some((a) => a.name === name))
            w.archives.push({
              name,
              bytes: (await stat(join(dirname(path), name))).size,
              firstSlot: null,
              lastSlot: null,
            });
        }
      }
      w.archives.sort((a, b) => a.name.localeCompare(b.name));
      await w.retain();
      return w;
    } catch (error) {
      await w.release();
      throw error;
    }
  }
  append(value: { slot?: number; [key: string]: unknown }) {
    const line = Buffer.from(JSON.stringify(value) + "\n");
    if (
      line.length >
      Math.min(262144 + 16384, this.options.maxBytes ?? 16 * 1024 * 1024)
    )
      return Promise.reject(Error("Raw record exceeds bound"));
    const task = this.stage.trySubmit(async () => {
      if (
        this.bytes + line.length >
          (this.options.maxBytes ?? 16 * 1024 * 1024) &&
        this.bytes
      ) {
        const name =
          basename(this.path) +
          ".archive-" +
          String(++this.sequence).padStart(10, "0");
        await rename(this.path, join(dirname(this.path), name));
        this.archives.push({
          name,
          bytes: this.bytes,
          firstSlot: this.firstSlot,
          lastSlot: this.lastSlot,
        });
        this.bytes = 0;
        this.firstSlot = null;
        this.lastSlot = null;
        await this.retain();
        this.metrics.increment("raw.rotations");
      }
      const file = await open(
        this.path,
        constants.O_WRONLY |
          constants.O_APPEND |
          constants.O_CREAT |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(line);
      } finally {
        await file.close();
      }
      this.bytes += line.length;
      const slot = typeof value.slot === "number" ? value.slot : null;
      if (this.firstSlot === null) this.firstSlot = slot;
      this.lastSlot = slot;
      const fs = await statfs(dirname(this.path));
      this.diskAvailableBytes = fs.bavail * fs.bsize;
    });
    return (
      task ?? Promise.reject(Error("Raw persistence backlog capacity exceeded"))
    );
  }
  private async retain() {
    const remove = this.archives.slice(
      0,
      Math.max(0, this.archives.length - (this.options.maxArchives ?? 4)),
    );
    // Keep tombstones as cumulative totals and most recent deleted ranges; preserve bounded coverage evidence.
    const coverage = { ...this.removedCoverage };
    for (const a of remove) {
      if (a.firstSlot === null || a.lastSlot === null) coverage.unknown = true;
      else {
        coverage.fromSlot =
          coverage.fromSlot === null
            ? a.firstSlot
            : Math.min(coverage.fromSlot, a.firstSlot);
        coverage.toSlot =
          coverage.toSlot === null
            ? a.lastSlot
            : Math.max(coverage.toSlot, a.lastSlot);
      }
    }
    const removedThrough = remove.length
      ? Number(remove.at(-1)!.name.split(".archive-").at(-1))
      : this.removedThrough;
    const next = {
      version: 1,
      removedThrough,
      removedCoverage: coverage,
      sequence: this.sequence,
      archives: this.archives.filter((a) => !remove.includes(a)),
      deletedFiles: this.deletedFiles + remove.length,
      deletedBytes:
        this.deletedBytes + remove.reduce((sum, a) => sum + a.bytes, 0),
      lastRemoved: remove.slice(-64),
    };
    const file = await open(this.path + ".retention.json.tmp", "w", 0o600);
    try {
      await file.writeFile(JSON.stringify(next) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(
      this.path + ".retention.json.tmp",
      this.path + ".retention.json",
    );
    const dir = await open(dirname(this.path), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    for (const a of remove)
      try {
        await unlink(join(dirname(this.path), a.name));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    this.archives = next.archives;
    this.deletedFiles = next.deletedFiles;
    this.deletedBytes = next.deletedBytes;
    this.removedThrough = removedThrough;
    this.removedCoverage = coverage;
  }
  status() {
    return {
      removedCoverage: this.removedCoverage,
      bytes: this.bytes,
      archives: this.archives.length,
      archiveBytes: this.archives.reduce((s, a) => s + a.bytes, 0),
      deletedFiles: this.deletedFiles,
      deletedBytes: this.deletedBytes,
      diskAvailableBytes: this.diskAvailableBytes,
      maxBytes: this.options.maxBytes ?? 16 * 1024 * 1024,
      maxArchives: this.options.maxArchives ?? 4,
    };
  }
  async close() {
    this.stage.close();
    await this.stage.drain();
    if (this.release) {
      const release = this.release;
      this.release = undefined;
      await release();
    }
  }
}

import { PublicKey } from "@solana/web3.js";
/** Strict bounded reader for the pinned IDL field subset, never a best-effort layout guess. */
export class BorshReader {
  private offset = 0;
  constructor(
    private bytes: Buffer,
    private types: any[] = [],
  ) {
    if (bytes.length > 262144) throw Error("Binary layout exceeds bound");
  }
  take(n: number) {
    if (
      !Number.isSafeInteger(n) ||
      n < 0 ||
      this.offset + n > this.bytes.length
    )
      throw Error("Truncated binary layout");
    const b = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return b;
  }
  read(type: any, depth = 0): any {
    if (depth > 16) throw Error("Nested layout bound");
    if (typeof type === "string") {
      if (type === "pubkey") return new PublicKey(this.take(32)).toBase58();
      if (type === "bool") {
        const n = this.take(1)[0];
        if (n !== 0 && n !== 1) throw Error("Invalid boolean");
        return n === 1;
      }
      if (type === "string") {
        const n = this.take(4).readUInt32LE();
        if (n > 4096) throw Error("String bound");
        return new TextDecoder("utf-8", { fatal: true }).decode(this.take(n));
      }
      const sizes: Record<string, number> = {
        u8: 1,
        i8: 1,
        u16: 2,
        i16: 2,
        u32: 4,
        i32: 4,
        u64: 8,
        i64: 8,
        u128: 16,
        i128: 16,
      };
      const size = sizes[type];
      if (!size) throw Error("Unsupported pinned primitive");
      const bytes = this.take(size);
      let value = 0n;
      for (let i = size - 1; i >= 0; i--)
        value = (value << 8n) | BigInt(bytes[i]!);
      if (type[0] === "i" && bytes[size - 1]! & 128)
        value -= 1n << BigInt(size * 8);
      return size <= 4 ? Number(value) : value.toString();
    }
    if (type.defined) {
      const name =
        typeof type.defined === "string" ? type.defined : type.defined.name;
      const definition = this.types.find((t) => t.name === name)?.type;
      if (!definition) throw Error("Unknown pinned type");
      return this.read(definition, depth + 1);
    }
    if (type.array) {
      const [inner, n] = type.array;
      if (!Number.isInteger(n) || n < 0 || n > 1024) throw Error("Array bound");
      return Array.from({ length: n }, () => this.read(inner, depth + 1));
    }
    if (type.vec) {
      const n = this.take(4).readUInt32LE();
      if (n > 256) throw Error("Vector bound");
      return Array.from({ length: n }, () => this.read(type.vec, depth + 1));
    }
    if (type.option) {
      const present = this.take(1)[0];
      if (present !== 0 && present !== 1) throw Error("Invalid option");
      return present ? this.read(type.option, depth + 1) : null;
    }
    if (type.kind === "struct") {
      const fields = type.fields ?? [];
      if (fields.every((f: any) => typeof f === "string"))
        return fields.map((f: any) => this.read(f, depth + 1));
      return Object.fromEntries(
        fields.map((f: any) => [f.name, this.read(f.type, depth + 1)]),
      );
    }
    throw Error("Unsupported pinned schema");
  }
  fields(fields: any[]) {
    return Object.fromEntries(fields.map((f) => [f.name, this.read(f.type)]));
  }
  finish(allowZeroPadding = false) {
    const remaining = this.bytes.subarray(this.offset);
    if (
      remaining.length &&
      (!allowZeroPadding || remaining.some((x) => x !== 0))
    )
      throw Error("Unknown trailing layout");
  }
}

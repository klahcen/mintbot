import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
/** Synthetic exact-schema protocol data: not an observed mainnet create or market price. */
export function pumpLogs(program: string): string[] {
  const mint = PublicKey.default;
  const curve = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    new PublicKey(program),
  )[0];
  const string = (v: string) => {
    const data = Buffer.from(v);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(data.length);
    return Buffer.concat([len, data]);
  };
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(1000n);
  const data = Buffer.concat([
    Buffer.from([27, 114, 169, 77, 222, 235, 99, 118]),
    string("Synthetic benchmark"),
    string("SIM"),
    string("https://example.invalid/fixture"),
    mint.toBuffer(),
    curve.toBuffer(),
    mint.toBuffer(),
    mint.toBuffer(),
    n,
    n,
    n,
    n,
    n,
    TOKEN_PROGRAM_ID.toBuffer(),
    Buffer.from([0, 1]),
    mint.toBuffer(),
    n,
    n,
    Buffer.from([0, 0]),
  ]);
  return [
    `Program ${program} invoke [1]`,
    `Program data: ${data.toString("base64")}`,
    `Program ${program} success`,
  ];
}

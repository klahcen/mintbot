import test from"node:test";import assert from"node:assert/strict";import{createRequire}from"node:module";
import*as esm from"@solana/buffer-layout-utils";
const require=createRequire(import.meta.url),cjs=require("@solana/buffer-layout-utils"),BN=require("bn.js");
test("Native-free integer layouts match independent BN bytes for every supported width/endian and CJS/ESM API",()=>{
 for(const api of [esm,cjs])for(const bits of[64,128,192,256])for(const be of[false,true]){
 const codec=(api as any)[`u${bits}${be?"be":""}`]("amount");assert.equal(codec.span,bits/8);assert.equal(codec.property,"amount");
 for(let seed=0;seed<40;seed++){const value=seed===0?0n:seed===1?(1n<<BigInt(bits))-1n:(BigInt(seed)*123456789012345678901n)% (1n<<BigInt(bits));const bytes=Buffer.alloc(bits/8+6,0xa5);assert.equal(codec.encode(value,bytes,3),bits/8);assert.equal(codec.decode(bytes,3),value);assert.deepEqual(bytes.subarray(3,-3),new BN(value.toString()).toArrayLike(Buffer,be?"be":"le",bits/8));assert.equal(bytes[0],0xa5);assert.equal(bytes.at(-1),0xa5);}
 }
});
test("Unsafe bigint widths, signed/overflow inputs and truncated windows fail before touching buffers",()=>{
 for(const api of[esm,cjs])for(const make of[api.bigInt,api.bigIntBE]){for(const width of[-1,1.5,4097,Infinity])assert.throws(()=>make(width));const codec=make(8)(),b=Buffer.alloc(8,0xab);for(const v of[-1n,1n<<64n,1 as any]){assert.throws(()=>codec.encode(v,b));assert(b.every(x=>x===0xab));}for(const offset of[-1,1,.5]){assert.throws(()=>codec.decode(b,offset));assert.throws(()=>codec.encode(1n,b,offset));}assert.throws(()=>codec.decode(Buffer.alloc(7)));const zero=make(0)();assert.equal(zero.decode(Buffer.alloc(0)),0n);assert.equal(zero.encode(0n,Buffer.alloc(0)),0);assert.throws(()=>zero.encode(1n,Buffer.alloc(0)));}
});

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, checksum]);
}

// Random RGB pixels produce a valid image whose encoded body stays above 3 MiB.
export function largeImagePng(): Buffer {
  const size = 1024;
  const pixels = randomBytes(size * size * 3);
  const scanlines = Buffer.alloc((size * 3 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    pixels.copy(scanlines, row * (size * 3 + 1) + 1, row * size * 3, (row + 1) * size * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

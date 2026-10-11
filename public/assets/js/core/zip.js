// Streaming ZIP reader built on File.slice() + DecompressionStream. It only
// reads the central directory and the entries we ask for, so multi-gigabyte
// exports open instantly without ever loading the whole archive in memory.
// Supports ZIP64, data descriptors, stored and deflated entries.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_LOC64 = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

const utf8 = new TextDecoder('utf-8');

async function readRange(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function isZip(blob) {
  if (!blob || blob.size < 22) return false;
  const head = await readRange(blob, 0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}

export async function listZip(blob) {
  const tailSize = Math.min(blob.size, 65_557 + 20);
  const tailStart = blob.size - tailSize;
  const tail = await readRange(blob, tailStart, blob.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a valid ZIP archive (or it was cut off while downloading).');

  let count = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tv.getUint32(loc, true) === SIG_LOC64) {
      const recOffset = Number(tv.getBigUint64(loc + 8, true));
      const rec = await readRange(blob, recOffset, recOffset + 56);
      const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      if (rv.getUint32(0, true) === SIG_EOCD64) {
        count = Number(rv.getBigUint64(32, true));
        cdSize = Number(rv.getBigUint64(40, true));
        cdOffset = Number(rv.getBigUint64(48, true));
      }
    }
  }

  const cd = await readRange(blob, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cv.getUint32(p, true) !== SIG_CEN) break;
    const flags = cv.getUint16(p + 8, true);
    const method = cv.getUint16(p + 10, true);
    const dosTime = cv.getUint16(p + 12, true);
    const dosDate = cv.getUint16(p + 14, true);
    let compSize = cv.getUint32(p + 20, true);
    let size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    let offset = cv.getUint32(p + 42, true);
    const path = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen));

    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cv.getUint16(e, true);
      const len = cv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = Number(cv.getBigUint64(q, true));
          q += 8;
        }
        if (compSize === 0xffffffff) {
          compSize = Number(cv.getBigUint64(q, true));
          q += 8;
        }
        if (offset === 0xffffffff) offset = Number(cv.getBigUint64(q, true));
      }
      e += 4 + len;
    }
    p = extraEnd + commentLen;

    if (path.endsWith('/') || path.startsWith('__MACOSX/')) continue;
    const mtime = dosDate
      ? new Date(
          1980 + (dosDate >> 9),
          ((dosDate >> 5) & 15) - 1,
          dosDate & 31,
          dosTime >> 11,
          (dosTime >> 5) & 63,
          (dosTime & 31) * 2,
        ).getTime()
      : 0;
    entries.push({ path, size, compSize, method, offset, mtime, encrypted: Boolean(flags & 1) });
  }
  return entries;
}

export async function readZipEntry(blob, entry) {
  if (entry.encrypted) throw new Error(`"${entry.path}" is password-protected.`);
  const header = await readRange(blob, entry.offset, entry.offset + 30);
  const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (hv.getUint32(0, true) !== SIG_LOC) throw new Error(`Corrupted ZIP entry: ${entry.path}`);
  const start = entry.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const data = blob.slice(start, start + entry.compSize);
  if (entry.method === 0) return new Uint8Array(await data.arrayBuffer());
  if (entry.method === 8) {
    const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`"${entry.path}" uses an unsupported compression method (${entry.method}).`);
}

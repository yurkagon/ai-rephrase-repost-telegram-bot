export function mediaContentType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';

  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';

  if (
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(buffer.toString('ascii', 8, 12))
  )
    return 'video/mp4';

  return undefined;
}

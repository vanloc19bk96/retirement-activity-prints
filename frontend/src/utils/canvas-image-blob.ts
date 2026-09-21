import type { StaticCanvas } from 'fabric'

export type CanvasImageFormat = 'png' | 'jpg'

function uint8ArrayToBlob(bytes: Uint8Array, mimeType: string): Blob {
  const arrayBuffer = (bytes.buffer as ArrayBuffer).slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
  return new Blob([arrayBuffer], { type: mimeType })
}

function bytesToString(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]!)
  return out
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}

function writeUint32BE(bytes: Uint8Array, value: number, offset: number): void {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

function writeUint16BE(bytes: Uint8Array, value: number, offset: number): void {
  bytes[offset] = (value >>> 8) & 0xff
  bytes[offset + 1] = value & 0xff
}

async function setPngDpiMetadata(pngBlob: Blob, dpi: number): Promise<Blob> {
  const raw = new Uint8Array(await pngBlob.arrayBuffer())
  if (raw.length < 8) return pngBlob

  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < signature.length; i += 1) {
    if (raw[i] !== signature[i]) return pngBlob
  }

  const ppm = Math.round(dpi * 39.37007874015748)
  const xppu = Math.max(0, Math.min(0xffffffff, ppm))
  const yppu = xppu

  const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73])
  const physData = new Uint8Array(9)
  writeUint32BE(physData, xppu, 0)
  writeUint32BE(physData, yppu, 4)
  physData[8] = 1

  let offset = 8
  let found = false
  let insertionOffset = -1

  while (offset + 8 <= raw.length) {
    const length = readUint32BE(raw, offset)
    const typeOffset = offset + 4
    const chunkTypeBytes = raw.slice(typeOffset, typeOffset + 4)
    const chunkType = bytesToString(chunkTypeBytes)
    const dataOffset = offset + 8
    const nextOffset = dataOffset + length + 4

    if (nextOffset > raw.length) break

    if (chunkType === 'pHYs') {
      found = true
      const targetLength = length
      if (targetLength === 9) {
        raw.set(physData, dataOffset)
      } else {
        found = false
        insertionOffset = offset
      }

      if (found) {
        const crcBuf = new Uint8Array(4 + 9)
        crcBuf.set(typeBytes, 0)
        crcBuf.set(raw.slice(dataOffset, dataOffset + 9), 4)
        const crc = crc32(crcBuf)
        writeUint32BE(raw, crc, dataOffset + 9)
        return uint8ArrayToBlob(raw, 'image/png')
      }
    } else if (chunkType === 'IDAT' && insertionOffset === -1) {
      insertionOffset = offset
      break
    }

    offset = nextOffset
  }

  const buildChunk = (): Uint8Array => {
    const chunk = new Uint8Array(4 + 4 + 9 + 4)
    writeUint32BE(chunk, 9, 0)
    chunk.set(typeBytes, 4)
    chunk.set(physData, 8)
    const crcBuf = new Uint8Array(4 + 9)
    crcBuf.set(typeBytes, 0)
    crcBuf.set(physData, 4)
    const crc = crc32(crcBuf)
    writeUint32BE(chunk, crc, 8 + 9)
    return chunk
  }

  if (insertionOffset === -1) {
    insertionOffset = raw.length
  }

  const physChunk = buildChunk()
  const out = new Uint8Array(raw.length + physChunk.length)
  out.set(raw.slice(0, insertionOffset), 0)
  out.set(physChunk, insertionOffset)
  out.set(raw.slice(insertionOffset), insertionOffset + physChunk.length)
  return uint8ArrayToBlob(out, 'image/png')
}

async function setJpegDpiMetadata(jpegBlob: Blob, dpi: number): Promise<Blob> {
  const raw = new Uint8Array(await jpegBlob.arrayBuffer())
  if (raw.length < 4) return jpegBlob

  const isJpeg = raw[0] === 0xff && raw[1] === 0xd8
  if (!isJpeg) return jpegBlob

  const target = Math.max(1, Math.min(65535, Math.round(dpi)))

  const insertApp0AtOffset = (insertOffset: number): Blob => {
    const jfifPayload = new Uint8Array(14)
    const bytesJFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]
    jfifPayload.set(bytesJFIF, 0)
    jfifPayload[5] = 0x01
    jfifPayload[6] = 0x02
    jfifPayload[7] = 0x01
    writeUint16BE(jfifPayload, target, 8)
    writeUint16BE(jfifPayload, target, 10)
    jfifPayload[12] = 0x00
    jfifPayload[13] = 0x00

    const segmentLength = 16
    const segment = new Uint8Array(2 + 2 + 14)
    segment[0] = 0xff
    segment[1] = 0xe0
    segment[2] = (segmentLength >>> 8) & 0xff
    segment[3] = segmentLength & 0xff
    segment.set(jfifPayload, 4)

    const out = new Uint8Array(raw.length + segment.length)
    out.set(raw.slice(0, insertOffset), 0)
    out.set(segment, insertOffset)
    out.set(raw.slice(insertOffset), insertOffset + segment.length)
    return uint8ArrayToBlob(out, 'image/jpeg')
  }

  let offset = 2
  while (offset + 4 <= raw.length) {
    if (raw[offset] !== 0xff) {
      offset += 1
      continue
    }

    while (offset < raw.length && raw[offset] === 0xff) offset += 1
    if (offset + 2 > raw.length) break

    const marker = raw[offset]!
    offset += 1

    if (marker === 0xd9 || marker === 0xda) break

    if (offset + 2 > raw.length) break
    const segmentLength = (raw[offset]! << 8) | raw[offset + 1]!
    const segmentDataOffset = offset + 2
    const segmentEnd = segmentDataOffset + segmentLength - 2
    if (segmentEnd > raw.length) break

    if (marker === 0xe0) {
      if (segmentLength >= 14 && raw[segmentDataOffset] === 0x4a && raw[segmentDataOffset + 1] === 0x46) {
        const head = raw.slice(segmentDataOffset, segmentDataOffset + 5)
        if (bytesToString(head) === 'JFIF\0') {
          raw[segmentDataOffset + 7] = 0x01
          writeUint16BE(raw, target, segmentDataOffset + 8)
          writeUint16BE(raw, target, segmentDataOffset + 10)
          return uint8ArrayToBlob(raw, 'image/jpeg')
        }
      }
    }

    offset = segmentDataOffset + segmentLength - 2
  }

  return insertApp0AtOffset(2)
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((res) => res.blob())
}

export async function staticCanvasToImageBlob({
  canvas,
  format,
  exportDpi,
  jpegQuality = 0.92,
  multiplier = 1,
}: {
  canvas: StaticCanvas
  format: CanvasImageFormat
  exportDpi: number
  jpegQuality?: number
  multiplier?: number
}): Promise<Blob> {
  const jpegFormat = 'jpeg'
  const dataUrl = canvas.toDataURL({
    format: format === 'png' ? 'png' : jpegFormat,
    ...(format === 'jpg' ? { quality: jpegQuality } : {}),
    multiplier,
  })

  const blob = await dataUrlToBlob(dataUrl)

  if (format === 'png') {
    return setPngDpiMetadata(blob, exportDpi)
  }
  if (format === 'jpg') {
    return setJpegDpiMetadata(blob, exportDpi)
  }
  return blob
}

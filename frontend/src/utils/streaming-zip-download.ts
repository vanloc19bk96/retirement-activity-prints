import streamSaver from 'streamsaver'

export type ZipStreamEntry = {
  fileName: string
  input: Blob | ReadableStream<Uint8Array> | string
  lastModified?: Date
}

export type ZipFileInput = {
  fileName: string
  blob: Blob
}

export type ZipEntriesFactory = () => AsyncIterable<ZipStreamEntry>

/**
 * Writable target opened during a user gesture.
 * Must receive zip bytes soon after creation — do not leave idle for long exports.
 */
export type ZipStreamTarget = {
  pipeBody: (body: ReadableStream<Uint8Array>) => Promise<void>
  abort: (reason?: unknown) => void
}

const MIN_VALID_ZIP_BYTES = 22
const STREAM_SAVER_MITM_PATH = '/streamsaver/mitm.html?version=2.0.0'

function configureStreamSaverMitm(): void {
  streamSaver.mitm = `${window.location.origin}${STREAM_SAVER_MITM_PATH}`
}

export function downloadBlobDirectly(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Open StreamSaver during click; caller must start piping within seconds. */
export function createZipStreamTarget(zipFileName: string): ZipStreamTarget {
  configureStreamSaverMitm()
  const fileStream = streamSaver.createWriteStream(zipFileName)
  const abortController = new AbortController()

  return {
    pipeBody: async (body) => {
      await body.pipeTo(fileStream, { signal: abortController.signal })
    },
    abort: (reason) => {
      abortController.abort(reason)
    },
  }
}

async function buildZipResponse(createEntries: ZipEntriesFactory): Promise<Response> {
  const { downloadZip } = await import('client-zip')

  async function* toClientZipEntries(): AsyncGenerator<{
    name: string
    input: Blob | ReadableStream<Uint8Array> | string
    lastModified: Date
  }> {
    for await (const entry of createEntries()) {
      yield {
        name: entry.fileName,
        input: entry.input,
        lastModified: entry.lastModified ?? new Date(),
      }
    }
  }

  return downloadZip(toClientZipEntries())
}

async function deliverZipViaBlobDownload(
  createEntries: ZipEntriesFactory,
  zipFileName: string,
): Promise<void> {
  const zipResponse = await buildZipResponse(createEntries)
  const blob = await zipResponse.blob()
  if (blob.size < MIN_VALID_ZIP_BYTES) {
    throw new Error('Zip packaging failed: generated archive is empty or corrupt')
  }
  downloadBlobDirectly(blob, zipFileName)
}

/**
 * Stream a zip to disk without holding the full archive in memory.
 * Peak RAM ≈ one page blob + zip encoder buffer.
 *
 * Prefer an existing `streamTarget` opened during the user gesture.
 * Leave StreamSaver idle only briefly — feed entries as they are produced.
 */
export async function streamZipDownload(
  createEntries: ZipEntriesFactory,
  zipFileName: string,
  streamTarget?: ZipStreamTarget | null,
): Promise<void> {
  configureStreamSaverMitm()

  const zipResponse = await buildZipResponse(createEntries)
  const body = zipResponse.body
  if (!body) {
    throw new Error('Streaming zip failed: response body is empty')
  }

  if (streamTarget) {
    await streamTarget.pipeBody(body)
    return
  }

  try {
    const lateTarget = createZipStreamTarget(zipFileName)
    await lateTarget.pipeBody(body)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    // Late StreamSaver often fails without a user gesture — fall back to blob download.
    await deliverZipViaBlobDownload(createEntries, zipFileName)
  }
}

export async function downloadZipFiles(
  files: ZipFileInput[],
  zipFileName: string,
  streamTarget?: ZipStreamTarget | null,
): Promise<void> {
  await streamZipDownload(
    () =>
      (async function* zipEntries(): AsyncGenerator<ZipStreamEntry> {
        for (const file of files) {
          yield { fileName: file.fileName, input: file.blob }
        }
      })(),
    zipFileName,
    streamTarget,
  )
}

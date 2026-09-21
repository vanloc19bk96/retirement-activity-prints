import { PDFDocument } from 'pdf-lib'

import { yieldToMainThread } from '@/utils/yield-to-main-thread'

export async function mergePdfBlobs(chunks: readonly Blob[]): Promise<Blob> {
  if (chunks.length === 0) {
    throw new Error('No PDF chunks to merge')
  }
  if (chunks.length === 1) {
    return chunks[0]!
  }

  const merged = await PDFDocument.create()

  for (const chunkBlob of chunks) {
    const chunkBytes = new Uint8Array(await chunkBlob.arrayBuffer())
    const chunkPdf = await PDFDocument.load(chunkBytes)
    const copiedPages = await merged.copyPages(chunkPdf, chunkPdf.getPageIndices())
    for (const page of copiedPages) {
      merged.addPage(page)
    }
    await yieldToMainThread()
  }

  const mergedBytes = await merged.save()
  return new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' })
}

export async function mergePdfBlobsWithCover({
  coverBlob,
  interiorChunks,
}: {
  coverBlob: Blob | null
  interiorChunks: readonly Blob[]
}): Promise<Blob[]> {
  const outputs: Blob[] = []

  if (coverBlob) {
    outputs.push(coverBlob)
  }

  if (interiorChunks.length === 0) {
    return outputs
  }

  const interiorBlob = interiorChunks.length === 1 ? interiorChunks[0]! : await mergePdfBlobs(interiorChunks)
  outputs.push(interiorBlob)
  return outputs
}

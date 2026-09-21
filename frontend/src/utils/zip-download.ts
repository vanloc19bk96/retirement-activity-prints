import JSZip from 'jszip'

export type ZipFileInput = {
  fileName: string
  blob: Blob
}

/** Yield so GC can reclaim large transient canvas buffers between export pages. */
export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
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

export async function downloadZipFiles(files: ZipFileInput[], zipFileName: string): Promise<void> {
  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.fileName, file.blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)

  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = zipFileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}


/**
 * Yields control back to the browser between chunks of heavy synchronous work
 * (e.g. populating many Fabric canvases / svg2pdf pages) so it can paint progress
 * UI and process queued user input such as a Cancel click.
 *
 * Uses `MessageChannel` instead of `scheduler.yield()` / `requestAnimationFrame` /
 * nested `setTimeout`: those are deferred or heavily throttled when the tab is
 * hidden, which made PDF export appear to "pause" after switching tabs.
 */
export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'function') {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => resolve()
      channel.port2.postMessage(null)
      return
    }

    setTimeout(resolve, 0)
  })
}

// Invite link previews: crawlers don't run JS, so rewrite the Open Graph tags
// of index.html on the server when the URL carries a valid ?room=CODE.
import { normalizeCode } from '../shared/protocol'

export const inviteCode = (url: URL): string | null => {
  const room = url.searchParams.get('room')
  return room && room.length <= 32 ? normalizeCode(room) : null
}

const setContent = (value: string) => ({
  element(el: Element) {
    el.setAttribute('content', value)
  },
})

export function rewriteInvite(res: Response, url: URL, code: string): Response {
  const title = 'Join my Stitch Four game'
  const description = `Room ${code} · Tap to play four in a row, embroidered.`
  return new HTMLRewriter()
    .on('meta[property="og:title"], meta[name="twitter:title"]', setContent(title))
    .on('meta[property="og:description"], meta[name="twitter:description"]', setContent(description))
    .on('meta[property="og:url"]', setContent(url.href))
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(el) {
        const src = el.getAttribute('content')
        if (src) el.setAttribute('content', new URL(src, url.origin).href)
      },
    })
    .transform(res)
}

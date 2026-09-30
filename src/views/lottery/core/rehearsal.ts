// A rehearsal gets fresh in-memory draw state. The formal configuration is read-only.
export function isRehearsal(search = window.location.search): boolean {
  return new URLSearchParams(search).get('mode') === 'rehearsal'
}

export function createRehearsalUrl(href = window.location.href): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('mode', 'rehearsal')
  return url.href
}

export function createFormalUrl(href = window.location.href): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  return url.href
}

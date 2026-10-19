// Short, friendly, crafty usernames like "mossy-fern". Used for new players on the
// client and for the anonymous names the server gives matched players.
const ADJ = [
  'mossy', 'woolly', 'tiny', 'brave', 'sunny', 'cozy', 'lucky', 'quiet', 'swift', 'happy',
  'velvet', 'golden', 'misty', 'rusty', 'plucky', 'jolly', 'nimble', 'mellow', 'zesty', 'witty',
  'amber', 'coral', 'dusky', 'frosty', 'honey', 'lilac', 'maple', 'olive', 'peachy', 'sage',
]
const NOUN = [
  'fern', 'otter', 'button', 'thimble', 'spool', 'sparrow', 'pebble', 'maple', 'finch', 'badger',
  'needle', 'tassel', 'clover', 'acorn', 'robin', 'lark', 'quill', 'bramble', 'hazel', 'wren',
  'fox', 'moth', 'heron', 'plum', 'poppy', 'yarn', 'stitch', 'knot', 'hare', 'pine',
]

export function randomName(rand: () => number = Math.random): string {
  const pick = (a: string[]) => a[Math.floor(rand() * a.length)]
  const adj = pick(ADJ)
  let noun = pick(NOUN)
  for (let i = 0; noun === adj && i < 20; i++) noun = pick(NOUN)
  return `${adj}-${noun}`
}

/** Two different names for a matched pair. */
export function namePair(rand: () => number = Math.random): [string, string] {
  const a = randomName(rand)
  let b = randomName(rand)
  for (let i = 0; b === a && i < 20; i++) b = randomName(rand)
  return [a, b]
}

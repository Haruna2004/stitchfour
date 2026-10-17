// Short, friendly, crafty usernames like "mossy-fern".
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

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export function randomName(): string {
  let adj = pick(ADJ)
  let noun = pick(NOUN)
  while (noun === adj) noun = pick(NOUN)
  return `${adj}-${noun}`
}

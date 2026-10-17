// Rasterise public/icon.svg into the PNG icons the manifest + iOS need.
// bun scripts/gen-icons.ts
import sharp from 'sharp'
import { join } from 'node:path'

const pub = join(import.meta.dir, '..', 'public')
const svg = await Bun.file(join(pub, 'icon.svg')).arrayBuffer()

// iOS rounds corners itself and shows transparency as black, so flatten that one.
const out: [string, number, boolean][] = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, true],
]
for (const [name, size, flat] of out) {
  let img = sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 512) * 2 }).resize(size, size)
  if (flat) img = img.flatten({ background: '#f3ead8' })
  await img
    .png({ compressionLevel: 9 })
    .toFile(join(pub, name))
  console.log('wrote', name)
}

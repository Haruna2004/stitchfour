// Usage stats from Workers Analytics Engine (dataset `stitchfour_events`).
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun scripts/stats.ts [--days 7]
//
// Env:
//   CLOUDFLARE_ACCOUNT_ID  Cloudflare dashboard > Workers & Pages > right sidebar "Account ID"
//   CLOUDFLARE_API_TOKEN   My Profile > API Tokens > Create Token, permission "Account | Account Analytics | Read"
//
// Column layout is documented in party/events.ts. Counts use SUM(_sample_interval) so they
// stay right if Analytics Engine ever samples.

const TABLE = 'stitchfour_events'
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN

if (!account || !token) {
  console.log(`Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then run:
  bun scripts/stats.ts [--days 7]

The token needs "Account | Account Analytics | Read".
Create one at https://dash.cloudflare.com/profile/api-tokens`)
  process.exit(1)
}

const daysArg = process.argv.indexOf('--days')
const days = Math.min(Math.max(Math.floor(Number(process.argv[daysArg + 1])) || 7, 1), 90)
const since = `timestamp > NOW() - INTERVAL '${days}' DAY`

type Row = Record<string, string | number>

async function query(sql: string): Promise<Row[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: sql,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`)
  return (JSON.parse(text) as { data: Row[] }).data
}

function table(rows: Row[]) {
  if (!rows.length) return console.log('  (no data)\n')
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v ?? '') || '-')
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)))
  const line = (vals: string[]) => '  ' + vals.map((v, i) => v.padEnd(w[i])).join('  ')
  console.log(line(cols))
  console.log(line(w.map((n) => '-'.repeat(n))))
  rows.forEach((r) => console.log(line(cols.map((c) => cell(r[c])))))
  console.log()
}

async function show(title: string, sql: string, post?: (rows: Row[]) => Row[]) {
  console.log(`${title}`)
  try {
    const rows = await query(sql)
    table(post ? post(rows) : rows)
  } catch (e) {
    console.log(`  failed: ${(e as Error).message}\n`)
  }
}

const n = 'SUM(_sample_interval)'

console.log(`Stitch Four stats, last ${days} day${days === 1 ? '' : 's'}\n`)

await show(
  'Games per mode',
  `SELECT blob1 AS event, blob2 AS mode, ${n} AS count FROM ${TABLE}
   WHERE ${since} AND blob1 IN ('game_start', 'game_end', 'game_abandon')
   GROUP BY event, mode ORDER BY event, count DESC`,
)

await show(
  'Bot results per level (win rate = wins / games)',
  `SELECT blob3 AS level, blob4 AS outcome, ${n} AS count FROM ${TABLE}
   WHERE ${since} AND blob1 = 'game_end' AND blob2 = 'bot'
   GROUP BY level, outcome`,
  (rows) => {
    const by: Record<string, { win: number; loss: number; draw: number }> = {}
    for (const r of rows) {
      const l = (by[String(r.level)] ??= { win: 0, loss: 0, draw: 0 })
      if (r.outcome === 'win' || r.outcome === 'loss' || r.outcome === 'draw') l[r.outcome] += Number(r.count)
    }
    return ['easy', 'medium', 'hard']
      .filter((l) => by[l])
      .map((l) => {
        const { win, loss, draw } = by[l]
        const games = win + loss + draw
        return { level: l, games, win, loss, draw, 'win rate': `${Math.round((win / games) * 100)}%` }
      })
  },
)

await show(
  'Average moves and duration (finished games)',
  `SELECT blob2 AS mode, blob3 AS level, ${n} AS games,
          SUM(_sample_interval * double1) / ${n} AS avg_moves,
          SUM(_sample_interval * double2) / ${n} AS avg_seconds
   FROM ${TABLE}
   WHERE ${since} AND blob1 = 'game_end'
   GROUP BY mode, level ORDER BY mode, level`,
)

await show(
  'Online: rooms created vs joined',
  `SELECT blob1 AS event, ${n} AS count FROM ${TABLE}
   WHERE ${since} AND blob1 IN ('room_create', 'room_join', 'room_full', 'rematch')
   GROUP BY event ORDER BY count DESC`,
)

await show(
  'Installs and updates',
  `SELECT blob1 AS event, blob4 AS detail, ${n} AS count FROM ${TABLE}
   WHERE ${since} AND blob1 IN ('install', 'ios_hint_shown', 'update_applied')
   GROUP BY event, detail ORDER BY event, count DESC`,
)

await show(
  'Top countries (app opens)',
  `SELECT blob6 AS country, ${n} AS opens FROM ${TABLE}
   WHERE ${since} AND blob1 = 'app_open'
   GROUP BY country ORDER BY opens DESC LIMIT 15`,
)

await show(
  'App opens per platform and display',
  `SELECT blob7 AS platform, blob8 AS display, ${n} AS opens FROM ${TABLE}
   WHERE ${since} AND blob1 = 'app_open'
   GROUP BY platform, display ORDER BY opens DESC`,
)

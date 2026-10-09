// SyncStage · canonical demo flow smoke test
const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const paths = [
  '/#/home',
  '/#/concert/night-voyage/select-song',
  '/#/concert/night-voyage/searching',
  '/#/concert/night-voyage/sync/reveal',
  '/#/concert/night-voyage/icebreak/u-orange-01',
  '/#/concert/night-voyage/room',
  '/#/messages',
]
for (const path of paths) {
  const response = await fetch(BASE + path)
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
}
console.log(`Canonical flow smoke passed (${paths.length} routes).`)

const WebTorrent = require('webtorrent')
const homedir = require('os').homedir()
const prettyMs = require('pretty-ms')
const parseTorrent = require('parse-torrent')
const day = require('dayjs')
const fs = require('fs').promises
const client = new WebTorrent()

client.on('error', err => {
  process.exit(1)
  console.log(err)
})
process.on('uncaughtException', err => {
  process.exit(1)
  console.log(err)
})

;(function sleep () {
  setTimeout(() => {
    if (!client.progress) {
      process.exit(0)
    }
    sleep()
  }, 3600000)
})()

process.on('message', async ({ type, data: { id } }) => {
  if (id) id = parseTorrent(id).infoHash

  switch (type) {
    case 'add': {

      const torrentData = await getTorrents()
      process.send({ type: 'list', data: torrentData })

      const cachedHistory = await getHistory()
      const exists = [...cachedHistory, ...client.torrents].find(({ infoHash }) => infoHash === id)
      if (exists) {
        const torrentData = await getTorrents()
        return process.send({ type: 'list', data: torrentData })
      }

      client.add(id, { path: `${homedir}/Downloads` }, torrent => {
        let now = Date.now()
        torrent.on('download', async () => {
          if ((now + 200) < Date.now()) {
            const torrentData = await getTorrents()
            process.send({ type: 'list', data: torrentData })
            now = Date.now()
          }
        })

        torrent.on('done', async () => {
          client.remove(torrent.infoHash)
          await setHistory([...cachedHistory, ...[{
            infoHash: torrent.infoHash,
            title: torrent.name,
            size: formatBytes(torrent.length),
            completed: day(Date.now()).format('YYYY-MM-DD HH:mm:ss')
          }]])
          const torrentData = await getTorrents()
          process.send({ type: 'list', data: torrentData })
        })
      })
      break
    }

    case 'list': {
      const torrentData = await getTorrents()
      process.send({ type: 'list', data: torrentData })
      break
    }

    case 'torrents': {
      const torrentData = await getTorrents({ trunc: false })
      process.send({ type: 'torrents', data: torrentData })
      break
    }

    case 'remove': {
      const cachedHistory = await getHistory()
      const newHistory = cachedHistory.filter(({ infoHash }) => infoHash !== id)
      await setHistory(newHistory)
      const torrent = client.torrents.filter(({ infoHash }) => infoHash === id).pop()
      if (torrent) client.remove(torrent.infoHash)
      break
    }
  }
})

async function getTorrents ({ trunc = true } = { trunc: false }) {

  const torrents = client.torrents.map(torrent => {
    return {
      peers: torrent.numPeers,
      remaining: torrent.timeRemaining === Infinity ? '∞' : `${prettyMs(torrent.timeRemaining, { compact: true })}`,
      size: `${formatBytes(torrent.length)}`,
      downloaded: `${formatBytes(torrent.downloaded)}`,
      speed: `${formatBytes(torrent.downloadSpeed)+'/s'}`,
      progress: `${(torrent.progress * 100).toFixed(1)}%`,
      title: torrent.name,
      infoHash: torrent.infoHash
    }
  })

  const cachedHistory = await getHistory()

   // TODO: sort by completion date with active at top
  const list = [...cachedHistory, ...torrents].map(({
    completed,
    peers = '0',
    remaining = '0ms',
    size = '0 KB',
    downloaded,
    speed = '0 B/s',
    progress = '100.0%',
    title = 'Unknown',
    infoHash
  }) => ({
    completed,
    peers,
    remaining,
    size,
    downloaded: completed ? size : downloaded,
    speed,
    progress,
    title: title && trunc && title.length > 45 ? `${title.slice(0,45)}...` : title,
    ...(!trunc && { infoHash })
  }))

  return list
}

function formatBytes (bytes) {
  if (bytes >= 0 && bytes < 1000) return `${Math.trunc(bytes)} B`
  if (bytes > 1000 && bytes < 1000000) return `${Math.trunc((bytes/1000))} KB`
  if (bytes > 1000000 && bytes < 1000000000) return `${Math.trunc((bytes/1000000))} MB`
  if (bytes > 1000000000) return `${(bytes/1000000000).toFixed(1)} GB`
}

async function getHistory () {
  let history
  try {
    history = await fs.readFile(`${homedir}/.bystrina.json`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(`${homedir}/.bystrina.json`, JSON.stringify([]))
      history = await fs.readFile(`${homedir}/.bystrina.json`)
    }
  }
  return JSON.parse(String(history))
}

async function setHistory (history) {
  await fs.writeFile(`${homedir}/.bystrina.json`, JSON.stringify(history))
  const newHistory = await fs.readFile(`${homedir}/.bystrina.json`)
  return JSON.parse(String(newHistory))
}

#!/usr/bin/env node

const program = require('commander')
const PirateBay = require('thepiratebay')
const inquirer = require('inquirer')
const homedir = require('os').homedir()
const asTable = require ('as-table')
const { sendMessage, createBus } = require('./pm2')
const EventEmitter = require('events')
const events = new EventEmitter
let allowRendering = false
let symbolStore = {}

const render = (data => {
  const symbols = ['⣾','⣽','⣻','⢿','⡿','⣟','⣯','⣷']
  let i = 0
  return data => {
    if (!allowRendering) return

    if (!data.length) {
      console.log(`No Results.`)
      process.exit(0)
    }

    symbolStore = data.reduce((sum, { infoHash }) => {
      if (Object.keys(symbolStore).includes(infoHash)) {
        sum[infoHash] = symbolStore[infoHash]
      } else {
        sum[infoHash] = Math.floor(Math.random() * 7) + 1
      }
      return sum
    }, {})

    data = data.map(({ infoHash, ...item }) => {
      return {
        ...item,
        title: `${item.completed ? '⣿' : symbols[symbolStore[infoHash]]} ${item.title}`
      }
    })

    Object.keys(symbolStore).forEach(infoHash => {
      symbolStore[infoHash] = symbolStore[infoHash] === 7 ? 0 : (symbolStore[infoHash]+1)
    })

    process.stdout.write('\033c')
    const table = asTable.configure({ maxTotalWidth: 200, delimiter: ' | ', dash: '─' })(data)
    process.stdout.write(table)
  }
})()

let bus
;(async () => {
  bus = await createBus()
  bus.on('list', ({ data }) => render(data))
})()

program
.command('search <q>')
.description('Search for a torrent to download.')
.action(async q => {
  let torrents = await PirateBay.search(q)
  if (!torrents.length) {
    console.log(`No results.`)
    process.exit(0)
  }
  process.stdout.write('\033c')
  const { selection } = await inquirer.prompt([{
    type: 'list',
    name: 'selection',
    message: 'Select a torrent to download.',
    prefix: `${torrents.length} Results:`,
    choices: () => torrents.map((item, i) => `#${i+1}: ${item.name} | ${item.size} | seeders: ${item.seeders}`)
  }])
  const { magnetLink } = torrents.filter(({ name }) => selection.includes(name)).pop()
  await sendMessage({ type: 'add', data: { id: magnetLink } })
  console.log(`Adding torrent...`)
  allowRendering = true
})

program
.command('list')
.description('List all torrents.')
.action(async () => {
  await sendMessage({ type: 'list', data: {} })
  allowRendering = true
})

program
.command('remove')
.description('Select a torrent to remove.')
.action(async () => {
  await sendMessage({ type: 'torrents', data: {} })
  bus.on('torrents', async ({ data: torrents }) => {
    process.stdout.write('\033c')
    const { selection } = await inquirer.prompt([{
      type: 'list',
      name: 'selection',
      message: 'Select a torrent to remove.',
      prefix: `${torrents.length} Results:`,
      choices: () => torrents.map((item, i) => `#${i+1}: ${item.title}`)
    }])
    const { infoHash } = torrents.filter(({ title }) => selection.includes(title)).pop()
    await sendMessage({ type: 'remove', data: { id: infoHash } })
    console.log(`Torrent removed.`)
    process.exit(0)
  })
})

program
.command('add <id>')
.description(`Manually add a torrent using its info hash or magnet url.`)
.action(async id => {
  await sendMessage({ type: 'add', data: { id } })
})

program.parse(process.argv)

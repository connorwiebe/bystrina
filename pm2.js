const pm2 = require('pm2')
const path = require('path')

const getProcesses = () => {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) return reject(err)
      resolve(list)
    })
  })
}

const startChild = () => {
  return new Promise((resolve, reject) => {
    pm2.connect(err => {
      if (err) return reject(err)
      pm2.start(path.resolve(__dirname, 'bystrina_child.js'), { name: 'bystrina_child', autorestart: false }, (err, process) => {
        if (err) return reject(err)
        resolve(process)
      })
    })
  })
}

module.exports = (() => ({
  createBus: () => {
    return new Promise((resolve, reject) => {
      pm2.connect(() => {
        pm2.launchBus((err, bus) => {
          if (err) return reject(err)
          resolve(bus)
        })
      })
    })
  },
  sendMessage: async ({ type, data }) => {
    const processes = await getProcesses()
    let child = processes.filter(process => process.name === 'bystrina_child').pop()

      // if child doesn't exit or stopped, start it
      if (!child || child.pm2_env.status === 'stopped') child = await startChild()

      // determine child id
      let id
      if (child[0]) {
        if (typeof child[0].pm2_env.pm_id === 'number') {
          id = child[0].pm2_env.pm_id
        } else {
          id = child[0].pm_id
        }
      } else {
        id = child.pm_id
      }

    return new Promise((resolve, reject) => {
      pm2.sendDataToProcessId({ id, type, data, topic: 'asdf' }, (err, res) => {
        if (err) return reject(err)
        resolve(res)
      })
    })
  }
}))()

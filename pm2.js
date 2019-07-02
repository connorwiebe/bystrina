const pm2 = require('pm2')

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
      pm2.start({ script: './bystrina_child.js', name: 'bystrina_child' }, (err, process) => {
        if (err) return reject(err)
        resolve(process.pop())
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
    if (!child || child.pm2_env.status === 'stopped') child = await startChild()

    return new Promise((resolve, reject) => {
      pm2.sendDataToProcessId({
        id: child.pm_id,
        type,
        data,
        topic: 'asdf'
      }, (err, res) => {
        if (err) return reject(err)
        resolve(res)
      })
    })
  }
}))()

const {spawn} = require('child_process');

class ProcServiceProvider {

  constructor(core, options = {}) {
    this.core = core;
    this.options = options;
    this.processes = [];
  }

  destroy() {
    this.processes.forEach(({p}) => {
      if (p) {
        p.kill();
      }
    });

    this.processes = [];
  }

  provides() {
    return [];
  }

  init() {
    const {routeAuthenticated} = this.core.make('osjs/express');

    const checkParameters = (name, cmd) => {
      if (!name) {
        return 'No name given';
      }

      if (!cmd) {
        return 'No cmd given';
      }

      return false;
    };

    // FIXME: Make a WS signal
    routeAuthenticated('POST', '/proc/kill', (req, res) => {
      const {name} = req.body;
      const status = this.removeProcess(name);
      return res.json(status);
    });

    routeAuthenticated('POST', '/proc/exec', (req, res) => {
      const {name, cmd, args} = req.body;
      const {username} = req.session.user;

      const error = checkParameters(name, cmd, args);
      if (error) {
        return res.status(400).json({error});
      }

      return this.execProcess(username, name, cmd)
        .then(result => res.json(result))
        .catch(error => res.status(500).json({error}));
    });

    routeAuthenticated('POST', '/proc/spawn', (req, res) => {
      const {name, cmd, args} = req.body;
      const {username} = req.session.user;

      const error = checkParameters(name, cmd);
      if (error) {
        return res.status(400).json({error});
      }

      return this.spawnProcess(username, name, cmd, args || [])
        .then(result => res.json(result))
        .catch(error => res.status(500).json(false));
    }, ['admin']);

    return Promise.resolve();
  }

  start() {
  }

  execProcess(username, name, cmd, ...args) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      try {
        const p = spawn(cmd, args);

        p.stdout.on('data', data => (stdout += data.toString()));
        p.stderr.on('data', data => (stderr += data.toString()));
        p.on('exit', code => resolve({code, stdout, stderr}));
      } catch (e) {
        reject(e);
      }
    });
  }

  spawnProcess(username, name, cmd, ...args) {
    try {
      const p = spawn(cmd, args);
      const emit = (type, ...data) => this.broadcastMessage(username, name, type, ...data);

      this.processes.push({p, name});

      p.stdout.on('data', data => emit('stdout', data.toString()));
      p.stderr.on('data', data => emit('stderr', data.toString()));

      p.on('exit', code => {
        this.removeProcess(name);
        emit('exit', code);
      });

      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  removeProcess(name) {
    const foundIndex = this.processes.find(iter => iter.name === name);
    if (foundIndex !== -1) {
      this.processes.splice(foundIndex);

      return true;
    }

    return false;
  }

  broadcastMessage(username, name, type, ...args) {
    this.core.broadcast(`osjs/proc:data`, [{name, type}, ...args], client => {
      return client._osjs_client && client._osjs_client.username === username;
    });
  }
}

module.exports = {ProcServiceProvider};

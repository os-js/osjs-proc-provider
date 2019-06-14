const {spawn} = require('child_process');
const pty = require('node-pty');
const os = require('os');

const SHELL = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
const TIMEOUT_INTERVAL = 10 * 1000;
const TIMEOUT_PING = 60 * 1000;

const defaultCmd = {env: {}, cwd: null};

const unpackCmd = cmd => typeof cmd === 'string'
  ? Object.assign({}, defaultCmd, {cmd})
  : Object.assign({}, cmd);

const checkParameters = (name, cmd) => {
  if (!name) {
    return 'No name given';
  }

  if (!cmd) {
    return 'No cmd given';
  }

  return false;
};

class ProcServiceProvider {

  constructor(core, options = {}) {
    this.core = core;
    this.options = Object.assign({
      groups: ['admin']
    }, options);
    this.processes = [];
    this.timeoutInterval = null;
  }

  destroy() {
    this.timeoutInterval = clearTimeout(this.timeoutInterval);

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
    const route = (name, cb) => routeAuthenticated('POST', name, cb, this.options.groups);

    const spawnCallback = methodName => (req, res) => {
      const {name, cmd, args} = req.body;
      const {username} = req.session.user;
      const error = checkParameters(name, cmd);

      if (error) {
        return res.status(400).json({error});
      }

      return this[methodName](username, name, cmd, args || [])
        .then(result => res.json(result))
        .catch(error => res.status(500).json({error}));
    };

    route('/proc/exec', spawnCallback('execProcess'));
    route('/proc/spawn', spawnCallback('spawnProcess'));
    route('/proc/pty', spawnCallback('spawnPty'));
    route('/proc/kill', (req, res) => { // FIXME: Make a WS signal
      const {name} = req.body;
      const status = this.removeProcess(name, true);
      return res.json(status);
    });

    return Promise.resolve();
  }

  start() {
    this.core.on('osjs/proc-provider:stdin', (ws, name, data) => {
      this.stdinProcess(name, data);
    });

    this.core.on('osjs/proc-provider:ping', (ws, name) => {
      this.pingProcess(name);
    });

    this.checkTimeouts();
  }

  execProcess(username, name, command, args) {
    const {cmd, env, cwd} = unpackCmd(command);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      try {
        const p = spawn(cmd, args, {env, cwd, shell: true});

        this.processes.push({p, name});

        p.stdout.on('data', data => (stdout += data.toString()));
        p.stderr.on('data', data => (stderr += data.toString()));
        p.on('error', error => reject(error));
        p.on('exit', code => resolve({code, stdout, stderr}));
      } catch (e) {
        reject(e);
      }
    });
  }

  _spawnProcess(username, name, p, pty) {
    const emit = (type, ...data) => this.broadcastMessage(username, name, type, ...data);
    const started = Date.now();

    this.processes.push({p, name, pty, started, lastTime: started});

    if (pty) {
      p.on('data', data => emit('data', data.toString()));
    } else {
      p.stdout.on('data', data => emit('stdout', data.toString()));
      p.stderr.on('data', data => emit('stderr', data.toString()));
    }

    p.on('error', error => emit('error', error));

    p.on('exit', code => {
      this.removeProcess(name);
      emit('exit', code);
    });

    return Promise.resolve(true);
  }

  spawnProcess(username, name, command, args) {
    try {
      const {cmd, env, cwd} = unpackCmd(command);
      const p = spawn(cmd, args, {env, cwd, shell: true});

      return this._spawnProcess(username, name, p, false);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  spawnPty(username, name, command, args) {
    try {
      const {cmd, env, rows, cols, term} = unpackCmd(command);
      // FIXME: Powershell won't work with this
      const p = pty.spawn(SHELL, ['-c', [cmd, ...args].join(' ')], {
        name: term || 'xterm-color',
        cols: cols || 80,
        rows: rows || 30,
        env
      });

      return this._spawnProcess(username, name, p, true);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  stdinProcess(name, data) {
    const found = this.processes.find(iter => iter.name === name);

    if (found) {
      if (found.pty) {
        found.p.write(data);
      } else {
        found.p.stdin.write(data);
      }
    }
  }

  removeProcess(name, kill = false) {
    const foundIndex = this.processes.findIndex(iter => iter.name === name);
    if (foundIndex !== -1) {
      if (kill) {
        const {p} = this.processes[foundIndex];
        if (p) {
          try {
            p.kill();
          } catch (e) {
            console.warn(e);
          }
        }
      }

      this.processes.splice(foundIndex);

      return true;
    }

    return false;
  }

  pingProcess(name) {
    const found = this.processes.find(iter => iter.name === name);
    if (found) {
      found.lastTime = Date.now();
    }
  }

  broadcastMessage(username, name, type, ...args) {
    this.core.broadcast('osjs/proc-provider:stdout', [{name, type}, ...args], client => {
      return client._osjs_client && client._osjs_client.username === username;
    });
  }

  checkTimeouts() {
    this.timeoutInterval = clearInterval(this.timeoutInterval);

    const now = Date.now();
    const timedOut = this.processes
      .filter(({lastTime}) => {
        return (now - lastTime) >= TIMEOUT_PING;
      })
      .map(({name}) => name);

    if (timedOut.length > 0) {
      console.log('The following processes timed out', timedOut);

      timedOut.forEach(name => this.removeProcess(name, true));
    }

    this.timeoutInterval = setTimeout(() => this.checkTimeouts(), TIMEOUT_INTERVAL);
  }
}

module.exports = {ProcServiceProvider};

import * as uuid from 'uuid/v4';
import {EventEmitter} from '@osjs/event-emitter';
import {Terminal} from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import * as attach from 'xterm/lib/addons/attach/attach';
import './styles.scss';

const PING_INTERVAL = 10 * 1000;

class SpawnedProcess extends EventEmitter {
  constructor(service, cmd, args, name) {
    super(name);

    this.service = service;
    this.cmd = cmd;
    this.args = args;
    this.destroyed = false;
    this.pingInterval = null;
    this.win = null;

    // this.once('error', () => this.destroy(false));
    this.once('exit', () => this.destroy(false));

    this.once('spawned', () => {
      this.pingInterval = setInterval(() => this.ping(), PING_INTERVAL);
    });

    this.on('destroy', () => {
      this.pingInterval = clearInterval(this.pingInterval);
    });
  }

  destroy(kill = false) {
    if (!this.destroyed) {
      if (kill) {
        this.kill();
      }

      this.destroyed = true;

      this.emit('destroy');
    }
  }

  kill() {
    return this.service.kill(this.name);
  }

  send(data) {
    if (!this.destroyed) {
      this.service.send(this.name, data);
    }
  }

  ping() {
    if (!this.destroyed) {
      this.service.ping(this.name);
    }
  }

  createWindow(options = {}) {
    options = Object.assign({
      keepOpen: false,
      focus: true,
      closeable: false
    }, options);

    if (this.win) {
      this.win.focus(true);
    } else {
      this.win = this.service.core
        .make('osjs/window', {
          title: [this.cmd, ...this.args].join(' '),
          position: 'center',
          attributes: {
            classNames: ['osjs-proc-window'],
            closeable: options.closeable
          },
          dimension: {
            width: 800,
            height: 300
          }
        })
        .render(($content, win) => {
          const xterm = new Terminal();
          xterm.open($content);

          xterm.on('data', data => this.send(data));

          win.on('close', () => this.destroy(true));
          win.on('resized', () => xterm.fit());
          win.on('focus', () => xterm.focus());
          win.on('blur', () => xterm.blur());
          win.on('destroy', () => xterm.destroy());
          win.on('destroy', () => (this.win = null));
          win.on('render', win => {
            setTimeout(() => {
              if (options.focus) {
                win.focus();
              }

              xterm.fit();
            }, 1);
          });

          this.on('exit', code => {
            xterm.writeln(`Process exited with code ${code}`);
          });

          this.on('error', error => {
            if (error.code === 'EIO') {
              return;
            }

            xterm.writeln(`PTY Error: ${JSON.stringify(error)}`);
          });

          this.on('stdout', d => xterm.write(d));
          this.on('stderr', d => xterm.write(d));
          this.on('data', d => xterm.write(d));

          if (!options.keepOpen) {
            this.on('destroy', () => win.destroy());
          }
        });
    }

    return this.win;
  }
}

class ProcService extends EventEmitter {

  constructor(core) {
    super('ProcService');

    this.core = core;
    this.processes = [];

    this.core.on('osjs/proc-provider:stdout', (options, ...args) => {
      const {name, type} = options;
      const found = this.processes.find(iter => iter.name === name);

      if (found && !found.destroyed) {
        found.emit(type, ...args);
      }
    });
  }

  destroy() {
    this.processes.forEach(p => p.destroy(true));
    this.processes = [];

    super.destroy();
  }

  _request(endpoint, body) {
    return this.core.request(endpoint, {
      method: 'POST',
      body
    }, 'json');
  }

  spawn(cmd, args = [], pty = false) {
    const name = uuid();
    const proc = new SpawnedProcess(this, cmd, args, name);

    proc.on('destroy', () => {
      const foundIndex = this.processes.findIndex(iter => iter.name === name);
      if (foundIndex !== -1) {
        this.processes.splice(foundIndex, 1);
      }
    });

    this.processes.push(proc);

    this._request(`/proc/${pty ? 'pty' : 'spawn'}`, {cmd, args, name})
      .then(result => proc.emit('spawned', result))
      .catch(error => proc.emit('error', error));

    return Promise.resolve(proc);
  }

  pty(cmd, args = []) {
    return this.spawn(cmd, args, true);
  }

  exec(cmd, args = []) {
    const name = uuid();

    return this._request('/proc/exec', {cmd, args, name});
  }

  kill(name) {
    return this._request('/proc/kill', {name});
  }

  send(name, data) {
    this.core.ws.send(JSON.stringify({
      name: 'osjs/proc-provider:stdin',
      params: [name, data]
    }));
  }

  ping(name) {
    this.core.ws.send(JSON.stringify({
      name: 'osjs/proc-provider:ping',
      params: [name]
    }));
  }
}

export class ProcServiceProvider extends EventEmitter {

  constructor(core, options = {}) {
    super('ProcServiceProvider');

    this.core = core;
    this.options = options;
    this.service = null;

    Terminal.applyAddon(fit);
    Terminal.applyAddon(attach);
  }

  destroy() {
    this.service.destroy();
  }

  provides() {
    return [
      'osjs/proc',
    ];
  }

  init() {
    this.service = new ProcService(this.core);

    this.core.singleton('osjs/proc', () => ({
      spawn: (cmd, ...args) => this.service.spawn(cmd, args),
      exec: (cmd, ...args) => this.service.exec(cmd, args),
      pty: (cmd, ...args) => this.service.pty(cmd, args),
      kill: (name) => this.service.kill(name)
    }));

    return Promise.resolve();
  }

  start() {
  }
}

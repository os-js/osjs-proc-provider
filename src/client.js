import * as uuid from 'uuid/v4';
import {EventEmitter} from '@osjs/event-emitter';

class SpawnedProcess extends EventEmitter {
  constructor(service, cmd, args, name) {
    super(name);

    this.service = service;
    this.cmd = cmd;
    this.args = args;
    this.destroyed = false;

    this.once('error', () => this.destroy());
    this.once('exit', () => this.destroy());
  }

  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;

      this.emit('destroy');
    }
  }

  kill() {
    return this.service.kill(this.name);
  }
}

class ProcService extends EventEmitter {

  constructor(core) {
    super('ProcService');

    this.core = core;
    this.processes = [];

    this.core.on('osjs/proc:data', (options, ...args) => {
      const {name, type} = options;
      const found = this.processes.find(iter => iter.name === name);

      if (found && !found.destroyed) {
        found.emit(type, ...args);
      }
    });
  }

  destroy() {
    this.processes.forEach(p => p.kill());
    this.processes = [];

    super.destroy();
  }

  _request(endpoint, body) {
    return this.core.request(endpoint, {
      method: 'POST',
      body
    }, 'json');
  }

  spawn(cmd, args = []) {
    const name = uuid();
    const proc = new SpawnedProcess(this, cmd, args, name);

    proc.on('destroy', () => {
      const foundIndex = this.processes.findIndex(iter => iter.name === name);
      if (foundIndex !== -1) {
        this.processes.splice(foundIndex, 1);
      }
    });

    this.processes.push(proc);

    this._request('/proc/spawn', {cmd, args, name})
      .then(result => proc.emit('spawned', result))
      .catch(error => proc.emit('error', error));

    return Promise.resolve(proc);
  }

  exec(cmd, args = []) {
    const name = uuid();

    return this._request('/proc/exec', {cmd, args, name});
  }

  kill(name) {
    return this._request('/proc/kill', {name});
  }
}

export class ProcServiceProvider extends EventEmitter {

  constructor(core, options = {}) {
    super('ProcServiceProvider');

    this.core = core;
    this.options = options;
    this.service = null;
  }

  destroy() {
    this.service.destroy();
  }

  provides() {
    return [
      'osjs/proc'
    ];
  }

  init() {
    this.service = new ProcService(this.core);

    this.core.singleton('osjs/proc', () => ({
      spawn: (cmd, ...args) => this.service.spawn(cmd, args),
      exec: (cmd, ...args) => this.service.exec(cmd, args),
      kill: (name) => this.service.kill(name)
    }));

    return Promise.resolve();
  }

  start() {
  }
}

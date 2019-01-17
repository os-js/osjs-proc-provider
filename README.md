<p align="center">
  <img alt="OS.js Logo" src="https://raw.githubusercontent.com/os-js/gfx/master/logo-big.png" />
</p>

[OS.js](https://www.os-js.org/) is an [open-source](https://raw.githubusercontent.com/os-js/OS.js/master/LICENSE) desktop implementation for your browser with a fully-fledged window manager, Application APIs, GUI toolkits and filesystem abstraction.

[![Build Status](https://travis-ci.org/os-js/osjs-proc-provider.svg?branch=master)](https://travis-ci.org/os-js/osjs-proc-provider)
[![Support](https://img.shields.io/badge/patreon-support-orange.svg)](https://www.patreon.com/user?u=2978551&ty=h&u=2978551)
[![Back](https://opencollective.com/osjs/tiers/backer/badge.svg?label=backer&color=brightgreen)](https://opencollective.com/osjs)
[![Sponsor](https://opencollective.com/osjs/tiers/sponsor/badge.svg?label=sponsor&color=brightgreen)](https://opencollective.com/osjs)
[![Donate](https://img.shields.io/badge/liberapay-donate-yellowgreen.svg)](https://liberapay.com/os-js/)
[![Donate](https://img.shields.io/badge/paypal-donate-yellow.svg)](https://paypal.me/andersevenrud)
[![Community](https://img.shields.io/badge/join-community-green.svg)](https://community.os-js.org/)

# OS.js v3 Proc Service Provider

Adds support for spawning and listening in on processes on the node server.

## Installation

```bash
npm install --save --production @osjs/proc-provider
```

In your initialization scripts:

```javascript
// Client
import {ProcServiceProvider} from '@osjs/proc-provider';
core.register(ProcServiceProvider);

// Server
const {ProcServiceProvider} = require('@osjs/proc-provider/src/server.js');
core.register(ProcServiceProvider);
```

## Configuration

By default the server provider is set up to only allow users with the `admin` group to access this feature.

You can change this by adding options:

```javascript
const {ProcServiceProvider} = require('@osjs/proc-provider/src/server.js');
core.register(ProcServiceProvider, {
  args: {
    groups: ['other-group']
  }
});
```

## Client Example

```javascript
core.make('osjs/proc')
  .spawn('ls')
  .then(p => {
    // Process events
    p.on('stdout', str => console.log(str))
    p.on('stderr', str => console.warn(str))
    p.on('exit', code => console.info(code))

    // Internal events
    p.on('spawned', () => {}); // Spawn successful
    p.on('error', error => console.error(error)); // Spawn errors

    // You can kill long running processes
    p.kill();
  })
```

```javascript
core.make('osjs/proc')
  .exec('ls')
  .then({stdout, stderr, code} => console.log(stdout, stderr, code))
```

```javascript
// Pass environmental variables
core.make('osjs/proc')
  .spawn({cmd: 'ls', env: {foo: 'bar'}})

core.make('osjs/proc')
  .exec({cmd: 'ls', env: {foo: 'bar'}})
```

## TODO

- [ ] Implement `child.stdin.write` over WS

## Contribution

* **Become a [Patreon](https://www.patreon.com/user?u=2978551&ty=h&u=2978551)**
* **Support on [Open Collective](https://opencollective.com/osjs)**
* [Contribution Guide](https://github.com/os-js/OS.js/blob/v3/CONTRIBUTING.md)

## Documentation

See the [Official Manuals](https://manual.os-js.org/v3/) for articles, tutorials and guides.

## Links

* [Official Chat](https://gitter.im/os-js/OS.js)
* [Community Forums and Announcements](https://community.os-js.org/)
* [Homepage](https://os-js.org/)
* [Twitter](https://twitter.com/osjsorg) ([author](https://twitter.com/andersevenrud))
* [Google+](https://plus.google.com/b/113399210633478618934/113399210633478618934)
* [Facebook](https://www.facebook.com/os.js.org)
* [Docker Hub](https://hub.docker.com/u/osjs/)

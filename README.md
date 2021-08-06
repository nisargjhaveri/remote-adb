remote-adb-web
===

Use WebUSB to connect to Android devices and forward the adb connection to a remote server for debugging.

Prerequisites
---
- Node.js (along with npm) (https://nodejs.org/)

Setup
---
Clone this repository and run the following commands to set it up.

```
$ cd remote-adb-web

$ npm install
$ npm run build
```

Run
---
```
$ npm run serve -- [--help] [--port PORT] [--key server.key --cert server.crt]
```

Pass in file paths containing key and certificate chain for ssh in `--key` and `--cert`. You can omit it if you don't want to run the server as https. Please note that https is required for this to work.

Use
---
Once the server is running, open `https://hostname:port` on a remote machine, where hostname is where the server is running. Follow the onscreen instructions on that page to share adb connection to selected devices.
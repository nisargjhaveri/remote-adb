remote-adb
===

Use WebUSB to connect to Android devices and forward the adb connection to a remote server for debugging.

Install
---
This is a [Node.js](https://nodejs.org/) tool available via [npm registry](https://www.npmjs.com/). You can install it by running the following command.

```
$ npm install -g remote-adb
```

This should install `remote-adb` globally to your system path.

Usage
---
```
$ remote-adb [--help] [--port PORT] [--key server.key --cert server.crt]
```

Pass in file paths containing key and certificate chain for https in `--key` and `--cert`. You can omit it if you don't want to run the server as https. Please note that https is required for this to work.

Once the server is running, open `https://<hostname>:<port>` in a compatible browser on a remote machine. Follow the instructions on that page to connect and debug on physical devices remotely.
remote-adb
===

Easily connect and debug on Android devices on a remote server, from command-line or a web browser.
Uses WebUSB to enable sharing Android devices for debugging on a remote machine directly from the browser.

Install
---
```
$ npm install -g remote-adb
```

This should install `remote-adb` globally to your system path.

Start Server
---
You need to first start the server on the remote machine.

```
$ remote-adb server [--port PORT] [--key server.key --cert server.crt] [--password PASSWORD]
```

Pass in file paths containing key and certificate chain for https in `--key` and `--cert`. You can omit it if you don't want to run the server as https. Please note that https is required for the web client to work.

Specify the password to connect using the `--password` flag. This password would be required to connect a device from any client.

Web Client
---
Once the server is running, open `https://<hostname>:<port>` in a compatible browser on another machine which has Android devices connected via USB.

Follow the instructions on that page to connect and debug on physical devices remotely.

Command-line Client
---
You can also connect devices using the same tool on another machine. Install `remote-adb` on another machine and use the following commands to connect an Android device to the server.

To list the locally connected devices
```
$ remote-adb devices
```

To connect a device to remote
```
$ remote-adb connect [-s SERIAL|HOST:PORT] http[s]://<hostname>:<port> 
```
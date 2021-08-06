import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as WebSocket from 'ws';
import { monitorAdbServer, addAdbDevice, removeAdbDevice } from './adbConnection';

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

let argv = yargs(hideBin(process.argv))
    .option('port', {
        alias: 'p',
        describe: 'port to run the server on',
        default: 3000,
        nargs: 1,
        type: 'number',
        group: 'Server Options:'
    })
    .option('key', {
        describe: 'file containing RSA private key',
        requiresArg: true
    })
    .option('cert', {
        describe: 'file containing SSL certificate chain',
        requiresArg: true
    })
    .implies({
        'key': 'cert',
        'cert': 'key'
    })
    .normalize(['key', 'cert'])
    .check((argv) => {
        if (argv.key) {
            fs.accessSync(argv.key, fs.constants.R_OK);
        }
        if (argv.cert) {
            fs.accessSync(argv.cert, fs.constants.R_OK);
        }
        return true;
    })
    .group(['key', 'cert'], "HTTPS Options:")
    .usage('$0 [--port PORT] [--key server.key --cert server.crt]')
    .help().alias('h', 'help')
    .strict()
    .parseSync()


const useHttps = (argv.key && argv.cert);
const httpsOptions = useHttps ? {
    key: fs.readFileSync(argv.key),
    cert: fs.readFileSync(argv.cert)
} : {}

//////////////////
const port = argv.port;
const app = express();
const server = useHttps ? https.createServer(httpsOptions, app) : http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from client
app.use(express.static(path.join(__dirname, '../client')));

// Setup web socket server logic
let wsStream: any;
wss.on('connection', (ws: WebSocket) => {
    console.log("Got a socket connection");
    wsStream = WebSocket.createWebSocketStream(ws);
    wsStream.on("error", () => {
        // Do nothing
        // Sometimes this can happen when trying to write to the socket after it is closed in the process of closing the connection. Ignore.
    });

    let port: Number;
    let server = net.createServer((socket: net.Socket) => {
        socket.pipe(wsStream, {end: false});
        wsStream.pipe(socket);

        socket.on("close", (hadError) => {
            socket.unpipe(wsStream);
            wsStream.unpipe(socket);
        });
    }).listen(0, () => {
        port = (server.address() as net.AddressInfo).port;
        console.log(port, "New device");

        addAdbDevice(port);
    });

    ws.on("close", () => {
        console.log(port, "Device lost");

        server.close();
        removeAdbDevice(port);
    });
});

server.listen(port, () => {
    console.log(`Started listening on ${useHttps ? 'https' : 'http'}://localhost:${port}`);
});
monitorAdbServer();
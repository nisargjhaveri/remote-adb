import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as express from 'express';
import * as WebSocket from 'ws';
import { monitorAdbServer, addAdbDevice, removeAdbDevice } from './adbConnection';

const port = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from client
app.use(express.static(path.join(__dirname, '../client')));

// Setup web socket server logic
let wsStream: any;
wss.on('connection', (ws: WebSocket) => {
    console.log("Got a socket connection");
    wsStream = WebSocket.createWebSocketStream(ws);

    let port: Number;
    let server = net.createServer((socket: net.Socket) => {
        socket.pipe(wsStream);
        wsStream.pipe(socket);

        socket.on("close", (hadError) => {
            socket.unpipe(wsStream);
            wsStream.unpipe(socket);
        });
    }).listen(0, () => {
        port = (server.address() as net.AddressInfo).port;
        console.log(`New device: ${port}`);

        addAdbDevice(port);
    });

    ws.on("close", () => {
        console.log(`Device lost: ${port}`);

        server.close();
        removeAdbDevice(port);
    });
});

server.listen(port, () => console.log(`Started listening on http://localhost:${port}`));
monitorAdbServer();
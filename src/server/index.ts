import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as express from 'express';
import * as WebSocket from 'ws';

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
    ws.on("open", () => console.log("OPEN"));
    ws.on("close", () => console.log("CLOSED"));
})

net.createServer((socket: net.Socket) => {
    if (!wsStream) {
        socket.end();
        return;
    };

    socket.pipe(wsStream);
    wsStream.pipe(socket);

    console.log("Got a connection on 5050");
}).listen(5050);


server.listen(port, () => console.log(`Started listening on http://localhost:${port}`));
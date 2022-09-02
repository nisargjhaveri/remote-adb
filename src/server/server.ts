import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';
import { randomBytes } from 'crypto';
import express, { Request } from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import WebSocket from 'ws';

import { monitorAdbServer, addAdbDevice, removeAdbDevice } from './adbConnection';

declare module 'express-session' {
    interface SessionData {
        userId?: string;
    }
}

export class Server {
    private port: number;
    private httpsOptions: https.ServerOptions;
    private password: string|undefined;

    constructor(port: number, httpsOptions?: https.ServerOptions, password?: string) {
        this.port = port;
        this.httpsOptions = httpsOptions;
        this.password = password
    }

    private get loginSupported() {
        return !!this.password;
    }

    private loginRequried(req: Request) {
        return this.loginSupported && !req.session.userId;
    } 

    start() {
        const app = express();
        const useHttps = !!this.httpsOptions;
        const server = useHttps ? https.createServer(this.httpsOptions, app) : http.createServer(app);
        const wss = new WebSocket.Server({ noServer: true });

        // Setup authentication
        const sessionParser = session({
            secret: randomBytes(48).toString("hex"),
            resave: false,
            saveUninitialized: false,
        });

        app.use(sessionParser);

        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());

        app.get('/status', (req, res) => {
            res.json({
                result: "OK",
                loginSupported: this.loginSupported,
                loginRequired: this.loginRequried(req)
            });
            res.end();
        });

        app.post('/login', (req, res) => {
            if (!this.loginSupported || req.body.password === this.password) {
                req.session.regenerate(() => {
                    req.session.userId = "user";

                    res.json({
                        result: "OK",
                    });
                    res.end();
                });
            }
            else {
                res.json({
                    result: "FAIL",
                    message: "Authentication error"
                });
                res.end();
            }
        });

        app.post('/logout', (req, res) => {
            req.session.destroy(() => {
                res.json({
                    result: "OK",
                });
                res.end();
            })
        });

        // Serve static files from client
        app.use(express.static(path.join(__dirname, '../web')));

        // Setup web socket server
        wss.on('connection', this.handleWsConnection);

        server.on('upgrade', (request: any, socket: net.Socket, head) => {
            // This function is not defined on purpose. Implement it with your own logic.
            sessionParser(request, {} as any, () => {
                if (this.loginRequried(request)) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }

                wss.handleUpgrade(request, socket, head, function (ws) {
                    wss.emit('connection', ws, request);
                });
            })
        });

        // Start the server
        server.listen(this.port, () => {
            console.log(`Started listening on ${useHttps ? 'https' : 'http'}://localhost:${this.port}`);
        });

        monitorAdbServer();
    }

    private handleWsConnection = (ws: WebSocket) => {
        console.log("Got a socket connection");

        let wsStream = WebSocket.createWebSocketStream(ws);
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
    };
}

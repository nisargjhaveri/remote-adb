import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';
import { randomBytes } from 'crypto';
import express, { Request } from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import WebSocket from 'ws';
import stoppable from 'stoppable';

import logger from '../common/logger';
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

    private server: (http.Server|https.Server) & stoppable.WithStop;

    private wsKeepaliveInterval: NodeJS.Timer = undefined;

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

    async start(): Promise<string> {
        const app = express();
        const useHttps = !!this.httpsOptions;
        const server = stoppable(
            useHttps ? https.createServer(this.httpsOptions, app) : http.createServer(app),
            1000 /*grace*/
        );
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

        // Start listening
        const serverAddress = await new Promise<net.AddressInfo>((resolve, reject) => {
            server.on("error", reject);

            // Start the server
            server.listen(this.port, () => {
                resolve(server.address() as net.AddressInfo);
            });
        });

        // Start websocket keepalive loop
        this.wsKeepaliveInterval = setInterval(() => {
            try {
                wss.clients.forEach((ws) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        // logger.log(new Date(), "Sending ping to client");
                        ws.ping();
                    }
                });
            } catch (e) {
                // Do nothing
            }
        }, 20_000);

        this.server = server;
        this.port = serverAddress.port;

        const url = `${useHttps ? 'https' : 'http'}://localhost:${this.port}`;
        logger.log(`Started listening on ${url}`);

        // Start monitoring adb server
        monitorAdbServer();

        return url;
    }

    async stop (): Promise<void> {
        // Stop websocket keepalive loop
        if (this.wsKeepaliveInterval !== undefined) {
            clearInterval(this.wsKeepaliveInterval);
            this.wsKeepaliveInterval = undefined;
        }

        // Stop server if running
        if (this.server) {
            await new Promise<void>((resolve, reject) => {
                this.server.stop((e) => {
                    if (e) {
                        return reject(e);
                    }

                    resolve();
                })
            });

            this.server.removeAllListeners();
            this.server = undefined;

            logger.log(`Stopped listening on ${this.port}`);
        }
    }

    isListening(): boolean {
        return this.server && this.server.listening;
    }

    private handleWsConnection = (ws: WebSocket) => {
        logger.log("Got a socket connection");

        let wsStream = WebSocket.createWebSocketStream(ws);
        wsStream.on("error", () => {
            // Do nothing
            // Sometimes this can happen when trying to write to the socket after it is closed in the process of closing the connection. Ignore.
        });

        let port: Number;
        let server = net.createServer((socket: net.Socket) => {
            socket.pipe(wsStream, {end: false}).pipe(socket);

            socket.on("close", (hadError) => {
                socket.unpipe(wsStream);
                wsStream.unpipe(socket);
            });
        }).listen(0, () => {
            port = (server.address() as net.AddressInfo).port;
            logger.log(port, "New device");

            addAdbDevice(port);
        });

        ws.on("close", () => {
            logger.log(port, "Device lost");

            server.close();
            removeAdbDevice(port);
        });
    };
}

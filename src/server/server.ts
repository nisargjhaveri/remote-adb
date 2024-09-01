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
import { ClientHandshake, getRemoteHandshake, ServerHandshake } from '../common/handshake';

declare module 'express-session' {
    interface SessionData {
        userId?: string;
    }
}

export type ServerConfiguration = {
    /**
     * Password required to connect to the server.
     * When provided, the server will require clients to authenticate using this password.
     * If not set, no authentication is required.
     */
    password?: string;

    /**
     * Path to the static files to serve.
     * Useful when remote-adb is bundled and the static files are not in the default location, or to use a custom web client.
     */
    staticClientPath?: string;
}

export class Server {
    private listenOptions: net.ListenOptions;
    private httpsOptions: https.ServerOptions|undefined;
    private serverConfig: ServerConfiguration|undefined;

    private serverAddress: net.AddressInfo;
    private server: (http.Server|https.Server) & stoppable.WithStop;

    private wsKeepaliveInterval: NodeJS.Timer = undefined;

    constructor(listenOptions: net.ListenOptions, httpsOptions?: https.ServerOptions, serverConfig?: ServerConfiguration) {
        this.listenOptions = listenOptions;
        this.httpsOptions = httpsOptions;
        this.serverConfig = serverConfig
    }

    private get loginSupported() {
        return !!this.serverConfig?.password;
    }

    private loginRequired(req: Request) {
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
                loginRequired: this.loginRequired(req)
            });
            res.end();
        });

        app.post('/login', (req, res) => {
            if (!this.loginSupported || req.body.password === this.serverConfig.password) {
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
        app.use(express.static(this.serverConfig?.staticClientPath ?? path.join(__dirname, '../web')));

        // Setup web socket server
        wss.on('connection', this.handleWsConnection);

        server.on('upgrade', (request: any, socket: net.Socket, head) => {
            // This function is not defined on purpose. Implement it with your own logic.
            sessionParser(request, {} as any, () => {
                if (this.loginRequired(request)) {
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
            server.listen(this.listenOptions, () => {
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
        this.serverAddress = serverAddress;

        const url = `${useHttps ? 'https' : 'http'}://${this.getServerAddress()}`;
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

            logger.log(`Stopped listening on ${this.getServerAddress()}`);
        }
    }

    isListening(): boolean {
        return this.server && this.server.listening;
    }

    private handleWsConnection = async (ws: WebSocket) => {
        logger.log("Got new web socket connection. Waiting for handshake...");

        try {
            let handshakeData: ClientHandshake = await getRemoteHandshake<ClientHandshake>(ws);

            let wsStream = WebSocket.createWebSocketStream(ws);
            wsStream.on("error", () => {
                // Do nothing
                // Sometimes this can happen when trying to write to the socket after it is closed in the process of closing the connection. Ignore.
            });

            let port: number;
            let server = net.createServer((socket: net.Socket) => {
                socket.pipe(wsStream, {end: false}).pipe(socket);

                socket.on("close", (hadError) => {
                    socket.unpipe(wsStream);
                    wsStream.unpipe(socket);
                });
            }).listen(0, () => {
                port = (server.address() as net.AddressInfo).port;
                logger.log(port, `New device (${handshakeData.name}, ${handshakeData.serial})`);

                const handshakeResponse: ServerHandshake = {
                    type: "handshake",
                    serial: `127.0.0.1:${port}`,
                }

                ws.send(JSON.stringify(handshakeResponse));

                addAdbDevice(port);
            });

            ws.on("close", () => {
                logger.log(port, `Device lost (${handshakeData.name}, ${handshakeData.serial})`);

                server.close();
                removeAdbDevice(port);
            });
        } catch(e) {
            logger.error(`Error connecting: ${e.message}`);
            ws.close();
        }
    };

    private getServerAddress() {
        if (!this.serverAddress || typeof this.serverAddress === "string") {
            return this.serverAddress;
        } else {
            let host = this.serverAddress.address;
            if (this.serverAddress.family === 'IPv6') {
                host = `[${host}]`;
            }

            return `${host}:${this.serverAddress.port}`;
        }
    }
}

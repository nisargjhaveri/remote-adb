import { EventEmitter } from "events";
import logger from '../common/logger';
import { AdbTransport } from "./AdbTransport";
import { ServerConnection, WebSocket } from "./ServerConnection";


export class RemoteAdbDevice extends EventEmitter {
    private backend: AdbTransport;
    private ws: WebSocket;

    get serial() {
        return this.backend.serial;
    }

    get name() {
        return this.backend.name;
    }

    get bytesTransferred() {
        return this.backend.bytesTransferred;
    }

    constructor(backend: AdbTransport) {
        super()

        this.backend = backend;
    }

    get connected() {
        return this.backend.connected && this.ws?.readyState == WebSocket.OPEN;
    }

    connect = async (serverConnection: ServerConnection) => {
        // Connect with the backend
        await this.backend.connect();
        logger.log(this.backend.serial, `${this.backend.type} connected`);
        this.backend.ondisconnect(() => {
            logger.log(this.backend.serial, `${this.backend.type} closed. Closing WebSocket.`);
            this.disconnectWebSocket(true);
        });

        // Connect to WebSocket
        this.ws = await new Promise<WebSocket>(async (resolve, reject) => {
            const ws = await serverConnection.createWebSocket("");

            ws.binaryType = "arraybuffer";

            let resolved = false;
            ws.onopen = () => {
                resolved = true;
                resolve(ws)
            }
            ws.onerror = () => {}   // This is required in node to not crash on error
            ws.onclose = () => {
                if (!resolved) { reject(new Error("Error connecting to WebSocket")); }
            }
        }).catch(async (e) => {
            await this.disconnectBackend(false);

            throw e;
        });

        this.ws.onerror = (e) => {
            logger.log(this.backend.serial, `WebSocket error: ${e}`);
        }

        this.ws.onclose = (e) => {
            logger.log(this.backend.serial, `WebSocket closed (code: ${e.code}${e.reason ? `, reason: ${e.reason}` : ""}). Closing device.`);
            this.disconnectBackend(true);
        }

        logger.log(this.backend.serial, "WebSocket connected");

        await this.backend.pipe(this.ws);

        this.emit("connected", this);
    }

    private disconnectBackend = async (emit: boolean) => {
        await this.backend.dispose();
        logger.log(this.backend.serial, `${this.backend.type} closed`);

        if (emit) {
            this.emit("disconnected", this);
        }
    }

    private disconnectWebSocket = async (emit: boolean) => {
        this.ws.onclose = undefined;
        this.ws.close();
        logger.log(this.backend.serial, `WebSocket closed`);

        if (emit) {
            this.emit("disconnected", this);
        }
    }

    disconnect = async () => {
        await this.disconnectBackend(false);
        await this.disconnectWebSocket(false);

        this.emit("disconnected", this);
    }
}

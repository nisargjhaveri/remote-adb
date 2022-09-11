import { EventEmitter } from "events";
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

    // Total data transferred in bytes
    private _bytesTransferred = {
        up: 0,      // Sent to WebSocket
        down: 0     // Sent to the device
    }
    get bytesTransferred() {
        return this._bytesTransferred;
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
        console.log(this.backend.serial, `${this.backend.type} connected`);
        this.backend.ondisconnect(() => {
            console.log(this.backend.serial, `${this.backend.type} closed. Closing WebSocket.`);
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

        this.ws.onclose = () => {
            console.log(this.backend.serial, "WebSocket closed. Closing device.");
            this.disconnectBackend(true);
        }

        console.log(this.backend.serial, "WebSocket connected");

        await this.backend.pipe(this.ws);

        this.emit("connected", this);
    }

    private disconnectBackend = async (emit: boolean) => {
        await this.backend.dispose();
        console.log(this.backend.serial, `${this.backend.type} closed`);

        if (emit) {
            this.emit("disconnected", this);
        }
    }

    private disconnectWebSocket = async (emit: boolean) => {
        this.ws.onclose = undefined;
        this.ws.close();
        console.log(this.backend.serial, `WebSocket closed`);

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

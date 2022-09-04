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
        down: 0     // Sent to USB
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
        // Connect with USB backend
        await this.backend.connect();
        console.log(this.backend.serial, "USB connected");
        this.backend.ondisconnect(this.disconnect);

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
            await this.disconnectUsb();

            throw e;
        });

        this.ws.onmessage = this.writeLoopCallback(this.backend, this.ws);
        this.ws.onclose = () => {
            console.log(this.backend.serial, "WebSocket closed. Closing device.");
            this.disconnect();
        }

        console.log(this.backend.serial, "WebSocket connected");
        this.emit("connected", this);

        this.readLoop(this.backend, this.ws).then(() => {
            console.log(this.backend.serial, "Closing WebSocket");
            this.ws.close();
        });
    }

    private disconnectUsb = async () => {
        await this.backend.dispose();
        console.log(this.backend.serial, "USB closed");
    }

    disconnect = async () => {
        await this.disconnectUsb();
        this.emit("disconnected", this);
    }

    private wsSendOrIgnore(ws: WebSocket, buffer: ArrayBuffer, logTag: string) {
        // We sometimes need to ignore stale data coming from usb before the connection is initialized from the adb server.
        if (ws.readyState !== ws.OPEN) {
            console.warn(logTag, "WebSocket is not open. Ignoring sent data");
            return;
        }
        ws.send(buffer);

        this.bytesTransferred.up += buffer.byteLength;
    }

    private async backendWriteOrIgnore(backend: AdbTransport, buffer: ArrayBuffer, logTag: string) {
        // We sometimes need to ignore stale data coming from usb before the connection is initialized from the adb server.
        if (!backend.connected) {
            console.warn(logTag, "Device is not connected. Ignoring sent data");
            return;
        }
        await backend.write(buffer);

        this.bytesTransferred.down += buffer.byteLength;
    }

    private getPayloadLength(headerBuffer: ArrayBuffer) {
        // Get the fourth 32 bit integer from the header. This is the payload length
        let header = new DataView(headerBuffer);
        return header.getUint32(12 /* byteOffset */, true /* littleEndian */);
    }

    private async readLoop(backend: AdbTransport, ws: WebSocket) {
        try {
            do {
                // Read header
                let buffer: ArrayBuffer = await backend.read(24);

                // Detect boundary
                // Note that it relies on the backend to only return data from one write operation
                while (buffer.byteLength !== 24) {
                    // Maybe it's a payload from last connection.
                    // Ignore and try again
                    buffer = await backend.read(24);
                }
                this.wsSendOrIgnore(ws, buffer, backend.serial);

                // let packetHeader = await parsePacketHeader(buffer, backend);
                let payload_length = this.getPayloadLength(buffer); //packetHeader.payloadLength;

                console.log(backend.serial, "==> header", payload_length);

                // Read payload as well
                while (payload_length > 0) {
                    buffer = await backend.read(payload_length);
                    this.wsSendOrIgnore(ws, buffer, backend.serial);

                    console.log(backend.serial, `==> payload ${payload_length} bytes`);
                    payload_length -= buffer.byteLength;
                }
            }
            while (backend.connected && (ws.readyState === ws.CONNECTING || ws.readyState === ws.OPEN));
        }
        catch (e) {
            console.error(backend.serial, e);
        }

        console.log(backend.serial, "Ending read loop");
        return;
    }

    private concatBuffers(b1: ArrayBuffer, b2: ArrayBuffer): ArrayBuffer {
        let tmp = new Uint8Array(b1.byteLength + b2.byteLength);

        tmp.set(new Uint8Array(b1), 0);
        tmp.set(new Uint8Array(b2), b1.byteLength);

        return tmp.buffer;
    }

    private writeLoopCallback(backend: AdbTransport, ws: WebSocket): ((e: any) => void) {
        const AWAITING_HEADER = "AWAITING_HEADER";
        const AWAITING_PAYLOAD = "AWAITING_PAYLOAD";

        let state = AWAITING_HEADER;
        let pending_data = new ArrayBuffer(0);
        let payload_length = 0;

        let lastPromise = Promise.resolve();

        let handleWriteData = async (data: ArrayBuffer) => {
            if (pending_data.byteLength > 0) {
                data = this.concatBuffers(pending_data, data);
                pending_data = new ArrayBuffer(0);
            }

            switch (state) {
                case AWAITING_HEADER:
                    if (data.byteLength < 24) {
                        pending_data = data;
                        console.log(`Was expecting 24 bytes, but got ${data.byteLength} bytes. Waiting for more data`);
                    }
                    else {
                        let buffer = await data.slice(0, 24);
                        await this.backendWriteOrIgnore(backend, buffer, backend.serial);

                        // let packetHeader = await parsePacketHeader(buffer, backend);
                        payload_length = this.getPayloadLength(buffer); //packetHeader.payloadLength;

                        console.log(backend.serial, "<== header", payload_length);

                        if (payload_length > 0) {
                            state = AWAITING_PAYLOAD;
                        }

                        if (data.byteLength > 24) {
                            await handleWriteData(data.slice(24));
                        }
                    }

                    break;
                case AWAITING_PAYLOAD:
                    if (data.byteLength > payload_length) {
                        let boundry = payload_length;
                        await handleWriteData(data.slice(0, boundry));
                        await handleWriteData(data.slice(boundry));
                    }
                    else {
                        await this.backendWriteOrIgnore(backend, data, backend.serial);
                        console.log(backend.serial, `<== payload ${payload_length} bytes`);

                        payload_length -= data.byteLength;

                        if (payload_length == 0) {
                            state = AWAITING_HEADER;

                            // Sometimes we stop recieving read data after a large transfer.
                            // Writing something seems to resume the communication.
                            // Writing a zero length buffer here as a workaround, not sure if this is expected.
                            await this.backendWriteOrIgnore(backend, new Int8Array(), backend.serial);
                        }
                    }

                    break;
            }
        }

        return (event: MessageEvent) => {
            lastPromise = lastPromise.then(async () => { await handleWriteData(event.data); });
        }
    }
}

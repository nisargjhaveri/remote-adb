import { AdbWebUsbBackend } from '@yume-chan/adb-backend-webusb';

function getPayloadLength(headerBuffer: ArrayBuffer) {
    // Get the fourth 32 bit integer from the header. This is the payload length
    let header = new DataView(headerBuffer);
    return header.getUint32(12 /* byteOffset */, true /* littleEndian */);
}

export type UsbDeviceConnectionCallback = {
    onConnect(device: UsbDevice): void,
    onDisconnect(device: UsbDevice): void,
}

export class UsbDevice {
    private backend: AdbWebUsbBackend;
    private callback: UsbDeviceConnectionCallback;

    public serial: string;
    public name: string;

    // Total data transferred in bytes
    private _bytesTransferred = {
        up: 0,      // Sent to WebSocket
        down: 0     // Sent to USB
    }
    get bytesTransferred() {
        return this._bytesTransferred;
    }

    constructor(backend: AdbWebUsbBackend, callback: UsbDeviceConnectionCallback) {
        this.backend = backend;
        this.callback = callback;

        this.serial = backend.serial;
        this.name = backend.name;
    }

    get connected() {
        return this.backend.connected;
    }

    connect = async () => {
        // Connect with USB backend
        await this.backend.connect();
        console.log(this.backend.serial, "connected", this.backend);
        this.backend.onDisconnected(this.disconnect);
        this.callback.onConnect(this);

        // Connect to WebSocket
        let wsUrl = new URL(window.location.href);
        wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
        const ws = new WebSocket(wsUrl.href);

        // Setup forwarding loops
        ws.onmessage = this.writeLoopCallback(this.backend, ws);
        ws.onclose = () => {
            console.log(this.backend.serial, "WebSocket closed. Closing device.");
            this.disconnect();
        }
        this.readLoop(this.backend, ws).then(() => {
            console.log(this.backend.serial, "Closing WebSocket");
            ws.close();
        });
    }

    disconnect = () => {
        this.backend.dispose();

        this.callback.onDisconnect(this);
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

    private async backendWriteOrIgnore(backend: AdbWebUsbBackend, buffer: ArrayBuffer, logTag: string) {
        // We sometimes need to ignore stale data coming from usb before the connection is initialized from the adb server.
        if (!backend.connected) {
            console.warn(logTag, "Device is not connected. Ignoring sent data");
            return;
        }
        await backend.write(buffer);

        this.bytesTransferred.down += buffer.byteLength;
    }

    private async readLoop(backend: AdbWebUsbBackend, ws: WebSocket) {
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
                let payload_length = getPayloadLength(buffer); //packetHeader.payloadLength;

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

    private writeLoopCallback(backend: AdbWebUsbBackend, ws: WebSocket): ((e: MessageEvent<any>) => any) {
        const AWAITING_HEADER = "AWAITING_HEADER";
        const AWAITING_PAYLOAD = "AWAITING_PAYLOAD";

        let state = AWAITING_HEADER;
        let pending_data = new Blob();
        let payload_length = 0;

        let lastPromise = Promise.resolve();

        let handleWriteData = async (data: Blob) => {
            if (pending_data.size > 0) {
                data = new Blob([pending_data, data]);
                pending_data = new Blob();
            }

            switch (state) {
                case AWAITING_HEADER:
                    if (data.size < 24) {
                        pending_data = data;
                        console.log(`Was expecting 24 bytes, but got ${data.size} bytes. Waiting for more data`);
                    }
                    else {
                        let buffer = await data.slice(0, 24).arrayBuffer();
                        await this.backendWriteOrIgnore(backend, buffer, backend.serial);

                        // let packetHeader = await parsePacketHeader(buffer, backend);
                        payload_length = getPayloadLength(buffer); //packetHeader.payloadLength;

                        console.log(backend.serial, "<== header", payload_length);

                        if (payload_length > 0) {
                            state = AWAITING_PAYLOAD;
                        }

                        if (data.size > 24) {
                            await handleWriteData(data.slice(24));
                        }
                    }

                    break;
                case AWAITING_PAYLOAD:
                    if (data.size > payload_length) {
                        let boundry = payload_length;
                        await handleWriteData(data.slice(0, boundry));
                        await handleWriteData(data.slice(boundry));
                    }
                    else {
                        let buffer = await data.arrayBuffer();
                        await this.backendWriteOrIgnore(backend, buffer, backend.serial);
                        console.log(backend.serial, `<== payload ${payload_length} bytes`);

                        payload_length -= data.size;

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

        return (event) => {
            lastPromise = lastPromise.then(async () => { await handleWriteData(event.data); });
        }
    }
}

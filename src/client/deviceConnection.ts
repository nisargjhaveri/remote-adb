import { AdbWebUsbBackend } from '@yume-chan/adb-backend-webusb';

export async function connectDevice(device: AdbWebUsbBackend, disconnect: (device: AdbWebUsbBackend) => void) {
    await device.connect();
    console.log(device.serial, "connected", device);

    let wsUrl = new URL(window.location.href);
    wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
    const ws = new WebSocket(wsUrl.href);

    ws.onmessage = writeLoopCallback(device, ws);
    ws.onclose = () => { 
        console.log(device.serial, "WebSocket closed. Closing device.");
        disconnect(device); 
    }
    readLoop(device, ws).then(() => {
        console.log(device.serial, "Closing WebSocket");
        ws.close();
    });
}

function getPayloadLength(headerBuffer: ArrayBuffer) {
    // Get the fourth 32 bit integer from the header. This is the payload length
    let header = new DataView(headerBuffer);
    return header.getUint32(12 /* byteOffset */, true /* littleEndian */);
}

function wsSendOrIgnore(ws: WebSocket, buffer: ArrayBuffer, logTag: string) {
    // We sometimes need to ignore stale data coming from usb before the connection is initialized from the adb server.
    if (ws.readyState !== ws.OPEN) {
        console.warn(logTag, "WebSocket is not open. Ignoring sent data");
        return;
    }
    ws.send(buffer);
}

function backendWriteOrIgnore(backend: AdbWebUsbBackend, buffer: ArrayBuffer, logTag: string) {
    // We sometimes need to ignore stale data coming from usb before the connection is initialized from the adb server.
    if (!backend.connected) {
        console.warn(logTag, "Device is not connected. Ignoring sent data");
        return;
    }
    backend.write(buffer);
}

async function readLoop(backend: AdbWebUsbBackend, ws: WebSocket) {
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
            wsSendOrIgnore(ws, buffer, backend.serial);

            // let packetHeader = await parsePacketHeader(buffer, backend);
            let payload_length = getPayloadLength(buffer); //packetHeader.payloadLength;

            console.log(backend.serial, "==> header", payload_length);

            // Read payload as well
            while (payload_length > 0) {
                buffer = await backend.read(payload_length);
                wsSendOrIgnore(ws, buffer, backend.serial);

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

function writeLoopCallback(backend: AdbWebUsbBackend, ws: WebSocket): ((e: MessageEvent<any>) => any) {
    const AWAITING_HEADER = "AWAITING_HEADER";
    const AWAITING_PAYLOAD = "AWAITING_PAYLOAD";
    let state = AWAITING_HEADER;
    let payload_length = 0;

    let lastPromise = Promise.resolve();

    let handleWriteData = async (data: Blob) => {
        let buffer: ArrayBuffer;
        
        switch (state) {
            case AWAITING_HEADER:
                if (data.size < 24) {
                    throw new Error("Error: Was Expecting at least 24 bytes");
                }

                buffer = await data.slice(0, 24).arrayBuffer();
                backendWriteOrIgnore(backend, buffer, backend.serial);

                // let packetHeader = await parsePacketHeader(buffer, backend);
                payload_length = getPayloadLength(buffer); //packetHeader.payloadLength;

                console.log(backend.serial, "<== header", payload_length);

                if (payload_length > 0) {
                    state = AWAITING_PAYLOAD;
                }

                if (data.size > 24) {
                    await handleWriteData(data.slice(24));
                }

                break;
            case AWAITING_PAYLOAD:
                if (data.size > payload_length) {
                    let boundry = payload_length;
                    await handleWriteData(data.slice(0, boundry));
                    await handleWriteData(data.slice(boundry));
                }
                else {
                    buffer = await data.arrayBuffer();
                    backendWriteOrIgnore(backend, buffer, backend.serial);
                    console.log(backend.serial, `<== payload ${payload_length} bytes`);

                    payload_length -= data.size;

                    if (payload_length == 0) {
                        state = AWAITING_HEADER;
                    }
                }

                break;
        }
    }

    return (event) => {
        lastPromise = lastPromise.then(async () => { await handleWriteData(event.data); });
    }
}

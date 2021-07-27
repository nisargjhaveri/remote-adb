import { AdbWebUsbBackend } from '@yume-chan/adb-backend-webusb';

export async function connectDevice(device: AdbWebUsbBackend) {
    await device.connect();
    console.log(device.serial, "connected", device);

    let wsUrl = new URL(window.location.href);
    wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
    const ws = new WebSocket(wsUrl.href);

    ws.onmessage = writeLoopCallback(device, ws);
    readLoop(device, ws).then(() => {
        console.log(device.serial, "Closing WebSocket");
        ws.close();
    });
}

function getPayloadLength(headerBuffer: ArrayBuffer) {
    let header = new DataView(headerBuffer);
    return header.getUint32(12 /* byteOffset */, true /* littleEndian */);
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
            ws.send(buffer);

            // let packetHeader = await parsePacketHeader(buffer, backend);
            let payload_length = getPayloadLength(buffer); //packetHeader.payloadLength;

            console.log(backend.serial, "==> header", payload_length);

            // Read payload as well
            while (payload_length > 0) {
                buffer = await backend.read(payload_length);
                ws.send(buffer);

                console.log(backend.serial, `==> payload ${payload_length} bytes`);
                payload_length -= buffer.byteLength;
            }
        }
        while (backend.connected && ws.readyState === ws.OPEN);
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
                backend.write(buffer);

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
                    backend.write(buffer);
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

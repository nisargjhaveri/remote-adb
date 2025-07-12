// This class knows and handles ADB Transport protocol.
// Details: https://android.googlesource.com/platform/packages/modules/adb/+/master/protocol.txt

import logger from '../common/logger';

export type LoggerConfig = {
    // enabled: boolean,
    tag: string,
    direction: "<=="|"==>"
}

export class AdbTransportProtocolHandler {
    private static getPayloadLength(headerBuffer: ArrayBuffer) {
        // Get the fourth 32 bit integer from the header. This is the payload length
        let header = new DataView(headerBuffer);
        return header.getUint32(12 /* byteOffset */, true /* littleEndian */);
    }

    private static concatBuffers(b1: ArrayBuffer, b2: ArrayBuffer): ArrayBuffer {
        let tmp = new Uint8Array(b1.byteLength + b2.byteLength);

        tmp.set(new Uint8Array(b1), 0);
        tmp.set(new Uint8Array(b2), b1.byteLength);

        return tmp.buffer;
    }

    // Starts the read-write loop for piping adb transport.
    // Useful when input data can be read on demand.
    public static async startPullPushLoop(isConnected: () => boolean, pull: (length: number) => Promise<ArrayBuffer>, push: (buffer: ArrayBuffer) => Promise<void>, loggerConfig: LoggerConfig) {
        try {
            do {
                // Read header
                let buffer: ArrayBuffer = await pull(24);

                // If we don't get required data, chances are connection is gone
                // Ignore and try again
                while (buffer.byteLength !== 24) {
                    continue;
                }

                await push(buffer);   // Push header

                let payload_length = this.getPayloadLength(buffer);

                logger.log(loggerConfig.tag, loggerConfig.direction, "header", payload_length);

                // Read payload as well
                while (payload_length > 0) {
                    buffer = await pull(payload_length);
                    await push(buffer);

                    logger.log(loggerConfig.tag, loggerConfig.direction, `payload ${payload_length} bytes`, new TextDecoder().decode(buffer));
                    payload_length -= buffer.byteLength;
                }
            }
            while (isConnected());
        }
        catch (e) {
            logger.error(loggerConfig.tag, e);
        }

        return;
    }

    // Returns a function which takes data and calls push for each header and payload as and when available for piping the adb transport.
    // This is useful and input data is available in form of "data" or "message" callbacks, instead of on demand.
    public static createDataEventHandler(push: (buffer: ArrayBuffer) => Promise<void>, loggerConfig: LoggerConfig): (data: ArrayBuffer) => void {
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
                        logger.log(`Was expecting 24 bytes, but got ${data.byteLength} bytes. Waiting for more data`);
                    }
                    else {
                        let buffer = data.slice(0, 24);
                        await push(buffer);

                        // let packetHeader = await parsePacketHeader(buffer, backend);
                        payload_length = this.getPayloadLength(buffer); //packetHeader.payloadLength;

                        logger.log(loggerConfig.tag, loggerConfig.direction, "header", payload_length);

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
                        await push(data);
                        logger.log(loggerConfig.tag, loggerConfig.direction, `payload ${payload_length} bytes`, new TextDecoder().decode(data));

                        payload_length -= data.byteLength;

                        if (payload_length == 0) {
                            state = AWAITING_HEADER;

                            // Sometimes we stop recieving read data after a large transfer.
                            // Writing something seems to resume the communication.
                            // Writing a zero length buffer here as a workaround, not sure if this is expected.
                            await push(new Uint8Array().buffer);
                        }
                    }

                    break;
            }
        }

        return (data: ArrayBuffer) => {
            // logger.log(loggerConfig.tag, loggerConfig.direction, new TextDecoder().decode(data));
            lastPromise = lastPromise.then(async () => { await handleWriteData(data); });
        }
    }
}

export default AdbTransportProtocolHandler;
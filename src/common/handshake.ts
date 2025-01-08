import type WebSocket from 'isomorphic-ws';

export type ClientHandshake = {
    type: "handshake",
    name: string,
    serial: string,
}

export type ServerHandshake = {
    type: "handshake",
    serial: string,
}

export function getRemoteHandshake<T extends ClientHandshake|ServerHandshake>(ws: WebSocket, callback?: (handshakeData: T) => Promise<void>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onWebsocketClose = () => {
            reject(new Error("WebSocket closed while waiting for handshake"));
        };

        ws.addEventListener("close", onWebsocketClose, {once: true});

        ws.onmessage = async (message) => {
            let handshakeData: T;

            try {
                if (typeof message.data !== "string") {
                    throw new Error("Unexpected handshake message type");
                }

                handshakeData = JSON.parse(message.data);

                if (handshakeData.type !== "handshake") {
                    throw new Error("Unexpected handshake message");
                }
            } catch(e) {
                reject(new Error(`Handshake failed: ${e.message}`));
                return;
            } finally {
                ws.removeEventListener("close", onWebsocketClose);
            }

            try {
                // Reset onmessage and call the callback synchronously.
                // This is required as onmessage needs to be updated synchronously to prevent missed messages.
                ws.onmessage = undefined;
                await callback?.(handshakeData);

                resolve(handshakeData);
            } catch(e) {
                reject(new Error(`Handshake callback failed: ${e.message}`));
            }
        };
    });
}

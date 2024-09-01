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

export function getRemoteHandshake<T extends ClientHandshake|ServerHandshake>(ws: WebSocket): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onWebsocketClose = () => {
            reject(new Error("WebSocket closed while waiting for handshake"));
        };

        ws.addEventListener("close", onWebsocketClose, {once: true});

        ws.addEventListener("message", (message) => {
            try {
                const handshakeData: T = JSON.parse(message.data);

                if (handshakeData.type !== "handshake") {
                    throw new Error("Unexpected handshake message");
                }

                resolve(handshakeData);
            } catch(e) {
                reject(new Error(`Handshake failed: ${e.message}`));
            } finally {
                ws.removeEventListener("close", onWebsocketClose);
            }
        }, {once: true});
    });
}

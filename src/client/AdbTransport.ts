import type { WebSocket } from "./ServerConnection";
export type { WebSocket } from "./ServerConnection";

export interface AdbTransport {
    readonly type: "USB"|"TCP";

    readonly serial: string;

    readonly name: string | undefined;

    readonly connected: boolean;

    ondisconnect(listener: (e: Event) => void): void;

    connect?(): Promise<void>;

    pipe(ws: WebSocket): Promise<void>;

    dispose(): Promise<void>;
}
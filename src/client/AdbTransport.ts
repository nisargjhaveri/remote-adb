export interface AdbTransport {
    readonly type: "USB"|"TCP";

    readonly serial: string;

    readonly name: string | undefined;

    readonly connected: boolean;

    ondisconnect(listener: (e: Event) => void): void;

    connect?(): Promise<void>;

    write(buffer: ArrayBuffer): Promise<void>;

    read(length: number): Promise<ArrayBuffer>;

    dispose(): Promise<void>;
}
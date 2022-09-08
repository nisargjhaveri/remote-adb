import { EventEmitter } from 'events';
import { Socket } from 'net';
import { AdbTransport } from './AdbTransport';

// Works only in node, not in browser
export class AdbTcpTransport implements AdbTransport {
    private host: string;
    private port: number;

    private socket: Socket;

    readonly type = "TCP";

    public get serial(): string { return `${this.host}:${this.port}`; }

    public get name(): string { return this.serial; }

    private _connected = false;
    public get connected() { return this._connected; }

    private readonly events = new EventEmitter();
    public readonly ondisconnect = (listener: (e: Event) => void) => this.events.addListener('disconnect', listener);

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }

    private handleClose = (hadError: boolean) => {
        this._connected = false;
        this.events.emit('disconect');
    }

    async connect(): Promise<void> {
        this.socket = await new Promise((resolve, reject) => {
            let resolved = false;

            const socket = new Socket();

            socket.once('error', (e) => {
                if (!resolved) {
                    reject(e);
                }
            })

            socket.once("connect", () => {
                resolved = true;
                resolve(socket);
            })

            socket.connect(this.port, this.host);
        });

        this.socket.on("close", this.handleClose);

        this._connected = true;
    }
    
    async write(buffer: ArrayBuffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.socket.write(new Uint8Array(buffer), (err) => {
                err ? reject(err) : resolve();
            });
        });
    }

    async read(length: number, timeout?: number): Promise<ArrayBuffer> {
        const b = await new Promise<Buffer>((resolve, reject) => {
            if (this.socket.readableLength >= length) {
                resolve(this.socket.read(length) as Buffer);
                return;
            }

            let timeoutId: NodeJS.Timeout|undefined;
            let readAndResolve = (timeout = false) => {
                let buffer = this.socket.read(length);

                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                this.socket.off("readable", readableListener);
                this.socket.off("end", readAndResolve);

                if (buffer === null) {
                    return reject(new Error(timeout ? "Could not read data in specified time" : "Connection closed"));
                }

                return resolve(buffer);
            };

            let readableListener = () => {
                if (this.socket.readableLength >= length) {
                    readAndResolve();
                }
            };

            this.socket.on("readable", readableListener);
            this.socket.on("end", readAndResolve);

            if (timeout) {
                timeoutId = setTimeout(() => readAndResolve(true), timeout);
            }
        });

        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }

    async dispose(): Promise<void> {
        this._connected = false;
        this.socket.off("close", this.handleClose);
        this.events.removeAllListeners();

        return new Promise((resolve, reject) => {
            this.socket.end(resolve);
        })
    }
}

import { EventEmitter } from 'events';
import { Socket } from 'net';
import { Transform, TransformCallback, TransformOptions } from 'stream';
import { createWebSocketStream } from 'ws';
import { AdbTransport, WebSocket } from './AdbTransport';
import AdbTransportProtocolHandler, { LoggerConfig } from './AdbTransportProtocolHandler';

// Works only in node, not in browser

// Takes in ArrayBuffer and converts it to Buffer for the remaining pipeline to consume
class ConvertToBuffer extends Transform {
    constructor(opts?: TransformOptions) {
        super({
            ...opts,
            writableObjectMode: true
        })
    }

    _transform(chunk: ArrayBuffer, encoding: BufferEncoding, callback: TransformCallback): void {
        this.push(Buffer.from(chunk));
        callback();
    }
}

// Logger for the adb communication, parses and logs the incoming data.
// Does nothing otherwise, the incoming stream is passed through.
class AdbCommunicationLogger extends Transform {
    private dataEventHandler;

    constructor(loggerConfig: LoggerConfig, opts?: TransformOptions) {
        super(opts);

        this.dataEventHandler = AdbTransportProtocolHandler.createDataEventHandler(async () => {}, loggerConfig);
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        this.dataEventHandler(chunk.buffer);

        this.push(chunk);
        callback();
    }
}

class BytesCounter extends Transform {
    private add;

    constructor(add: (bytes: number) => void) {
        super();

        this.add = add;
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        this.add(chunk.byteLength);

        this.push(chunk);
        callback();
    }
}

export class AdbTcpTransport implements AdbTransport {
    private host: string;
    private port: number;

    private socket: Socket;

    readonly type = "TCP";

    public get serial(): string { return `${this.host}:${this.port}`; }

    public get name(): string { return this.serial; }

    private _connected = false;
    public get connected() { return this._connected; }

    private _bytesTransferred = {
        up: 0,
        down: 0,
    }
    get bytesTransferred() { return this._bytesTransferred; }

    private readonly events = new EventEmitter();
    public readonly ondisconnect = (listener: (e: Event) => void) => this.events.addListener('disconnect', listener);

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }

    private handleClose = (hadError: boolean) => {
        this._connected = false;
        this.events.emit('disconnect');
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

    async pipe(ws: WebSocket) {
        // Our ws uses binaryType arraybuffer, which does not work with streams.
        // Set readableObjectMode to true and convert the arraybuffer to buffer in the pipe.
        const wsStream = createWebSocketStream(ws, {
            readableObjectMode: true,
        });

        wsStream
            .pipe(new ConvertToBuffer())
            .pipe(new AdbCommunicationLogger({ tag: this.serial, direction: "<=="}))
            .pipe(new BytesCounter((bytes) => { this._bytesTransferred.down += bytes; }))
            .pipe(this.socket)
            .pipe(new AdbCommunicationLogger({ tag: this.serial, direction: "==>"}))
            .pipe(new BytesCounter((bytes) => { this._bytesTransferred.up += bytes; }))
            .pipe(wsStream, {end: false});
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

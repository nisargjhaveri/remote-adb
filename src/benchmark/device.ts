import * as net from 'net';
import logger from '../common/logger';
import { randomBytes } from 'crypto';

export class BenchmarkDevice {
    public serial: string;

    private server: net.Server;
    private socket: net.Socket;

    static async create(): Promise<BenchmarkDevice> {
        return new Promise((resolve, reject) => {
            const device = new BenchmarkDevice();

            device.server = net.createServer((socket) => {
                device.socket = socket;
                logger.log(device.serial, `Benchmark device connected`);

                socket.on("data", (data) => {
                    logger.log(`Received data: ${data.length} bytes`);
                    // Echo back the data
                    socket.write(data);
                });

                socket.on("close", () => {
                    logger.log(`Connection closed from ${socket.remoteAddress}:${socket.remotePort}`);
                });
            }).listen(0, "127.0.0.1", () => {
                const address = (device.server.address() as net.AddressInfo);
                device.serial = `${address.address}:${address.port}`;

                logger.log(`Benchmark device listening on ${device.serial}`);
                resolve(device);
            });

            device.server.on("error", (err) => {
                logger.error(`Error creating benchmark device: ${err.message}`);
                reject(err);
            });
        });
    }

    getRandomMessage(size: number): Buffer {
        return randomBytes(size);
    }

    async sendSmallMessages(count: number): Promise<void> {
        // this.socket.write(`Sending ${count} small messages...\n`);

        const header = Buffer.alloc(24, 0);
        for (let i = 0; i < count; i++) {
            const message = this.getRandomMessage(32);
            header.writeUint32LE(message.length, 12);
            this.socket.write(header);
            this.socket.write(message);
        }
    };
}

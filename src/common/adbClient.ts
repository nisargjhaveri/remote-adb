import * as net from 'net';

export class AdbClient {
    private socket: net.Socket;

    async connect(port = 5037, host = "127.0.0.1"): Promise<net.Socket> {
        return await new Promise<net.Socket>((resolve, reject) => {
            let socket = net.connect(port, host, () => {
                this.socket = socket;
                resolve(socket);
            });
            socket.on("error", reject);
        });
    }

    private async read(size: number): Promise<Buffer> {
        let data = this.socket.read(size);

        if (data === null) {
            await new Promise((resolve, reject) => {
                this.socket.once("readable", resolve);
            });
            return await this.read(size);
        }

        return data;
    }

    private writeRequest(request: string) {
        const length = request.length;
        this.socket.write(`000${length.toString(16)}`.slice(-4) + request);
    }

    // Returns string or null if connection is closed without any data
    // Throws if error in reading expected data
    async readMessage(): Promise<string|null> {
        let header = (await this.read(4)).toString();

        if (header.length === 0) {
            // Connection closed
            return null;
        }

        if (header.length < 4) {
            throw new Error("adb protocol error, could not read message length");
        }

        let length = parseInt(header, 16);
        if (length === 0) {
            return "";
        }

        let data = await this.read(length)

        if (data.length != length) {
            throw new Error("adb protocol error, could not read message");
        }

        return data.toString()
    }

    private async readResponse(): Promise<void> {
        let status = (await this.read(4)).toString();
        if (status === "OKAY") {
            return;
        }
        else if (status === "FAIL") {
            throw new Error(await this.readMessage());
        }
        else {
            throw new Error("adb protocol error, could not read status");
        }
    }

    async request(service: string): Promise<void> {
        this.writeRequest(service);

        return await this.readResponse();
    }
}

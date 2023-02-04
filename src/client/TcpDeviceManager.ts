import * as net from 'net';
import { AdbTcpTransport } from './AdbTcpTransport';
import { RemoteAdbDevice } from './RemoteAdbDevice';
import type { ITcpDeviceManager } from './ITcpDeviceManager';

let EMULATOR_DEFAULT_PORT = 5555;
let EMULATOR_MAX_PORT = 5585;
let EMULATOR_HOST = "127.0.0.1"

class TcpDeviceManagerSingleton implements ITcpDeviceManager {
    private connectedDevices = new Map<string, RemoteAdbDevice>();
    private connectedEmulators = new Map<string, RemoteAdbDevice>();

    isSupported(): boolean {
        return true;
    }

    async createDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
        let device = await this.getOrCreateTcpDevice(serial);

        if (device) {
            this.connectedDevices.set(serial, device);
        }

        return device;
    }

    async removeDevice(serial: string): Promise<void> {
        let device = this.connectedDevices.get(serial);

        if (device?.connected) {
            await device.disconnect();
        }

        this.connectedDevices.delete(serial);
    }

    private async getOrCreateTcpDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
        let device: RemoteAdbDevice|undefined = this.connectedDevices.get(serial) || this.connectedEmulators.get(serial);

        if (!device) {
            device = await this.createTcpDevice(serial);
        }

        return device;
    }

    private async createTcpDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
        try {
            let host: string;
            let port: number;

            if (serial.startsWith("emulator-")) {
                let consolePort = Number(serial.replace(/^emulator-/, ""));

                if (Number.isNaN(consolePort)) {
                    return;
                }

                host = EMULATOR_HOST;
                port = consolePort + 1;
            }
            else {
                const url = new URL(`tcp://${serial}`);

                if (!url.hostname || !url.port || Number.isNaN(Number(url.port))
                    || url.pathname || url.search || url.hash || url.username || url.password)
                {
                    return;
                }

                host = url.hostname;
                port = Number(url.port);
                serial = `${host}:${port}`;
            }

            return new RemoteAdbDevice(new AdbTcpTransport(serial, host, port));
        }
        catch {
            return;
        }
    }

    private async canConnectToSocket(host: string, port: number) {
        return await new Promise<void>((resolve, reject) => {

            const socket = net.createConnection({
                host,
                port
            }, () => {
                resolve();
                socket.end();
            })

            socket.once("error", (e) => {
                reject(e);
            })
        });
    }

    private async refreshEmulators() {
        let ports: number[] = []
        for (let port = EMULATOR_DEFAULT_PORT; port <= EMULATOR_MAX_PORT; port += 2) {
            ports.push(port);
        }

        let availablePorts: number[] = [];

        (await Promise.allSettled(
            ports.map(p => this.canConnectToSocket(EMULATOR_HOST, p))
        )).forEach((s, index) => {
            if (s.status == "fulfilled") {
                availablePorts.push(ports[index]);
            }
        });

        let devices = await Promise.all(availablePorts.map(p => this.getOrCreateTcpDevice(`emulator-${p-1}`)));

        this.connectedEmulators = new Map();
        devices.forEach(device => {
            // Skip adding if the emulator is also manually added
            if (!this.connectedDevices.has(device.serial)) {
                this.connectedEmulators.set(device.serial, device);
            }
        });
    }

    async getDevices() {
        await this.refreshEmulators();

        return Array.from(this.connectedDevices.values()).concat(Array.from(this.connectedEmulators.values()));
    }
}

export const TcpDeviceManager: ITcpDeviceManager = new TcpDeviceManagerSingleton();
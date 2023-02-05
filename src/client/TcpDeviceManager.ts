import EventEmitter from 'events';
import * as net from 'net';

import { AdbTcpTransport } from './AdbTcpTransport';
import { RemoteAdbDevice } from './RemoteAdbDevice';
import type { ITcpDeviceManager } from './ITcpDeviceManager';

const EMULATOR_DEFAULT_PORT = 5555;
const EMULATOR_MAX_PORT = 5585;
const EMULATOR_HOST = "127.0.0.1"

const REFRESH_LOOP_TIMEOUT = 5000;

class TcpDeviceManagerSingleton implements ITcpDeviceManager {
    private events = new EventEmitter();

    private connectedDevices = new Map<string, RemoteAdbDevice>();
    private connectedEmulators = new Map<string, RemoteAdbDevice>();

    private refreshLoopTimeout: NodeJS.Timeout;

    isSupported(): boolean {
        return true;
    }

    async createDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
        let device = await this.getOrCreateTcpDevice(serial);

        if (device) {
            this.connectedDevices.set(serial, device);
            this.notifyDevicesRefreshed();
        }

        return device;
    }

    async removeDevice(serial: string): Promise<void> {
        let device = this.connectedDevices.get(serial);

        if (device?.connected) {
            await device.disconnect();
        }

        if (this.connectedDevices.delete(serial)) {
            this.notifyDevicesRefreshed();
        }
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

            const device = new RemoteAdbDevice(new AdbTcpTransport(serial, host, port));
            device.on("connected", this.notifyDevicesRefreshed);
            device.on("disconnected", this.notifyDevicesRefreshed);

            return device;
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

        const serials = availablePorts.map(p => `emulator-${p-1}`);
        const serialsSet = new Set(serials);

        if (
            // If every available serial is already seen before
            serials.every(serial => this.connectedDevices.has(serial) || this.connectedEmulators.has(serial))
            // And every emulator is still available
            && Array.from(this.connectedEmulators.keys()).every(serial => serialsSet.has(serial)))
        {
            // No update is needed.
            return;
        }

        let devices = await Promise.all(serials.map(serial => this.getOrCreateTcpDevice(serial)));

        this.connectedEmulators = new Map();
        devices.forEach(device => {
            // Skip adding if the emulator is also manually added
            if (!this.connectedDevices.has(device.serial)) {
                this.connectedEmulators.set(device.serial, device);
            }
        });

        this.notifyDevicesRefreshed();
    }

    private refreshEmulatorsLoop = async () => {
        clearTimeout(this.refreshLoopTimeout);

        await this.refreshEmulators();

        this.refreshLoopTimeout = setTimeout(this.refreshEmulatorsLoop, REFRESH_LOOP_TIMEOUT);
    }

    private notifyDevicesRefreshed = async () => {
        const devices = Array.from(this.connectedDevices.values()).concat(Array.from(this.connectedEmulators.values()));
        this.events.emit("devices", devices);
    }

    async getDevices() {
        await this.refreshEmulators();

        return Array.from(this.connectedDevices.values()).concat(Array.from(this.connectedEmulators.values()));
    }

    monitorDevices(callback: (devices: RemoteAdbDevice[]) => void): void {
        this.events.on('devices', callback);

        this.notifyDevicesRefreshed();
        this.refreshEmulatorsLoop();
    }
}

export const TcpDeviceManager: ITcpDeviceManager = new TcpDeviceManagerSingleton();
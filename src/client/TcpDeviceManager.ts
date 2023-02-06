import EventEmitter from 'events';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

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
            this.connectedEmulators.delete(serial);
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

    canRemoveDevice(serial: string): boolean {
        return this.connectedDevices.has(serial);
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
            let name: string;

            if (serial.startsWith("emulator-")) {
                let consolePort = Number(serial.replace(/^emulator-/, ""));

                if (Number.isNaN(consolePort)) {
                    return;
                }

                host = EMULATOR_HOST;
                port = consolePort + 1;
                name = await this.getEmulatorName(consolePort);
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

            const device = new RemoteAdbDevice(new AdbTcpTransport(serial, name, host, port));
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

            const socket = net.connect({
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

    private async getEmulatorConsoleToken(): Promise<string|undefined> {
        try {
            const tokenFilePath = path.join(os.homedir(), ".emulator_console_auth_token");
            const token = await fs.readFile(tokenFilePath, { encoding: "utf8" });
            return token.trim();
        }
        catch {
            return undefined;
        }
    }

    private async getEmulatorName(consolePort: number): Promise<string|undefined> {
        return new Promise((resolve, reject) => {
            let responsesToSkip = 1;

            const socket = net.connect({
                host: EMULATOR_HOST,
                port: consolePort,
            }, async () => {
                let command = "";

                const token = await this.getEmulatorConsoleToken();
                if (token) {
                    command += `auth ${token}\n`;
                    responsesToSkip += 1;
                }

                command += "avd name\n";
                command += "quit\n";

                socket.write(command);
            });

            let output = "";
            socket.on("data", (data) => {
                output += data.toString("utf8");
            });

            socket.on("end", () => {
                let responses = output.split("OK\r\n");
                if (responses.length === (responsesToSkip + 2)) {
                    let name = responses[responsesToSkip].trim().replace(/_/g, " ");
                    resolve(name);
                }
                else {
                    resolve(undefined);
                }
            });

            socket.on("error", (e) => {
                resolve(undefined);
            });
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
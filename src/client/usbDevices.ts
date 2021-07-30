import { AdbWebUsbBackend, AdbWebUsbBackendWatcher } from '@yume-chan/adb-backend-webusb';
import { connectDevice } from './deviceConnection';

let refreshCallback = (devices: UsbDevice[]) => {}

export class UsbDevice {
    private backend: AdbWebUsbBackend;
    
    public serial: string;
    public name: string;

    constructor(backend: AdbWebUsbBackend) {
        this.backend = backend;

        this.serial = backend.serial;
        this.name = backend.name;
    }

    get connected() {
        return this.backend.connected;
    }

    connect = async () => {
        await connectDevice(this.backend, this.disconnect);

        connectedDevices[this.backend.serial] = this;
        this.backend.onDisconnected(this.disconnect);

        refreshDevices();
    }

    disconnect = () => {
        this.backend.dispose();

        delete connectedDevices[this.backend.serial];
    
        refreshDevices();
    }
}

export async function requestDevice() {
    await AdbWebUsbBackend.requestDevice();
    refreshDevices();
}

let connectedDevices: {[key: string]: UsbDevice} = {};


async function refreshDevices() {
    console.log("Refreshing device list");

    const devices = (await AdbWebUsbBackend.getDevices()).map((device) => {
        if (device.serial in connectedDevices) {
            return connectedDevices[device.serial];
        }
        return new UsbDevice(device);
    });

    refreshCallback(devices);

    return devices;
}

export function monitorDevices(callback: (devices: UsbDevice[]) => void) {
    refreshCallback = callback;

    refreshDevices();
    new AdbWebUsbBackendWatcher(refreshDevices);
}

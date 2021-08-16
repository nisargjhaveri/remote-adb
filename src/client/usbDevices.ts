import { AdbWebUsbBackend, AdbWebUsbBackendWatcher } from '@yume-chan/adb-backend-webusb';
import { UsbDevice } from './deviceConnection';
export { UsbDevice } from './deviceConnection';

let refreshCallback = (devices: UsbDevice[]) => {}

export async function requestDevice() {
    await AdbWebUsbBackend.requestDevice();
    refreshDevices();
}

let connectedDevices: {[key: string]: UsbDevice} = {};

function onDeviceConnect(device: UsbDevice) {
    connectedDevices[device.serial] = device;
    refreshDevices();
}

function onDeviceDisconnect(device: UsbDevice) {
    delete connectedDevices[device.serial];
    refreshDevices();
}

async function refreshDevices() {
    console.log("Refreshing device list");

    const devices = (await AdbWebUsbBackend.getDevices()).map((device) => {
        if (device.serial in connectedDevices) {
            return connectedDevices[device.serial];
        }
        return new UsbDevice(device, {
            onConnect: onDeviceConnect,
            onDisconnect: onDeviceDisconnect
        });
    });

    refreshCallback(devices);

    return devices;
}

export function monitorDevices(callback: (devices: UsbDevice[]) => void) {
    refreshCallback = callback;

    refreshDevices();
    new AdbWebUsbBackendWatcher(refreshDevices);
}

export function isSupported() {
    return AdbWebUsbBackend.isSupported()
}
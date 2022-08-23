import EventEmitter = require('events');

import { AdbWebUsbTransport, WebUsbDeviceFilter } from './AdbWebUsbTransport';
import { RemoteAdbDevice } from './RemoteAdbDevice';
export { RemoteAdbDevice } from './RemoteAdbDevice';


class UsbDeviceManagerSingleton {
    private events = new EventEmitter();
    private connectedDevices = new Map<USBDevice, RemoteAdbDevice>();

    private get usb() {
        return navigator?.usb
    }

    constructor() {
        this.events.once("newListener", (event, listener) => {
            this.usb.addEventListener('connect', this.refreshDevices);
            this.usb.addEventListener('disconnect', this.refreshDevices);
        })
    }

    isSupported = () => {
        return !!this.usb
    }

    requestDevice = async () => {
        let device = await this.usb.requestDevice({ filters: [WebUsbDeviceFilter] });

        this.refreshDevices();

        return device
    }

    private createRemoteAdbDevice = (d: USBDevice) => {
        let device = new RemoteAdbDevice(new AdbWebUsbTransport(d));
        device.on("connected", this.refreshDevices);
        device.on("disconnected", this.refreshDevices);

        return device;
    }

    private refreshDevices = async () => {
        console.log("Refreshing device list");

        const currentDevices = new Map<USBDevice, RemoteAdbDevice>();

        const devices = (await this.usb.getDevices()).map((d) => {
            let device = this.connectedDevices.get(d) ?? this.createRemoteAdbDevice(d);

            currentDevices.set(d, device);

            return device;
        });

        this.connectedDevices = currentDevices;

        this.events.emit("devices", devices);

        return devices;
    }

    monitorDevices = (callback: (devices: RemoteAdbDevice[]) => void) => {
        this.events.on('devices', callback);

        this.refreshDevices();
    }
}

export const UsbDeviceManager = new UsbDeviceManagerSingleton();
import EventEmitter = require('events');

import { WebUSB } from 'usb';

import { AdbWebUsbTransport, WebUsbDeviceFilter } from './AdbWebUsbTransport';
import { RemoteAdbDevice } from './RemoteAdbDevice';
export { RemoteAdbDevice } from './RemoteAdbDevice';


class UsbDeviceManagerSingleton {
    private events = new EventEmitter();
    private connectedDevices = new Map<USBDevice, RemoteAdbDevice>();

    private get usb() {
        if (typeof navigator !== "undefined") {
            return navigator?.usb;
        }
        if (typeof WebUSB !== "undefined") {
            return new WebUSB({
                allowAllDevices: true
            });
        }
        return undefined;
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
        let device = new RemoteAdbDevice(new AdbWebUsbTransport(this.usb, d));
        device.on("connected", this.refreshDevices);
        device.on("disconnected", this.refreshDevices);

        return device;
    }

    private refreshDevices = async () => {
        if (!this.events.listenerCount("devices")) {
            // If not listener is registered, don't do anything.
            return;
        }

        console.log("Refreshing device list");

        const devices = await this.getDevices();

        this.events.emit("devices", devices);

        return devices
    }

    getDevices = async () => {
        const currentDevices = new Map<USBDevice, RemoteAdbDevice>();

        const devices = (await this.usb.getDevices())
            .filter(d => {
                return d.configuration?.interfaces.some(iface => {
                    return iface.alternate.interfaceClass === WebUsbDeviceFilter.classCode
                        && iface.alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode
                        && iface.alternate.interfaceProtocol === WebUsbDeviceFilter.protocolCode
                });
            })
            .map((d) => {
                let device = this.connectedDevices.get(d) ?? this.createRemoteAdbDevice(d);

                currentDevices.set(d, device);

                return device;
            });

        this.connectedDevices = currentDevices;

        return devices;
    }

    monitorDevices = (callback: (devices: RemoteAdbDevice[]) => void) => {
        this.events.on('devices', callback);

        this.refreshDevices();
    }
}

export const UsbDeviceManager = new UsbDeviceManagerSingleton();
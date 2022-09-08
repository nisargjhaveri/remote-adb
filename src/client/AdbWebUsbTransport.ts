import { EventEmitter } from 'events';
import { AdbTransport } from './AdbTransport';

export const WebUsbDeviceFilter: USBDeviceFilter = {
    classCode: 0xFF,
    subclassCode: 0x42,
    protocolCode: 1,
};

// Adopted from https://github.com/yume-chan/ya-webadb/blob/v0.0.9/packages/adb-backend-webusb/src/backend.ts
export class AdbWebUsbTransport implements AdbTransport {
    private _usb: USB;
    private _device: USBDevice;

    readonly type = "USB";

    public get serial(): string { return this._device.serialNumber!; }

    public get name(): string { return this._device.productName!; }

    private _connected = false;
    public get connected() { return this._connected; }

    private readonly events = new EventEmitter();
    public readonly ondisconnect = (listener: (e: Event) => void) => this.events.addListener('disconnect', listener);

    private _inEndpointNumber!: number;
    private _outEndpointNumber!: number;

    public constructor(usb: USB, device: USBDevice) {
        this._usb = usb
        this._device = device;

        this._usb.addEventListener('disconnect', this.handleDisconnect);
    }

    private handleDisconnect = (e: USBConnectionEvent) => {
        if (e.device === this._device) {
            this._connected = false;
            this.events.emit('disconect');
        }
    };

    public async connect(): Promise<void> {
        if (!this._device.opened) {
            await this._device.open();
        }

        for (const configuration of this._device.configurations) {
            for (const interface_ of configuration.interfaces) {
                for (const alternate of interface_.alternates) {
                    if (alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode &&
                        alternate.interfaceClass === WebUsbDeviceFilter.classCode &&
                        alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode) {
                        if (this._device.configuration?.configurationValue !== configuration.configurationValue) {
                            await this._device.selectConfiguration(configuration.configurationValue);
                        }

                        if (!interface_.claimed) {
                            await this._device.claimInterface(interface_.interfaceNumber);
                        }

                        if (interface_.alternate.alternateSetting !== alternate.alternateSetting) {
                            await this._device.selectAlternateInterface(interface_.interfaceNumber, alternate.alternateSetting);
                        }

                        for (const endpoint of alternate.endpoints) {
                            switch (endpoint.direction) {
                                case 'in':
                                    this._inEndpointNumber = endpoint.endpointNumber;
                                    if (this._outEndpointNumber !== undefined) {
                                        this._connected = true;
                                        return;
                                    }
                                    break;
                                case 'out':
                                    this._outEndpointNumber = endpoint.endpointNumber;
                                    if (this._inEndpointNumber !== undefined) {
                                        this._connected = true;
                                        return;
                                    }
                                    break;
                            }
                        }
                    }
                }
            }
        }

        throw new Error('Unknown error while connecting to WebUsb device.');
    }

    public async write(buffer: ArrayBuffer): Promise<void> {
        await this._device.transferOut(this._outEndpointNumber, buffer);
    }

    public async read(length: number): Promise<ArrayBuffer> {
        const result = await this._device.transferIn(this._inEndpointNumber, length);

        if (result.status === 'stall') {
            await this._device.clearHalt('in', this._inEndpointNumber);
        }

        const { buffer } = result.data!;
        return buffer;
    }

    public async dispose() {
        this._connected = false;
        this._usb.removeEventListener('disconnect', this.handleDisconnect);
        this.events.removeAllListeners();
        try {
            // Close currently can throw error in node. Ignore.
            await this._device.close();
        }
        catch (e: any) {
            // console.log(e.message);
        }
    }
}

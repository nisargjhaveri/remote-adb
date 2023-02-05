import type { RemoteAdbDevice } from './RemoteAdbDevice';

export interface ITcpDeviceManager {
    isSupported(): boolean;

    createDevice(serial: string): Promise<RemoteAdbDevice|undefined>;
    removeDevice(serial: string): Promise<void>;

    getDevices(): Promise<RemoteAdbDevice[]>;
    monitorDevices(callback: (devices: RemoteAdbDevice[]) => void): void;
}
import type { RemoteAdbDevice } from './RemoteAdbDevice';

export interface ITcpDeviceManager {
    isSupported(): boolean;
    getTcpDevice(serial: string): Promise<RemoteAdbDevice|undefined>;
}
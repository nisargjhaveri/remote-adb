import type { RemoteAdbDevice } from './RemoteAdbDevice';
import type { ITcpDeviceManager } from './ITcpDeviceManager';

class TcpDeviceManagerSingleton implements ITcpDeviceManager {
    isSupported(): boolean {
        return false;
    }

    createDevice(serial: string): Promise<RemoteAdbDevice> {
        throw new Error('Method not implemented.');
    }

    removeDevice(serial: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

    canRemoveDevice(serial: string): boolean {
        throw new Error('Method not implemented.');
    }

    getDevices(): Promise<RemoteAdbDevice[]> {
        throw new Error('Method not implemented.');
    }

    monitorDevices(callback: (devices: RemoteAdbDevice[]) => void): void {
        throw new Error('Method not implemented.');
    }
}

export const TcpDeviceManager: ITcpDeviceManager = new TcpDeviceManagerSingleton();
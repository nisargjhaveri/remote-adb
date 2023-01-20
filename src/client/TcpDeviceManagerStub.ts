import type { RemoteAdbDevice } from './RemoteAdbDevice';
import type { ITcpDeviceManager } from './ITcpDeviceManager';

class TcpDeviceManagerSingleton implements ITcpDeviceManager {
    isSupported(): boolean {
        return false;
    }

    getTcpDevice(serial: string): Promise<RemoteAdbDevice> {
        throw new Error('Method not implemented.');
    }
}

export const TcpDeviceManager: ITcpDeviceManager = new TcpDeviceManagerSingleton();
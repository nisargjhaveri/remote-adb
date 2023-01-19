import { AdbTcpTransport } from './AdbTcpTransport';
import { RemoteAdbDevice } from './RemoteAdbDevice';

class TcpDeviceManagerSingleton {
    async getTcpDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
        try {
            const url = new URL(`tcp://${serial}`);

            if (!url.hostname || !url.port || Number.isNaN(Number(url.port))
                || url.pathname || url.search || url.hash || url.username || url.password)
            {
                return;
            }

            return new RemoteAdbDevice(new AdbTcpTransport(url.hostname, Number(url.port)));
        }
        catch {
            return;
        }
    }
}

export const TcpDeviceManager = new TcpDeviceManagerSingleton();
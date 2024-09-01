import { useState, useEffect, useCallback } from 'react';
import { Separator } from '@fluentui/react/lib/Separator';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Link } from '@fluentui/react/lib/Link';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { NeutralColors } from '@fluentui/theme';
import { Device } from './device';

import { RemoteAdbDevice } from '../../client/RemoteAdbDevice';
import { UsbDeviceManager } from '../../client/UsbDeviceManager';
import { ServerConnection } from '../../client/ServerConnection';

import { initializeIcons } from '@fluentui/font-icons-mdl2';
import { Status } from './status';
initializeIcons();

const enum StoredItemKeys {
    SettingsAutoConnectDevices = "SettingsAutoConnectDevices"
}

const serverConnection = new ServerConnection(window.location.href);

export function App() {
    let [devices, setDevices] = useState<RemoteAdbDevice[]>([]);
    let [serverConnectionReady, setServerConnectionReady] = useState(false);
    let [autoConnect, setAutoConnect] = useState(() => localStorage?.getItem(StoredItemKeys.SettingsAutoConnectDevices) === "true");

    useEffect(() => {
        if (!UsbDeviceManager.isSupported()) {
            return;
        }

        UsbDeviceManager.monitorDevices(setDevices);
    }, []);

    const onAutoConnectToggle = useCallback((ev, checked) => {
        setAutoConnect(checked);
        localStorage?.setItem(StoredItemKeys.SettingsAutoConnectDevices, checked.toString());
    }, [setAutoConnect]);

    return UsbDeviceManager.isSupported() ? (
        <div style={{maxWidth: 650, margin: "0 auto"}}>
            {/* <Text variant="large">Welcome</Text> */}
            <Stack tokens={{padding: 'l2', childrenGap: 'l2'}}>
                <Stack.Item align="center">
                    <Text variant="mediumPlus" style={{color: NeutralColors.gray130}}>Share connected Android devices for debugging on the server</Text>
                </Stack.Item>
                <Status serverConnection={serverConnection} setServerConnectionReady={setServerConnectionReady} />
                <Separator>Connected Devices</Separator>
                <Stack horizontal tokens={{childrenGap: 'm', padding: 's'}} horizontalAlign="center" verticalAlign="center">
                    <Text>Device not visible in the list below?</Text>
                    <PrimaryButton text="Add device" id="request" onClick={UsbDeviceManager.requestDevice} iconProps={{iconName: "Add"}} />
                </Stack>
                <Stack.Item align="center">
                    <Toggle label="Auto-connect devices to remote when available" inlineLabel onChange={onAutoConnectToggle} checked={autoConnect} />
                </Stack.Item>
                {!devices.length && (
                    <Stack.Item align="center">
                        <Text style={{color: NeutralColors.gray90}}>No devices found</Text>
                    </Stack.Item>
                )}
                <Stack tokens={{childrenGap: 'l2', padding: 's'}}>
                    {devices.map((device) => (<Device device={device} key={device.serial} serverConnection={serverConnection} autoConnect={autoConnect} serverConnectionReady={serverConnectionReady} />))}
                </Stack>
            </Stack>
        </div>
    ) : (
        <div style={{maxWidth: 650, margin: "0 auto"}}>
            <Stack tokens={{padding: 'l2', childrenGap: 'l2'}}>
                <Stack.Item align="center">
                    <Text variant="large">Unsupported browser or configuration</Text>
                </Stack.Item>
                <Stack.Item align="center">
                    <Text>
                        Please make sure:
                        <ul>
                            <li>That you are using one of <Link href="https://caniuse.com/webusb">the browsers that support WebUSB API</Link>.
                                Microsoft Edge and Google Chrome are supported.</li>
                            { !window.isSecureContext && <li>That this page is opened securely with "https".
                                A <Link href="https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts">secure context</Link> is required for the <Link href="https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API">WebUSB API</Link> to work. </li> } 
                        </ul>
                    </Text>
                </Stack.Item>
            </Stack>
        </div>
    );
}
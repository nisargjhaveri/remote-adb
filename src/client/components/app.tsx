import { useState, useEffect } from 'react';
import { Separator } from '@fluentui/react/lib/Separator';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Link } from '@fluentui/react/lib/Link';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { NeutralColors } from '@fluentui/theme/lib/colors/FluentColors';
import { Device } from './device';

import { UsbDevice, monitorDevices, requestDevice, isSupported } from '../usbDevices';

import { initializeIcons } from '@fluentui/font-icons-mdl2';
initializeIcons();

export function App() {
    let [devices, setDevices] = useState<UsbDevice[]>([]);

    useEffect(() => {
        if (!isSupported()) {
            return;
        }

        monitorDevices(setDevices);
    }, []);

    return isSupported() ? (
        <div style={{maxWidth: 650, margin: "0 auto"}}>
            {/* <Text variant="large">Welcome</Text> */}
            <Stack tokens={{padding: 'l2', childrenGap: 'l2'}}>
                <Stack.Item align="center">
                    <Text variant="mediumPlus" style={{color: NeutralColors.gray130}}>Share connected Android devices for debugging on the server</Text>
                </Stack.Item>
                <Stack horizontal tokens={{childrenGap: 'm', padding: 's'}} horizontalAlign="center" verticalAlign="center">
                    <Text>Device not visible in the list below?</Text>
                    <PrimaryButton text="Add device" id="request" onClick={requestDevice} iconProps={{iconName: "Add"}} />
                </Stack>
                <Separator>Connected Devices</Separator>
                {!devices.length && (
                    <Stack.Item align="center">
                        <Text style={{color: NeutralColors.gray90}}>No devices found</Text>
                    </Stack.Item>
                )}
                <Stack tokens={{childrenGap: 'l2', padding: 's'}}>
                    {devices.map((device) => (<Device device={device} key={device.serial} />))}
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
                            <li>That you are using one of <Link href="https://caniuse.com/webusb">browsers that support WebUSB API</Link>.
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
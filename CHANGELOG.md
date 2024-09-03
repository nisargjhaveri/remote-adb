# CHANGELOG

## v3.0.1
- Minor improvement in error handling on connection

## v3.0.0
- Add option to auto-connect devices in the web interface
- Add cli option to specify host to bind
- Add handshake when connection starts, exchange local and remote device information.
- **Breaking changes (only for using as a library):**
  - Properly define subpath exports for the package for programmatic use
  - Change `Server` interface to be more flexible and extensible

## v2.3.0
- Allow listing and connecting to emulator with 'emulator-' serial in cli client
- More reliable websocket connection on some proxies using periodic ping
- Misc chores and fixes, build on node 20

## v2.2.0
- Expose Client interface as well for programmatic use
- Improvements in library interface, other fixes

## v2.1.0
- Add type information and make this package work as a library as well
- Expose Server interface for programmatic use

## v2.0.0
- Major changes and refactoring in the internal APIs to allow for more complex scenarios
- Add Node.js client using node-usb
- Add capability to share TCP device
- Allow specifying password authentication
- Other fixes and improvements

## v1.1.1
- Minor UI updates and reliability bug fixes

## v1.1.0
- Improved UI and better error reporting

## v1.0.1
- Update README with instructions to install via npm.

## v1.0.0
- Initial release
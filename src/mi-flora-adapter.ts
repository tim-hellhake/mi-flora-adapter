/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

import noble from '@abandonware/noble';

import { Adapter } from 'gateway-addon';

import { MiFlora } from './mi-flora-device';

export class MiFloraAdapter extends Adapter {
  constructor(addonManager: any, manifest: any) {
    super(addonManager, MiFloraAdapter.name, manifest.name);
    const pollInterval = manifest.moziot.config.pollInterval || 30;

    if (!manifest.moziot.config.pollInterval) {
      console.warn('Config does not contain a value for pollInterval');
    }

    console.log(`The pollInterval is ${pollInterval} minutes`);

    addonManager.addAdapter(this);
    const knownDevices: { [key: string]: MiFlora } = {};

    const addDevice = (address: string) => {
      const device = new MiFlora(this, manifest, address);
      knownDevices[address] = device;
      this.handleDeviceAdded(device);
      return device;
    };

    if (manifest.moziot.config.knownDevices) {
      for (const address in manifest.moziot.config.knownDevices) {
        console.log(`Recreating mi flora ${address} from knownDevices`);
        addDevice(address);
      }
    }

    const discoveredDevices: { [key: string]: boolean } = {};

    noble.on('stateChange', (state) => {
      console.log('Noble adapter is %s', state);

      if (state === 'poweredOn') {
        console.log('Start scanning for devices');
        noble.startScanning([], true);
      }
    });

    noble.on('discover', (peripheral) => {
      const address = peripheral.address;
      const name = peripheral.advertisement.localName;

      if (name == 'Flower care' || name == 'Flower mate') {
        if (!discoveredDevices[address]) {
          discoveredDevices[address] = true;
          console.log(`Detected new mi flora ${address}`);
          let knownDevice = knownDevices[address];

          if (!knownDevice) {
            console.log(`Adding mi flora ${address} to known devices`);
            knownDevice = addDevice(address);
          }

          knownDevice.startPolling(peripheral, pollInterval * 60 * 1000);
        }
      }
    });
  }
}

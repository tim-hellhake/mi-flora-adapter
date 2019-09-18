/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const noble = require('@abandonware/noble');

const {
  Database,
  Adapter,
  Device,
  Property
} = require('gateway-addon');

const DATA_SERVICE = '0000120400001000800000805f9b34fb';
const DATA_CHARACTERISTIC = '00001a0100001000800000805f9b34fb';
const FIRMWARE_CHARACTERISTIC = '00001a0200001000800000805f9b34fb';
const MODE_CHARACTERISTIC = '00001a0000001000800000805f9b34fb';
const MODE_SENSOR = Buffer.from([0xA0, 0x1F]);

class MiFlora extends Device {
  constructor(adapter, manifest, address) {
    super(adapter, `${MiFlora.name}-${address}`);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = ['TemperatureSensor', 'MultiLevelSensor'];
    this.name = this.id;
    this.description = 'Mi Flora';
    this.database = new Database(manifest.name);

    this.addProperty({
      type: 'integer',
      '@type': 'TemperatureProperty',
      unit: 'degree celsius',
      multipleOf: 0.1,
      title: 'temperature',
      description: 'The ambient temperature',
      readOnly: true
    });

    this.addProperty({
      type: 'integer',
      '@type': 'LevelProperty',
      unit: '%',
      title: 'moisture',
      description: 'The moisture of the soil',
      readOnly: true,
      minimum: 0,
      maximum: 100
    });

    this.addProperty({
      type: 'integer',
      '@type': 'LevelProperty',
      unit: '%',
      title: 'battery',
      description: 'The battery level',
      readOnly: true,
      minimum: 0,
      maximum: 100
    });

    const {
      knownDevices
    } = manifest.moziot.config;

    if (knownDevices && knownDevices[address]) {
      const {
        temperature,
        moisture
      } = knownDevices[address];

      // eslint-disable-next-line max-len
      console.log(`[${this.id}] Loading last known value ${temperature} for temperature`);
      // eslint-disable-next-line max-len
      console.log(`[${this.id}] Loading last known value ${moisture} for moisture`);
      this.updateValue('temperature', temperature || 0);
      this.updateValue('moisture', moisture || 0);
    }
  }

  addProperty(description) {
    const property = new Property(this, description.title, description);
    this.properties.set(description.title, property);
  }

  startPolling(peripheral, intervalMs) {
    this.timer = setInterval(async () => {
      try {
        await this.poll(peripheral);
      } catch (e) {
        console.error(`[${this.id}] Could not poll sensor: ${e}`);
      }
    }, intervalMs);

    this.poll(peripheral);
  }

  async poll(peripheral) {
    console.log(`[${this.id}] Connecting`);
    await this.connect(peripheral);
    console.log(`[${this.id}] Connected`);
    // eslint-disable-next-line max-len
    const [dataService] = await this.discoverServices(peripheral, [DATA_SERVICE]);
    console.log(`[${this.id}] Discovered services`);
    // eslint-disable-next-line max-len
    const [modeCharacteristic, dataCharacteristic, firmwareCharacteristic] = await this.discoverCharacteristics(dataService, [MODE_CHARACTERISTIC, DATA_CHARACTERISTIC, FIRMWARE_CHARACTERISTIC]);
    console.log(`[${this.id}] Discovered characteristics`);
    await this.write(modeCharacteristic, MODE_SENSOR);
    console.log(`[${this.id}] Enabled sensor mode`);
    const data = await this.read(dataCharacteristic);
    console.log(`[${this.id}] Read data characteristic`);
    const temperature = data.readUInt16LE(0) / 10;
    const moisture = data.readUInt8(7);
    this.updateValue('temperature', temperature);
    this.updateValue('moisture', moisture);

    if (firmwareCharacteristic) {
      const firmware = await this.read(firmwareCharacteristic);
      console.log(`[${this.id}] Read firmware characteristic`);
      const battery = firmware.readUInt8(0);
      this.updateValue('battery', battery);
    } else {
      console.log(`[${this.id}] No firmware characteristic found`);
    }

    this.disconnect(peripheral);

    console.log(`[${this.id}] Saving new values to config`);
    await this.database.open();
    const config = await this.database.loadConfig();
    const newConfig = {
      ...config,
      knownDevices: {
        [peripheral.address]: {
          temperature,
          moisture
        }
      }
    };
    await this.database.saveConfig(newConfig);
  }

  updateValue(name, value) {
    // eslint-disable-next-line max-len
    console.log(`[${this.id}] Update value for ${name} to ${value}`);
    const property = this.properties.get(name);
    property.setCachedValue(value);
    this.notifyPropertyChanged(property);
  }

  async connect(peripheral) {
    return new Promise((resolve, reject) => {
      peripheral.connect((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async discoverServices(peripheral, uuids) {
    return new Promise((resolve, reject) => {
      peripheral.discoverServices(uuids, (error, services) => {
        if (error) {
          reject(error);
        } else {
          resolve(services);
        }
      });
    });
  }

  async discoverCharacteristics(service, uuids) {
    return new Promise((resolve, reject) => {
      service.discoverCharacteristics(uuids, (error, characteristics) => {
        if (error) {
          reject(error);
        } else {
          resolve(characteristics);
        }
      });
    });
  }

  async read(characteristic) {
    return new Promise((resolve, reject) => {
      characteristic.read((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  async write(characteristic, value) {
    return new Promise((resolve, reject) => {
      characteristic.write(value, false, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(peripheral) {
    return new Promise((resolve, reject) => {
      peripheral.disconnect((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

class MiFloraAdapter extends Adapter {
  constructor(addonManager, manifest) {
    super(addonManager, MiFloraAdapter.name, manifest.name);
    const pollInterval = manifest.moziot.config.pollInterval || 30;

    if (!manifest.moziot.config.pollInterval) {
      console.warn('Config does not contain a value for pollInterval');
    }

    console.log(`The pollInterval is ${pollInterval} minutes`);

    addonManager.addAdapter(this);
    const knownDevices = {};

    const addDevice = (address) => {
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

    const discoveredDevices = {};

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

module.exports = MiFloraAdapter;

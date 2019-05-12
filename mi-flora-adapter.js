/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const noble = require('@abandonware/noble');

const {
  Adapter,
  Device,
  Property
} = require('gateway-addon');

const DATA_SERVICE = '0000120400001000800000805f9b34fb';
const DATA_CHARACTERISTIC = '00001a0100001000800000805f9b34fb';
const MODE_CHARACTERISTIC = '00001a0000001000800000805f9b34fb';
const MODE_SENSOR = Buffer.from([0xA0, 0x1F]);

class MiFlora extends Device {
  constructor(adapter, peripheral) {
    super(adapter, `${MiFlora.name}-${peripheral.address}`);
    this.peripheral = peripheral;
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = ['TemperatureSensor', 'MultiLevelSensor'];
    this.name = this.id;
    this.description = 'Mi Flora';

    this.addProperty({
      type: 'integer',
      '@type': 'TemperatureProperty',
      unit: 'degree celsius',
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
  }

  addProperty(description) {
    const property = new Property(this, description.title, description);
    this.properties.set(description.title, property);
  }

  startPolling(intervalMs) {
    this.timer = setInterval(() => {
      this.poll();
    }, intervalMs);
  }

  async poll() {
    console.log(`Connecting to ${this.id}`);
    await this.connect();
    console.log(`Connected to ${this.id}`);
    const [dataService] = await this.discoverServices([DATA_SERVICE]);
    console.log(`Discovered services`);
    // eslint-disable-next-line max-len
    const [modeCharacteristic, dataCharacteristic] = await this.discoverCharacteristics(dataService, [MODE_CHARACTERISTIC, DATA_CHARACTERISTIC]);
    console.log(`Discovered characteristics`);
    await this.write(modeCharacteristic, MODE_SENSOR);
    console.log(`Enabled sensor mode`);
    const data = await this.read(dataCharacteristic);
    this.disconnect();
    console.log(`Read data characteristic`);
    this.updateValue('temperature', data.readUInt16LE(0) / 10);
    this.updateValue('moisture', data.readUInt16BE(6));
  }

  updateValue(name, value) {
    const property = this.properties.get(name);
    property.setCachedValue(value);
    this.notifyPropertyChanged(property);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.peripheral.connect((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async discoverServices(uuids) {
    return new Promise((resolve, reject) => {
      this.peripheral.discoverServices(uuids, (error, services) => {
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

  async disconnect() {
    return new Promise((resolve, reject) => {
      this.peripheral.disconnect((error) => {
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

    noble.on('stateChange', (state) => {
      console.log('Noble adapter is %s', state);

      if (state === 'poweredOn') {
        console.log('Start scanning for devices');
        noble.startScanning([], true);
      }
    });

    noble.on('discover', (peripheral) => {
      const name = peripheral.advertisement.localName;

      if (name == 'Flower care' || name == 'Flower mate') {
        const knownDevice = knownDevices[peripheral.address];

        if (!knownDevice) {
          console.log(`Detected new mi flora ${peripheral.address}`);
          const device = new MiFlora(this, peripheral);
          knownDevices[peripheral.address] = device;
          this.handleDeviceAdded(device);
          device.startPolling(pollInterval * 60 * 1000);
        }
      }
    });
  }
}

module.exports = MiFloraAdapter;

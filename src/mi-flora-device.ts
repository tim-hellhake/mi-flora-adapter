/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

import { Peripheral, Service, Characteristic } from '@abandonware/noble';

import { MiFloraAdapter } from "./mi-flora-adapter";

import { Database, Device, Property } from 'gateway-addon';

const DATA_SERVICE = '0000120400001000800000805f9b34fb';
const DATA_CHARACTERISTIC = '00001a0100001000800000805f9b34fb';
const FIRMWARE_CHARACTERISTIC = '00001a02-0000-1000-8000-00805f9b34fb';
const MODE_CHARACTERISTIC = '00001a0000001000800000805f9b34fb';
const MODE_SENSOR = Buffer.from([0xA0, 0x1F]);

export class MiFlora extends Device {
  private database: Database;

  constructor(adapter: MiFloraAdapter, manifest: any, address: string) {
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

      this.updateValue('temperature', temperature || 0);
      this.updateValue('moisture', moisture || 0);
    }
  }

  addProperty(description: any) {
    const property = new Property(this, description.title, description);
    this.properties.set(description.title, property);
  }

  startPolling(peripheral: Peripheral, intervalMs: number) {
    setInterval(() => {
      this.poll(peripheral);
    }, intervalMs);
  }

  async poll(peripheral: Peripheral) {
    console.log(`Connecting to ${this.id}`);
    await this.connect(peripheral);
    console.log(`Connected to ${this.id}`);
    // eslint-disable-next-line max-len
    const [dataService] = await this.discoverServices(peripheral, [DATA_SERVICE]);
    console.log(`Discovered services`);
    // eslint-disable-next-line max-len
    const [modeCharacteristic, dataCharacteristic, firmwareCharacteristic] = await this.discoverCharacteristics(dataService, [MODE_CHARACTERISTIC, DATA_CHARACTERISTIC, FIRMWARE_CHARACTERISTIC]);
    console.log(`Discovered characteristics`);
    await this.write(modeCharacteristic, MODE_SENSOR);
    console.log(`Enabled sensor mode`);
    const data = await this.read(dataCharacteristic);
    console.log(`Read data characteristic`);
    const temperature = data.readUInt16LE(0) / 10;
    const moisture = data.readUInt8(7);
    this.updateValue('temperature', temperature);
    this.updateValue('moisture', moisture);

    if (firmwareCharacteristic) {
      const firmware = await this.read(firmwareCharacteristic);
      console.log(`Read firmware characteristic`);
      const battery = firmware.readUInt8(0);
      this.updateValue('battery', battery);
    } else {
      console.log('No firmware characteristic found');
    }

    this.disconnect(peripheral);

    console.log('Saving new values to config');
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

  updateValue(name: string, value: any) {
    const property = this.properties.get(name);

    if (property) {
      property.setCachedValue(value);
      this.notifyPropertyChanged(property);
    }
  }

  async connect(peripheral: Peripheral) {
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

  async discoverServices(peripheral: Peripheral, uuids: string[]) {
    return new Promise<Service[]>((resolve, reject) => {
      peripheral.discoverServices(uuids, (error, services) => {
        if (error) {
          reject(error);
        } else {
          resolve(services);
        }
      });
    });
  }

  async discoverCharacteristics(service: Service, uuids: string[]) {
    return new Promise<Characteristic[]>((resolve, reject) => {
      service.discoverCharacteristics(uuids, (error, characteristics) => {
        if (error) {
          reject(error);
        } else {
          resolve(characteristics);
        }
      });
    });
  }

  async read(characteristic: Characteristic) {
    return new Promise<Buffer>((resolve, reject) => {
      characteristic.read((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  async write(characteristic: Characteristic, value: any) {
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

  async disconnect(peripheral: Peripheral) {
    return new Promise((resolve) => {
      peripheral.disconnect(() => {
        resolve();
      });
    });
  }
}

# Mi Flora Adapter

[![Build Status](https://travis-ci.org/tim-hellhake/mi-flora-adapter.svg?branch=master)](https://travis-ci.org/tim-hellhake/mi-flora-adapter)
[![dependencies](https://david-dm.org/tim-hellhake/mi-flora-adapter.svg)](https://david-dm.org/tim-hellhake/mi-flora-adapter)
[![devDependencies](https://david-dm.org/tim-hellhake/mi-flora-adapter/dev-status.svg)](https://david-dm.org/tim-hellhake/mi-flora-adapter?type=dev)
[![optionalDependencies](https://david-dm.org/tim-hellhake/mi-flora-adapter/optional-status.svg)](https://david-dm.org/tim-hellhake/mi-flora-adapter?type=optional)
[![license](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)

Connect your mi-flora devices.

## Configuration
- `pollInterval` To reduce the impact on battery life the adapter does not keep a permanent connection to the device. Instead, it connects to the device, reads the data and disconnects. The `pollInterval` species how much time should be between two read requests. The default value is `30 Minutes`.

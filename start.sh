#!/bin/bash
set -e
cd artitalk01
rm -rf node_modules
npm install --production
node start.js

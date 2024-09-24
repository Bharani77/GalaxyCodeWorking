#!/bin/bash

# Function to kill a process by alias
pm2 stop test.js 
pm2 stop galaxy.js
pm2 delete test.js
pm2 delete galay.js
npx kill-port 8080
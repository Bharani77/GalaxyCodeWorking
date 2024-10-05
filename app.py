from flask import Flask, request, jsonify
import subprocess
import json
import os
import time
import signal
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

galaxy_process = None
test_process = None

def write_config(data):
    config = {
        "RC": data['rc'],
        "AttackTime": int(data['attackTime']),
        "DefenceTime": int(data['defenceTime']),
        "planetName": data['planetName'],
        "interval": int(data['intervalTime']),
        "rival": data['rival'].split(',')
    }
    with open('config.json', 'w') as f:
        json.dump(config, f)

def start_test_js():
    global test_process
    if not test_process or test_process.poll() is not None:
        test_process = subprocess.Popen(['node', 'test.js'])
    time.sleep(5)  # Give some time for the WebSocket server to start

@app.route('/start', methods=['POST'])
def start_galaxy():
    global galaxy_process
    data = request.json
    write_config(data)
    time.sleep(5)
    
    # Start test.js if it's not already running
    start_test_js()
    
    if not galaxy_process or galaxy_process.poll() is not None:
        # Start galaxy.js with arguments
        args = ['node', 'galaxy.js']
        for key, value in data.items():
            if key != 'rival':
                args.extend([f'--{key}', str(value)])
            else:
                args.extend([f'--{key}', value])
        
        galaxy_process = subprocess.Popen(args)
    
    return jsonify({"message": "Test.js and Galaxy.js started successfully"}), 200

@app.route('/update', methods=['POST'])
def update_galaxy():
    data = request.json
    write_config(data)
    return jsonify({"message": "Galaxy.js config updated successfully"}), 200

@app.route('/stop', methods=['POST'])
def stop_galaxy():
    global galaxy_process, test_process
    if galaxy_process:
        galaxy_process.terminate()
        galaxy_process.wait()
        galaxy_process = None
    if test_process:
        test_process.terminate()
        test_process.wait()
        test_process = None
    return jsonify({"message": "Galaxy.js and Test.js stopped successfully"}), 200

def cleanup():
    if galaxy_process:
        galaxy_process.terminate()
    if test_process:
        test_process.terminate()

if __name__ == '__main__':
    # Register cleanup function to be called on exit
    signal.signal(signal.SIGINT, lambda s, f: cleanup())
    
    # Start test.js when the Flask app starts
    start_test_js()
    
    app.run(host='0.0.0.0', port=5000)
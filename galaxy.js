const WebSocket = require('ws');
const fs = require('fs');
const { exec } = require('child_process');
let socket;
let isReconnecting = false;
let flag = 0;
let count = 0;
let tempTime1 = 0;

let config = {
    RC: '',
    AttackTime: 0,
    DefenceTime: 0,
    DefenceTime1: 0,
    planetName: '',
    interval: 0,
    rival: []
};

function loadConfig() {
    try {
        const data = fs.readFileSync('config.json', 'utf8');
        Object.assign(config, JSON.parse(data));
        config.DefenceTime1 = config.DefenceTime - 50;
        config.DefenceTime1 = config.DefenceTime;
        tempTime1 = config.AttackTime;
        console.log('Config updated:', config);
    } catch (err) {
        console.error('Error reading config file:', err);
    }
}

loadConfig();

fs.watch('config.json', (eventType) => {
    if (eventType === 'change') {
        console.log('Config file changed. Reloading...');
        loadConfig();
    }
});
function executeKillNodeScript() {
    return new Promise((resolve, reject) => {
        exec('bash killNode.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing killNode.sh: ${error}`);
                reject(error);
            } else {
                console.log(`killNode.sh output: ${stdout}`);
                resolve();
            }
        });
    });
}

async function handleError(error) {
    console.error("An error occurred:", error);
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    
    try {
        await executeKillNodeScript();
        console.log("killNode.sh executed successfully");
    } catch (killError) {
        console.error("Failed to execute killNode.sh:", killError);
    }
}

function setupWebSocket() {
    socket = new WebSocket('ws://localhost:8080');

    socket.onopen = async function() {
        console.log(isReconnecting ? "Reconnection successful" : "Connected to WebSocket server");
        if (!isReconnecting) {
            await initialConnection();
        }
        isReconnecting = false;
    };

    socket.onclose = function() {
        if (!isReconnecting) {
            console.log("WebSocket connection closed.");
            process.exit(1);
        }
    };

    socket.onerror = function(error) {
        console.error("WebSocket Error:", error);
        handleError(error);
    };
}

async function sendMessage(message) {
    if (socket.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket is not open. Current state: ${socket.readyState}`);
    }

    console.log("Sending message:", message);
    socket.send(JSON.stringify(message));

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for server response'));
        }, 10000);

        const messageHandler = (event) => {
            const response = JSON.parse(event.data);
            if (response.action !== message.action) return;

            clearTimeout(timeout);
            socket.removeEventListener('message', messageHandler);
            
            if (response.status === 'success') {
                resolve(response);
            } else {
                reject(new Error(response.message));
            }
        };

        socket.addEventListener('message', messageHandler);
    });
}

const actions = {
    click: (selector) => sendMessage({ action: 'click', selector }),
    xpath: (xpath) => sendMessage({ action: 'xpath', xpath }),
    enterRecoveryCode: (code) => sendMessage({ action: 'enterRecoveryCode', code }),
    sleep: (ms) => sendMessage({ action: 'sleep', ms }),
    scroll: (selector) => sendMessage({ action: 'scroll', selector }),
    pressShiftC: (selector) => sendMessage({ action: 'pressShiftC', selector }),
    waitForClickable: (selector) => sendMessage({ action: 'waitForClickable', selector }),
    reloadPage: async () => {
        isReconnecting = true;
        try {
            await sendMessage({ action: 'reloadPage' });
            console.log("Page reloaded and WebSocket reconnected");
        } catch (error) {
            console.error("Error during page reload:", error);
        } finally {
            isReconnecting = false;
        }
    },
    searchAndClick: async (rivals) => {
        if (!Array.isArray(rivals)) throw new Error('rivals must be an array');
        try {
            let response = await sendMessage({ action: 'searchAndClick', rivals });
            if (!response || !('flag' in response) || !('matchedRival' in response)) {
                throw new Error('Flag or matchedRival not found in response');
            }
            return response;
        } catch (error) {
            console.error('Error in searchAndClick:', error);
            throw error;
        }
    },
    doubleClick: (selector) => sendMessage({ action: 'doubleClick', selector }),
    performSequentialActions: (actions) => sendMessage({ action: 'performSequentialActions', actions })
};

async function executeRivalChecks(planetName) {
    try {
        await actions.xpath(`//span[contains(.,'${planetName}')]`);
        await actions.click('.-list > .mdc-list-item:nth-child(3) > .mdc-list-item__text');
        return true;
    } catch (error) {
        if (error.message === "No matching name found") {
            console.log("No matching name found");
            return false;
        }
        console.error("Error in executeRivalChecks:", error);
        throw error;
    }
}

async function imprison() {
    await actions.click(".planet__events");
    await actions.click(".planet__events");
    await actions.click(".planet__events");

    console.log("Double-clicked .planet__events");
    await actions.pressShiftC(".planet-bar__button__action > img");
    console.log("Shift+C pressed on element");
    await actions.performSequentialActions([
        { type: 'click', selector: ".dialog-item-menu__actions__item:last-child > .mdc-list-item__text" },
        { type: 'click', selector: '.dialog__close-button > img' },
        { type: 'xpath', xpath: "//a[contains(.,'Exit')]" }
    ]);
    console.log("All actions completed successfully");
    await actions.sleep(200);
    await actions.click('.start__user__nick');
}

async function mainLoop() {
    while (true) {
       try{
        await actions.waitForClickable('.planet-bar__button__action > img');
        let loopStartTime = Date.now();
        console.log(`New loop iteration started at: ${loopStartTime}`);
        await actions.sleep(100);
        //await actions.scroll('.mdc-drawer__content');
        await executeRivalChecks(config.planetName);
        //Here using fetch will pass the rival user id and check if rival present or not.
        await actions.sleep(100);
        let searchResult = await actions.searchAndClick(config.rival);
        let found = searchResult.matchedRival;
        
        if (searchResult.flag) {
            let rivalFoundTime = Date.now();
            let elapsedTime = rivalFoundTime - loopStartTime;
            console.log(`Time elapsed since loop start: ${elapsedTime}ms`);

            if (config.AttackTime < config.DefenceTime && flag !== 1) {
                config.AttackTime = tempTime1 + count;
                count += config.interval;
                config.AttackTime -= 50;
                console.log("count: " + count);
                console.log("Current Attack Time: " + config.AttackTime);
                
                let adjustedAttackTime = Math.max(0, config.AttackTime - elapsedTime);
                console.log(`Adjusted AttackTime: ${adjustedAttackTime}ms`);
                
                if (adjustedAttackTime > 0) {
                    await actions.sleep(adjustedAttackTime);
                }
                
                await executeRivalChecks(config.planetName);
                searchResult = await actions.searchAndClick([found]);
                if (searchResult.flag) {
                    console.log("Rival still present");
                    await actions.sleep(50);
                    await imprison();
                    config.AttackTime += 50;
                    flag = 0;
                } else {
                    console.log("No rival found");
                    flag = 1;
                    count = 0;
                }
            } else if (config.AttackTime < config.DefenceTime1 && flag === 1) {
                config.AttackTime = tempTime1 - 50 + count;
              //  config.AttackTime = tempTime1 + count;
                count += config.interval;
                config.AttackTime -= 50;
                
                let adjustedAttackTime = Math.max(0, config.AttackTime + elapsedTime);
                console.log(`Adjusted AttackTime: ${adjustedAttackTime}ms`);
                
                if (adjustedAttackTime > 0) {
                    await actions.sleep(adjustedAttackTime);
                }
                
                await executeRivalChecks(config.planetName);
                searchResult = await actions.searchAndClick([found]);
                if (searchResult.flag) {
                    console.log("Rival still present");
                    await actions.sleep(50);
                    await imprison();
                    config.AttackTime += 50;
                    flag = 0;
                } else {
                    console.log("No rival found");
                    flag = 1;
                    count = 0;
                }
            } else {
                console.log("Reset condition triggered");
                config.AttackTime = tempTime1;
                count = 0;
                flag = 0;
                
                let adjustedAttackTime = Math.max(0, config.AttackTime - elapsedTime);
                console.log(`Adjusted AttackTime: ${adjustedAttackTime}ms`);
                
                if (adjustedAttackTime > 0) {
                    await actions.sleep(adjustedAttackTime);
                }
                
                await executeRivalChecks(config.planetName);
                searchResult = await actions.searchAndClick([found]);
                if (searchResult.flag) {
                    console.log("Rival still present");
                    await imprison();
                } else {
                    console.log("No rival found");
                    flag = 1;
                    count = 0;
                }
            }
        } else {
            console.log("No rival found");
            flag = 1;
            count = 0;
        }

        console.log("Loop iteration complete. AttackTime:", config.AttackTime);
    }catch (error) {
        await handleError(error);
    }
}
}

async function initialConnection() {
    try {
        await actions.sleep(3000);
        await actions.waitForClickable('.mdc-button--black-secondary > .mdc-button__label');
        await actions.click('.mdc-button--black-secondary > .mdc-button__label');
        console.log("First button clicked");
        await actions.enterRecoveryCode(config.RC);
        console.log("Recovery code entered");
        await actions.click('.mdc-dialog__button:nth-child(2)');
        console.log("Second button clicked");
        await mainLoop();
    } catch (error) {
        await handleError(error);
    }
}

setupWebSocket();
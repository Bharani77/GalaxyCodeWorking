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
    
    // if (socket && socket.readyState === WebSocket.OPEN) {
    //     socket.close();
    // }
    
    try {
        await actions.reloadPage();
      //  await executeKillNodeScript();
      //  console.log("killNode.sh executed successfully");
    } catch (killError) {
        console.error("Failed to execute killNode.sh:", killError);
    }
}

function setupWebSocket() {
    try{
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
            handleError("Error");
            process.exit(1);
        }
    };

    socket.onerror = function(error) {
        console.error("WebSocket Error:", error);
        handleError(error);
    };
    }catch(error){
        handleError(error);
    }
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
    switchToFrame: async (frameIndex, selectorType, selector) => {
        try {
          let response = await sendMessage({ action: 'switchToFrame', frameIndex, selectorType, selector });
          console.log('Iframe src:', response);
          return response;
        } catch (error) {
          console.error('Error in switchToFrame:', error);
          throw error;
        }
      },
      switchToFramePlanet: async (frameIndex, selectorType, selector) => {
        try {
          let response = await sendMessage({ action: 'switchToFramePlanet', frameIndex, selectorType, selector });
          return response;
        } catch (error) {
          console.error('Error in switchToFramePlanet:', error);
          throw error;
        }
      },
      
      switchToDefaultFrame: async (selector) => {
        try {
          let response = await sendMessage({ action: 'switchToDefaultFrame', selector });
          return response;
        } catch (error) {
          console.error('Error in switchToDefaultFrame:', error);
          throw error;
        }
      },
    click: (selector) => sendMessage({ action: 'click', selector }),
    xpath: (xpath) => sendMessage({ action: 'xpath', xpath }),
    enterRecoveryCode: (code) => sendMessage({ action: 'enterRecoveryCode', code }),
    sleep: (ms) => sendMessage({ action: 'sleep', ms }),
    scroll: (selector) => sendMessage({ action: 'scroll', selector }),
    pressShiftC: (selector) => sendMessage({ action: 'pressShiftC', selector }),
    waitForClickable: (selector) => sendMessage({ action: 'waitForClickable', selector }),
    findAndClickByPartialText: async (text) => {
        try {
            let response = await sendMessage({ action: 'findAndClickByPartialText', text });
            if (!response || !('flag' in response)) {
                throw new Error('Flag not found in response');
            }
            return response;
        } catch (error) {
            console.error('Error in searchAndClick:', error);
            throw error;
        }
    },
    reloadPage: async () => {
        isReconnecting = true;
        try {
            await sendMessage({ action: 'reloadPage' });
            await waitForAllElements();
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
    enhancedSearchAndClick: (position) => sendMessage({ action: 'enhancedSearchAndClick', position }),
    doubleClick: (selector) => sendMessage({ action: 'doubleClick', selector }),
    performSequentialActions: (actions) => sendMessage({ action: 'performSequentialActions', actions })
};
async function checkIfInPrison(planetName) {
    try {
        console.log("Checking if in prison...");
        const result = await actions.findAndClickByPartialText(planetName);
        console.log("Prison check result:", result);
        if (!result.flag) {
            await actions.waitForClickable('.planet-bar__button__action > img');
            await actions.click('.mdc-button > .mdc-top-app-bar__title');
            console.log("Prison element found and clicked");
            return true;
        } else {
            console.log("Not in prison");
            return false;
        }
    } catch (error) {
        console.error("Error in checkIfInPrison:", error);
        return false;
    }
}

async function autoRelease() {
    try {
        await actions.xpath("//span[contains(.,'Planet Info')]");
        await actions.sleep(2000);
        await actions.switchToFrame(1,"css",".free__early__release:nth-child(2) .free__early__release__title");
        await actions.sleep(1000);
        await actions.switchToFrame(1,"css","#yes_btn > p");
        await actions.sleep(1000); 
        await actions.switchToDefaultFrame(".mdc-icon-button > img");
        await actions.sleep(1000);
        await actions.switchToFrame(1,"css",".s__gd__plank:nth-child(1) b");
        await actions.sleep(1000);
        await actions.switchToFramePlanet(2,"css","div.gc-action > a");

        console.log("Auto-release successful");
    } catch (error) {
        console.error("Error in autoRelease:", error);
        throw error;
    }
}

async function executeRivalChecks(planetName) {
    try {
        await actions.xpath(`//span[contains(.,'${planetName}')]`);
        await actions.xpath(`//span[contains(.,'Online now')]`);
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
    await actions.sleep(225);
   // await actions.reloadPage();
    //await actions.click('.dialog__close-button > img');
    await actions.click('.start__user__nick');
    

}



async function waitForElement(selector, maxAttempts = 5, interval = 50) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await actions.waitForClickable(selector);
            return true;
        } catch (error) {
            if (i === maxAttempts - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    return false;
}
async function mainLoop() {
    while (true) {
       try{
        await actions.waitForClickable('.planet-bar__button__action > img');
        let loopStartTime = Date.now();
        await actions.sleep(50);
        const isInPrison = await checkIfInPrison(config.planetName);
        if (isInPrison) {
            console.log("In prison. Executing auto-release...");
            await autoRelease();
           // await actions.reloadPage();
            await actions.waitForClickable('.planet-bar__button__action > img');
            loopStartTime = Date.now();
            continue; // Skip the rest of the loop and start over
        }
        console.log(`New loop iteration started at: ${loopStartTime}`);
        await actions.sleep(50);
        //await actions.scroll('.mdc-drawer__content');
        //await waitForElement(`//span[contains(.,'${config.planetName}')]`);
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
               // await actions.enhancedSearchAndClick(config.rival, 'second');
              //  await actions.click(".planet__events");
               // await actions.click(".planet__events");
              //  await actions.click(".planet__events");
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
                config.AttackTime = tempTime1 - count;
              //  config.AttackTime = tempTime1 + count;
                count += config.interval;
                config.AttackTime -= 50;
                
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
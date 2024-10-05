const WebSocket = require('ws');
const puppeteer = require('puppeteer');

const wss = new WebSocket.Server({ port: 8080 });

let browser;
let page;

async function setupBrowser() {
  console.log('Launching browser...');
  try {
    /*
      const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null
  });*/
     
      browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-accelerated-2d-canvas',
        '--disable-ipc-flooding-protection',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--start-maximized'
      ], 
    });
    page = await browser.newPage();
    console.log('New page created');

    const maxViewport = await page.evaluate(() => {
      return {
        width: window.screen.availWidth,
        height: window.screen.availHeight,
      };
    });
    await page.setViewport(maxViewport);

    // Enter full screen mode
    await page.evaluate(() => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    });

    const client = await page.target().createCDPSession();
    await Promise.all([
      client.send('Network.enable'),
      client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: 100 * 1024 * 1024 / 8,
        uploadThroughput: 100 * 1024 * 1024 / 8,
      }),
      client.send('Emulation.setCPUThrottlingRate', { rate: 1 }),
    ]);

   await page.setRequestInterception(true);
      page.on('request', (request) => {
      ['font', 'image', 'media'].includes(request.resourceType())
        ? request.abort()
        : request.continue();
    }); 
  
    await page.setCacheEnabled(true); 
    await page.goto('https://galaxy.mobstudio.ru/web', { waitUntil: 'networkidle0' });
    console.log('Navigated to galaxy.mobstudio.ru');
    const cssContent = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      let cssRules = [];
      styleSheets.forEach(sheet => {
        try {
          cssRules = cssRules.concat(Array.from(sheet.cssRules).map(rule => rule.cssText));
        } catch (e) {
          console.error('Error accessing stylesheet:', e);
        }
      });
      return cssRules.join('\n');
    });

    // Inject the essential CSS into the page
    await page.evaluate((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }, cssContent);
  } catch (error) {
    console.error('Error setting up browser:', error);
  }
}

setupBrowser();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

wss.on('connection', function connection(ws) {
  console.log('Client connected');

  ws.on('message', async function incoming(message) {
    console.log('Received:', message.toString());
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
      return;
    }

    const actions = {
      async switchToFrame() {
        const frames = await page.frames();
      
        if (data.frameIndex <= frames.length && data.frameIndex >= 0) {
          await page.evaluate((index, selType, sel) => {
            const iframe = document.querySelectorAll('iframe')[index];
            let contentElement;
            if (selType === 'xpath}') {
              contentElement = iframe.contentDocument.evaluate(sel, iframe.contentDocument, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            } else if (selType === 'css') {
              contentElement = iframe.contentDocument.querySelector(sel);
            }
      
            if (contentElement) {
              contentElement.click();
            } else {
              throw new Error('Element not found');
            }
          }, data.frameIndex, data.selectorType, data.selector);
          return { status: 'success', action: 'switchToFrame', message: data.frameIndex };
        }
      
        return { status: 'error', action: 'switchToFrame', message: 'Frame index out of range' };
      },
      async switchToFramePlanet() {
        await page.mainFrame();
        const frames = await page.frames();
        if (data.frameIndex <= frames.length && data.frameIndex >= 0) {
          await page.evaluate((index, selType, sel) => {
            const iframe = document.querySelectorAll('iframe')[index];
            let contentElement;
            if (selType === 'xpath}') {
              contentElement = iframe.contentDocument.evaluate(sel, iframe.contentDocument, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            } else if (selType === 'css') {
              contentElement = iframe.contentDocument.querySelector(sel);
            }
            if (contentElement) {
              contentElement.click();
              this.reloadPage();
            } else {
              throw new Error('Element not found');
            }
          }, data.frameIndex, data.selectorType, data.selector);
          return { status: 'success', action: 'switchToDefaultFrame', message: "Successfully clicked" };
        }
      },
      
      async switchToDefaultFrame() {
        const frames = await page.mainFrame();
          await page.evaluate(async (sel) => {
            const element = document.querySelector(sel);
            if (element) {
              element.click();
            }
            return { success: false, message: 'Element not found' };
          }, data.selector);
          return { status: 'success', action: 'switchToDefaultFrame', message: "Successfully clicked" };
        },
      async doubleClick() {
        try {
          await page.waitForSelector(data.selector, { timeout: 500 });
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              const event = new MouseEvent('dblclick', {
                'view': window,
                'bubbles': true,
                'cancelable': true
              });
              element.dispatchEvent(event);
            } else {
              throw new Error(`Element not found: ${selector}`);
            }
          }, data.selector);
          return { status: 'success', action: 'doubleClick', selector: data.selector };
        } catch (error) {
          throw new Error(`Error double-clicking element ${data.selector}: ${error.message}`);
        }
      },

      
      async click() {
        try {
          await page.waitForSelector(data.selector, { timeout: 500 });
          await page.click(data.selector);
          return { status: 'success', action: 'click', selector: data.selector };
        } catch (error) {
          throw new Error(`Error with element ${data.selector}: ${error.message}`);
        }
      },
      async enhancedSearchAndClick() {
        return await enhancedSearchAndClick(data.position);
      },
    
      async searchAndClick() {
        let rivals = data.rivals;
        if (!Array.isArray(rivals)) {
          throw new Error('rivals must be an array');
        }
    
        let result = await Promise.race([
          page.evaluate((selector, rivals) => {
            let elements = document.querySelectorAll(selector);
            for (let element of elements) {
              let matchedRival = rivals.find(rival => element.textContent.trim() === rival.trim());
              if (matchedRival) {
                element.click();
                return { found: true, rival: matchedRival };
              }
            }
            return { found: false };
          }, 'li', rivals),
          sleep(500).then(() => ({ found: false }))
        ]);
    
        if (!result.found) {
          await page.click('.dialog__close-button > img');
        }
    
        return {
          status: 'success',
          action: 'searchAndClick',
          message: result.found ? `Found and clicked exact matching element for rival: ${result.rival}` : 'No exact match found, clicked alternative button',
          flag: result.found,
          matchedRival: result.rival || "dummyvalue"
        };
      },

      async scroll() {
        const scrollPosition = 288452.8229064941406;
        await page.waitForSelector(data.selector, { timeout: 500 });
        await page.evaluate((sel, pos) => {
          const element = document.querySelector(sel);
          if (element) element.scrollTop = pos;
          else throw new Error(`Element not found: ${sel}`);
        }, data.selector, scrollPosition);
        return { status: 'success', action: 'scroll', selector: data.selector, position: scrollPosition };
      },

      async waitForClickable() {
        await page.waitForFunction(
          (sel) => {
            const element = document.querySelector(sel);
            if (!element) return false;
            const style = window.getComputedStyle(element);
            return element.offsetParent !== null &&
                  !element.disabled &&
                  style.visibility !== 'hidden' &&
                  style.display !== 'none' &&
                  style.opacity !== '0';
          },
          { timeout: 50000 },
          data.selector
        );
        return { status: 'success', action: 'waitForClickable', selector: data.selector };
      },

      async findAndClickByPartialText() {
        const xpathExpression = `//span[contains(text(), "${data.text}")]`;
        const clickResult = await page.evaluate((xpath) => {
            const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (element) {
                // element.click(); // Uncomment if you want to click the element
                return { success: true, message: 'Element found', flag: true };
            } else {
                return { success: false, message: 'Element not found', flag: false };
            }
        }, xpathExpression);
        
        return { 
            status: 'success', 
            action: 'findAndClickByPartialText', 
            selector: xpathExpression, 
            flag: clickResult.flag // Use clickResult.flag here
        };
    },    
      
      async xpath() {
        const clickResult = await page.evaluate((xpath) => {
          const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (element) {
            element.click();
            return { success: true, message: 'Element clicked successfully' };
          }
          return { success: false, message: 'Element not found' };
        }, data.xpath);

        if (!clickResult.success) {
          throw new Error(clickResult.message);
        }
        return { status: 'success', action: 'xpath', selector: data.xpath };
      },

      async sleep() {
        await sleep(data.ms);
        return { status: 'success', action: 'sleep', ms: data.ms };
      },

      async performSequentialActions() {
        console.log("Received actions to perform:", data.actions);
        if (!Array.isArray(data.actions)) {
          throw new Error("actions must be an array");
        }
    
        for (const action of data.actions) {
          console.log("Performing action:", action);
          switch (action.type) {
            case 'click':
              await page.waitForSelector(action.selector, { timeout: 500 });
              await page.click(action.selector);
              break;
            case 'xpath':
              const clickResult = await page.evaluate((xpath) => {
                const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (element) {
                  element.click();
                  return { success: true, message: 'Element clicked successfully' };
                }
                return { success: false, message: 'Element not found' };
              }, action.xpath);
              
              if (!clickResult.success) {
                throw new Error(`XPath element not found or couldn't be clicked: ${action.xpath}`);
              }
              break;
            default:
              throw new Error(`Unknown action type: ${action.type}`);
          }
        }
        return { status: 'success', action: 'performSequentialActions', message: 'All actions completed' };
      },

      async enterRecoveryCode() {
        await page.waitForSelector('input[name="recoveryCode"]', { timeout: 10000 });
        await page.evaluate((rc) => {
          document.querySelector('input[name="recoveryCode"]').value = rc;
        }, data.code);
        return { status: 'success', action: 'enterRecoveryCode', code: data.code };
      },

      async reloadPage() {
        await page.reload({ waitUntil: 'networkidle0' });
        return { status: 'success', action: 'reloadPage', message: 'Page reloaded successfully' };
      },

      async pressShiftC() {
        await page.waitForSelector(data.selector, { timeout: 500 });
        await page.focus(data.selector);
        await page.keyboard.down('Shift');
        await page.keyboard.press('C');
        await page.keyboard.up('Shift');
        return { status: 'success', action: 'pressShiftC', selector: data.selector };
      }
    };

    try {
      const result = await (actions[data.action] ? actions[data.action]() : Promise.reject(new Error(`Unknown action: ${data.action}`)));
      ws.send(JSON.stringify(result));
    } catch (error) {
      console.error(`Error in ${data.action}: ${error.message}`);
      ws.send(JSON.stringify({ status: 'error', action: data.action, message: error.message }));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

async function enhancedSearchAndClick(position) {
  try {
    await page.waitForSelector('li', { timeout: 500 });
    const result = await page.evaluate((position) => {
      let elements = document.querySelectorAll('li');
      
      if (elements.length === 0) {
        return { found: false };
      }

      let elementToClick;
      if (position === 'second' && elements.length >= 2) {
        elementToClick = elements[2];
      } else if (position === 'last') {
        elementToClick = elements[elements.length - 1];
      } else {
        return { found: false };
      }

      elementToClick.click();
      return { 
        found: true, 
        text: elementToClick.textContent.trim(),
        position: position
      };
    }, position);

    if (!result.found) {
      await page.click('.dialog__close-button > img');
    }

    return {
      status: 'success',
      action: 'enhancedSearchAndClick',
      message: result.found 
        ? `Clicked ${result.position} element with text: ${result.text}` 
        : `No ${position} element found, clicked alternative button`,
      flag: result.found,
      clickedText: result.text || "N/A",
      position: result.position
    };
  } catch (error) {
    throw new Error(`Error in enhancedSearchAndClick: ${error.message}`);
  }
}

console.log('WebSocket server started on port 8080');

process.on('SIGINT', async () => {
  if (browser) {
    console.log('Closing browser...');
    await browser.close();
  }
  process.exit();
});
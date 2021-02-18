/*|===================================================================|*/
/*|                        Program Information                        |*/
/*|===================================================================|*/
/*| Name: Auto MC Lookup                                              |*/
/*| Description: Node js application, meant to be partenred with HTML |*/
/*| UI, to search and filter potential clients.                       |*/
/*|===================================================================|*/
/*| Author: Jack Kelly                                                |*/
/*| Date: 11/8/2019                                                   |*/
/*| Version: v1.0.0                                                   |*/
/*|===================================================================|*/

/*|====================================================================|*/
/*|                             Changelog                              |*/
/*|====================================================================|*/
/*| Date: 1/20/2020 - Change: Changed timeout for awaiting selectors.  |*/
/*| Date: 1/20/2020 - Change: Added overview and changed error handler |*/
/*| for captcha. added up to 5 retries if HTML button is not present.  |*/
/*|====================================================================|*/
/*| Author: Jack Kelly                                                 |*/
/*| Date: 1/20/2020                                                    |*/
/*| Version: v1.0.1                                                    |*/
/*|====================================================================|*/


const electron = require('electron');
const { app, BrowserWindow, Menu, ipcRenderer, ipcMain } = electron;
const shell = electron.shell;
const path = require('path');
const url = require('url');
const fs = require('fs-extra');
// Modules to control the web scraping process.
const puppeteer = require('puppeteer');
const request = require('request-promise-native');
const poll = require('promise-poller').default;
const http = require('http');

const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));

const apiKey = '0ab0f6015e19120626afa0df8c20345f'; // API key of 2captcha account

var snapshotValid = false;
var fileName = "";
var html = "";
var saved = 0;
var overviewBody = "";
var snapshotTruckAmountArray = [];

const siteDetails = {
    sitekey: '6Ldbx1gUAAAAAMEylxZ_DoZS430WhNsmV47Y5t58',
    pageurl: 'https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist'
}
const chromeOptions = {
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    slowMo: 0,
    defaultViewport:null
};
const formData = {
    method: 'userrecaptcha',
    googlekey: siteDetails.sitekey,
    key: '0ab0f6015e19120626afa0df8c20345f',
    pageurl: siteDetails.pageurl,
    json: 1
};



// variables to hold CSS selectors for elements that will be referenced often
// these CSS selectors reference ONLY TABLE DATA ( <td> )
let htmlButtonSelector = 'body > font > table:nth-child(5) > tbody > tr:nth-child(2) > td:nth-child(8) > center > font > form > input[type=submit]:nth-child(3)';
let activePendingButtonSelector = 'body > font > center:nth-child(19) > a:nth-child(2)';
let activeStatusSelector = 'body > font > table:nth-child(8) > tbody > tr:nth-child(2) > td:nth-child(2)';
let insuranceOnFileSelector = 'body > font > table:nth-child(10) > tbody > tr:nth-child(2) > td:nth-child(3)';


async function initiateCaptchaRequest(apiKey) {
    const formData = {
        method: 'userrecaptcha',
        googlekey: siteDetails.sitekey,
        key: '0ab0f6015e19120626afa0df8c20345f',
        pageurl: siteDetails.pageurl,
        json: 1
    };
    const response = await request.post('http://2captcha.com/in.php', {
        form: formData
    });
    return JSON.parse(response).request;
}

async function requestCaptchaResults(apiKey, requestId) {
    const url = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`;
    return async function() {
        return new Promise(async function(resolve, reject) {
            const rawResponse = await request.get(url);
            const resp = JSON.parse(rawResponse);
            if (resp.status === 0) return reject(resp.request);
            resolve(resp.request);
        });
    }
}

async function pollForRequestResults(key, id, retries = 30, interval = 1700, delay = 60000) {
    await timeout(delay);
    return poll({
        taskFn: await requestCaptchaResults(key, id),
        interval,
        retries
    });
}

function getDate() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let fullDate = (month + "-" + date + "-" + year);
    return fullDate;
}

//set ENV
process.env.NODE_ENV = 'development';



// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;


// Listen for app to be ready
app.on('ready', function() {
    // Create new window
    mainWindow = new BrowserWindow({
      width: 750,
      height: 700
    });
    // Load html in window
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Quit app when closed
    mainWindow.on('closed', function() {
        app.quit();
    });

    // Build menu from template
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    // Insert menu
    Menu.setApplicationMenu(mainMenu);
});


function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
}

var filteredMcNumbers = [];
var overviewResults = [];





// Catch mcNumber:add
ipcMain.on('mcNumber:add', function(e, mcNumbers) {


    while (mcNumbers.indexOf(' ') > -1) {
        var spaceIndex = mcNumbers.indexOf(' ');
        var firstSpace = mcNumbers.substring(0, spaceIndex);
        var lastSpace = mcNumbers.substring((spaceIndex + 1));

        mcNumbers = (firstSpace + lastSpace);
    }


    var comma = mcNumbers.indexOf(',');
    var lastComma = mcNumbers.lastIndexOf(',');
    var filtered;
    var starter = 0;

    while (comma > -1) {
        comma = mcNumbers.indexOf(',');

        filterd = mcNumbers.substring(0, comma);
        filteredMcNumbers.push(filterd);
        var plusOne = (comma + 1);
        mcNumbers = mcNumbers.substring(plusOne);
        comma = mcNumbers.indexOf(',');
        lastComma = mcNumbers.lastIndexOf(',');
    }
    filteredMcNumbers.push(mcNumbers);
    console.log(filteredMcNumbers);
    findDetails();
});


async function findDetails() {

    for (var i = 0; i < filteredMcNumbers.length; i++) {

        // boolean values to track clients/webpages. Used to determine if client/page is valid/invalid ((all inilized at declarationt to avoid runtime errors))
        var htmlButton = false; // represents the PRESENCE of the view as HTML button on the first returned page.
        var activeStatusButton = false; // represents the PRESENCE of the ACTCIVE/STATUS button on the page.
        var activeStatus = false; // represents true/false if company is active or not.
        var insuranceOnFile = false; // represents if the company has ( > $0 ) of insurance on file.
        var activePendingButton = false; // represents the PRESENCE of an active/pending button on the page.
        var activePendingPageInfo = false; // represents if the active/pending data table was Successfully saved.
        var captchaNotReady = false; // error "CAPTCHA_NOT_READY"
        var captchaError = false; // any other captcha error except "CAPTCHA_NOT READY"

        console.log("\nBegining of main for loop.");
        console.log("\nProgress: " + (i+1) + "/" + (filteredMcNumbers.length) + "\n");

        var lengthTotal = filteredMcNumbers.length;
        mainWindow.webContents.send('progress:current', i, lengthTotal);

        var mcNumber = filteredMcNumbers[i];

        const browser = await puppeteer.launch(chromeOptions);


        const page = await browser.newPage();


        await page.goto(formData.pageurl);

        const requestId = await initiateCaptchaRequest(apiKey);



        // type mc number into 'Docket Number' search box
        await page.type('#docket_number[type=text]', mcNumber);


        console.log("\nCaptcha Requested. Waiting on reply from captcha solver.");


        try {
            var captchaResponse = await pollForRequestResults(apiKey, requestId);
        } catch (error) {
            var errorHandle = filteredMcNumbers.push(mcNumber);
            let notReadyError = "CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY,CAPCHA_NOT_READY";
            if (error == notReadyError) {
                console.log("\nCaptcha Not Ready Error = true.");
                captchaNotReady = true;
            }
            else {
              console.log("error getting captcha. " + error);
              captchaError = true;
            }
        }

        var infoTable = false;
        if (captchaNotReady == false && captchaError == false) {
            console.log("\nCaptcha answer recieved. Solving....");

            // Insert captcha answer into captcha answer box
            await page.evaluate(`document.getElementById("g-recaptcha-response").innerHTML="${captchaResponse}";`, {
                timeout: 10000
            });

            // Click 'submit' button
            await page.click('body > font > center:nth-child(17) > form > input[type=submit]:nth-child(4)', {
                timeout: 5000
            });

            // Checking for view details 'HTML' button; if present, it is clicked; if not, it is logged.


            try {
                await page.waitForSelector('#view_details', {
                    timeout: 3000
                });
                console.log("\nInfo table loaded!");
                infoTable = true;
            } catch (error) {
                console.log("\nProblem loading info table, retrying....");
            }


            if (!infoTable) {
                try {
                    await page.waitForSelector('#view_details', {
                        timeout: 6000
                    });
                    console.log("\nInfo table loaded!");
                    infoTable = true;
                } catch (error) {
                    console.log("\nInfo Table not present. Please try again.");
                    var errorHandle = filteredMcNumbers.push(mcNumber);
                }
            }

            try {
                await page.waitForSelector(htmlButtonSelector, {
                    timeout: 6000
                });
                console.log("\nHTML button DOES exist; redirecting to information page");
                htmlButton = true;
                await page.click(htmlButtonSelector);
            } catch (error) {
                console.log("\nHTML button does not exist.");
            }

            // forces program to run the next MC number if htmlButton is missing.
            if (htmlButton == true && infoTable == true) {
                try {
                    await page.waitForSelector(activeStatusSelector, {
                        timeout: 6000
                    });

                    console.log("\nactiveStatusSelector DOES exist; redirecting to information page");
                    activeStatusButton = true;
                } catch (error) {
                    console.log("\nactiveStatusSelector does not exist.");
                }

                try {
                    await page.waitForSelector('a[href^="pkg_carrquery.prc_activeinsurance?"]', {
                        timeout: 6000
                    });
                    console.log("\nActive/Pending Insurance button DOES exist;");
                    activePendingButton = true;
                } catch (error) {
                    console.log("\nActive/Pending Insurance button does not exist.");
                }
            }

            // selectors of indivdual <TD> infomation on carrier details page (Active status & amount of $ on file)
            let activeStatusTDSelector = 'body > font > table:nth-child(8) > tbody > tr:nth-child(2) > td:nth-child(2)';
            let insuranceOnFileTDSelector = 'body > font > table:nth-child(10) > tbody > tr:nth-child(2) > td:nth-child(3)';

            if (activePendingButton == true) {
                try {

                    const activeStatusData = await page.$$eval(activeStatusTDSelector, tds => tds.map((td) => {
                        return td.innerHTML;
                    }));

                    if (activeStatusData[0] != null){
                    var activePendingButtonSubStart = activeStatusData[0].indexOf("Helvetica") + 11; // + 11 to make up for restricted characters ( > & ")
                    var activePendingButtonSubEnd = activeStatusData[0].indexOf("</font>");
                    var activeStatusText = activeStatusData[0].substring(activePendingButtonSubStart, activePendingButtonSubEnd);
                  } else {
                    var activeStatusText = "NONE";
                  }
                    console.log(activeStatusText);

                    if (activeStatusText.indexOf("ACTIVE") > -1) {
                        activeStatus = true;
                    }

                } catch (error) {
                    console.log("error: " + error);
                }
            }

            if (activeStatus == true) {
                try {

                    const insuranceOnFileData = await page.$$eval(insuranceOnFileTDSelector, tds => tds.map((td) => {
                        return td.innerHTML;
                    }));

                    if ( insuranceOnFileData[0] != null ){
                    var insuranceOnFileSubStart = insuranceOnFileData[0].indexOf("$");
                    var insuranceOnFileSubEnd = insuranceOnFileData[0].indexOf("</font>");
                    var insuranceOnFileAmount = insuranceOnFileData[0].substring(insuranceOnFileSubStart, insuranceOnFileSubEnd);
                  }
                  else {
                    var insuranceOnFileAmount = "$0";
                  }

                    if (insuranceOnFileAmount != "$0") {
                        console.log(insuranceOnFileAmount);
                        insuranceOnFile = true;
                    } else {
                        console.log("$0 of insurance on file.");
                        insuranceOnFile = false;
                    }

                } catch (error) {
                    console.log("error: " + error);
                }
            }

            if (insuranceOnFile == true && activePendingButton == true) {

                var motorCarrierDetailsPageArray = await page.$$eval('body > font', tds => tds.map((td) => {
                    return td.outerHTML;
                }));


                let start = ((motorCarrierDetailsPageArray[0].indexOf("<h3 align=")) + 66);
                let end = ((motorCarrierDetailsPageArray[0].indexOf("Web Site Content and BOC-3 Information Clarification")) + 63); // add 63 to makeup for </a> and</font> to make html page complete.
                var motorCarrierDetailsPageHTML = motorCarrierDetailsPageArray[0].substring(start, end);


                await page.click(activePendingButtonSelector);

                var activePendingPageInfoTable = 'body > font > table:nth-child(6)';

                try {
                    await page.waitForSelector('#coverage_to > font', {
                        timeout: 6000
                    });
                    console.log("\nActive/Pending Page Info Table DOES exist!");
                    activePendingPageInfo = true;
                } catch (error) {
                    console.log("\nActive/Pending Page Info Table does NOT exist.");
                }

            }

            if (activePendingPageInfo == true) {

                var activePendingPageInfoTableArray = await page.$$eval(activePendingPageInfoTable, tds => tds.map((td) => {
                    return td.outerHTML;
                }));


                var activePendingPageInfoTableHTML = activePendingPageInfoTableArray[0];


                const page2 = await browser.newPage();

                await page2.goto("https://safer.fmcsa.dot.gov/CompanySnapshot.aspx");

                let mcMXnumberButton = 'body > form > p > table > tbody > tr:nth-child(2) > td:nth-child(3) > label';
                await page2.waitForSelector(mcMXnumberButton, {
                    timeout: 3000
                });
                await page2.click(mcMXnumberButton);

                await page2.type('input[name=query_string]', mcNumber);

                let snapshotSubmitButton = 'body > form > p > table > tbody > tr:nth-child(4) > td > input[type=SUBMIT]';

                await page2.click(snapshotSubmitButton);

                let snapshotTruckAmountSelector = 'body > p > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td > center:nth-child(3) > table > tbody > tr:nth-child(11) > td.queryfield';


                try {
                    await page2.waitForSelector(snapshotTruckAmountSelector, {
                        timeout: 3000
                    });
                    snapshotValid = true;
                } catch (error) {
                    console.log("No record of company snapshot.");
                    snapshotValid = false;
                }

                if (snapshotValid == true) {
                    snapshotTruckAmountArray.push(await page2.$$eval(snapshotTruckAmountSelector, tds => tds.map((td) => {
                        return td.outerHTML;
                    })));

                    var snapshotTruckAmount = "";


                    if (snapshotTruckAmountArray[0] == null) {
                        snapshotTruckAmount = "Error. Company is no longer active or has $0 of Insurance on File.";
                    } else {
                        snapshotTruckAmount = snapshotTruckAmountArray[0].toString();
                    }

                    if (snapshotTruckAmount != "Error. Company is no longer active or has $0 of Insurance on File." && activeStatus == true && insuranceOnFile == true) {
                        var body = ("<h3><center>Motor Carrier Details</center></h3>" + motorCarrierDetailsPageHTML + "<b><br><center><h3>Amount of trucks: " + snapshotTruckAmount + "</center></h3>" + activePendingPageInfoTableHTML + "<br><br><b><hr></b>");
                        overviewBody = overviewBody.concat(body);
                        fileName = ("C:\\AutoNumberLookupResults\\validResultsHTML\\(" + getDate() + ")\\MC-" + mcNumber + "-Results.html");
                        html = ("<html><head><title>MC-" + mcNumber + " Carrier Report</title></head><body>" + body + "</body></html>");
                        var overviewHTML = ("<html><head><title>Overview for " + filteredMcNumbers.length + " MCNumbers - " + getDate() + "</title></head><body><h1>Overview</h1><br>" + overviewBody + "</body></html>");
                        var overviewFileName = ("C:\\AutoNumberLookupResults\\validResultsHTML\\(" + getDate() + ")\\Overview.html");

                        fs.ensureFileSync(fileName);

                        fs.writeFile(fileName, html, 'utf8', (err) => {
                            if (err) throw err;
                            console.log("The file has been saved!");
                            saved++;
                        });

                        fs.ensureFileSync('C:\\AutoNumberLookupResults\\validResultsHTML\\(' + getDate() + ')\\Overview.html');

                        fs.writeFile(overviewFileName, overviewHTML, 'utf8', (err) => {
                            if (err) throw err;
                            console.log("The file has been saved!");
                        });
                        mainWindow.webContents.send('progress:saved', saved, (i+1) );
                    }

                }
            }
            browser.close();
        }
        else {
          browser.close();
        }
    }
}

function printResults() {
    shell.openExternal('C:\\AutoNumberLookupResults\\validResultsHTML\\(' + getDate() + ')\\Overview.html');
}

// Create menu template
const mainMenuTemplate = [
    // Each object is a dropdown
    {
        label: 'File',
        submenu: [{
                label: 'Print Results',
                click() {
                    printResults();
                }
            },
            {
                label: 'Quit',
                accelerator: process.platform == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
                click() {
                    app.quit();
                }
            }
        ]
    }
];

// If OSX, add empty object to menu
if (process.platform == 'darwin') {
    mainMenuTemplate.unshift({});
}

// Add developer tools option if in dev
if (process.env.NODE_ENV !== 'production') {
    mainMenuTemplate.push({
        label: 'Developer Tools',
        submenu: [{
                role: 'reload'
            },
            {
                label: 'Toggle DevTools',
                accelerator: process.platform == 'darwin' ? 'Command+I' : 'Ctrl+I',
                click(item, focusedWindow) {
                    focusedWindow.toggleDevTools();
                }
            }
        ]
    });
}

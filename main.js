const electron = require('electron');
const {
    app,
    BrowserWindow,
    Menu,
    ipcRenderer,
    ipcMain
} = electron;
const shell = electron.shell;
const path = require('path');
const url = require('url');
const fs = require('fs-extra');
// Modules to control the web scraping process.
const puppeteer = require('puppeteer');
const request = require('request-promise-native');
const poll = require('promise-poller').default;
const http = require('http');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;



const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));
const stateList = ["AL","AZ","CO","GA","ID","IL","IN","KY","MD","MO","MS","MT","ND","NM","TN","UT","VA","WI","WY"]; // list of states with acceptable data.

const siteDetails = {
    sitekey: '6Ldbx1gUAAAAAMEylxZ_DoZS430WhNsmV47Y5t58',
    pageurl: 'https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist'
}
const chromeOptions = {
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    slowMo: 0,
    defaultViewport: null
};

var dateOf = "";
var savedResults = 0;
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
      height: 650
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

// Catch mcNumber:add
ipcMain.on('begin:scrape', function(e) {
parseCompaies();
});

function hasNumber(myString) {
  return /\d/.test(myString);
}

  var csvData = [];
  var mcNumListData = [];

async function parseCompaies() {
    console.log("\nBegining of parseCompaies()");

    // Launch window and navigate to site.
    const browser = await puppeteer.launch(chromeOptions);
    const page = await browser.newPage();
    await page.goto(siteDetails.pageurl);

    await page.select("#menu", "FED_REG"); // select 'FMCSA Register' from dropdown menu.

    var goButtonSelector = 'body > font > table > tbody > tr > td > div > div > table > tbody > tr > td > form > input[type=image]:nth-child(4)'; // CSS selector for 'GO' button on menu.

    await page.click(goButtonSelector, {
        timeout: 5000
    }); // click 'go' button for top left menu.

    var viewCarrierButtonSelector = 'body > font > font > table > tbody > tr:nth-child(2) > td:nth-child(3) > form > input[type=submit]:nth-child(3)';

    // wait for the HTML table pages to show up before moving onto the next step.
    try {
        await page.waitForSelector(viewCarrierButtonSelector, {
            timeout: 3000
        });
        console.log("\nFMCSA Register Selection table loaded!");
    } catch (error) {
        console.log("\nProblem loading FMCSA Register Selection table, retrying....");
    }

    var currentDateSelector = 'body > font > font > table > tbody > tr:nth-child(2) > th > font';

    var dateReleased = await page.$$eval(currentDateSelector, tds => tds.map((td) => {
        return td.innerHTML;
    }));

    var resultsBody = ``;

    let dateR = dateReleased[0];

    while (dateR.indexOf("/") > -1){
     dateR = dateR.replace("/","-");
    }

    const csvWriter = createCsvWriter({
        path: "C:\\AutoCompanyIndex\\validResultsCSV\\(" +  dateR  + ") -Results.csv",
        header: [
            {id: 'mcNumber', title: 'MC-Number'},
            {id: 'company', title: 'Company'},
            {id: 'address', title: 'Address 1'},
            {id: 'city', title: 'City'},
            {id: 'state', title: 'State'},
            {id: 'zip', title: 'Zip'}
        ]
    });


    await page.click(viewCarrierButtonSelector, {
      timeout: 5000
    });
    console.log("\nViewing data for: " + dateReleased);

    var mainDataTableSelector = 'body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3)'; // CSS Selector for the table with the main company information.
    try {
        await page.waitForSelector(mainDataTableSelector, {
            timeout: 5000
        });
        console.log("\nMain Register table loaded!");
    } catch (error) {
        console.log("\nProblem loading Main Register Selection table, retrying....");
    }

    try {
        await page.waitForSelector('body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3) > tbody > tr:nth-child(663)', {
            timeout: 5000
        });
        console.log("\nthingy table loaded!");
    } catch (error) {
        console.log("\nProblem loading thingy table, retrying....");
    }


  var childElementCount = await page.evaluate(() => {
   return document.querySelector('body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3) > tbody').childElementCount;
});



  for (var i = 3; i < (childElementCount - 2); i++){
    var currentSelector = "body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3) > tbody > tr:nth-child(" + i.toString() + ")";



    var companyType = await page.$$eval(currentSelector, tds => tds.map((td) => {
  return td.outerHTML;
  }));

  console.log("\nTYPE: " + companyType);
  if (companyType[0].indexOf("Interstate common carrier (except household goods)") > -1){
    console.log("\nCORRECT TYPE");
    i += 3;
    currentSelector = "body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3) > tbody > tr:nth-child(" + i.toString() + ")";
    checkSelector = "body > font > font:nth-child(56) > font > font > span > span > p:nth-child(6) > table:nth-child(3) > tbody > tr:nth-child(" + i.toString() + ") > td:nth-child(3)";

    var xPathLine0 = "/html/body/font/font[3]/font/font/span/span/p[4]/table[1]/tbody/tr[" + i.toString() + "]/th";
    var xPathLine1 = "/html/body/font/font[3]/font/font/span/span/p[4]/table[1]/tbody/tr[" + i.toString() + "]/td[2]/text()";
    var xPathLine2 = "/html/body/font/font[3]/font/font/span/span/p[4]/table[1]/tbody/tr[" + i.toString() + "]/td[2]/div/text()";
    var xPathLine3 = "/html/body/font/font[3]/font/font/span/span/p[4]/table[1]/tbody/tr[" + i.toString() + "]/td[2]/div/div/text()";
    var xPathLine4 = "/html/body/font/font[3]/font/font/span/span/p[4]/table[1]/tbody/tr[" + i.toString() + "]/td[2]/div/div/div/text()";

      var companyInfo = await page.$$eval(currentSelector, tds => tds.map((td) => {
      return td.outerHTML;
      }));

      var companyInfoCheck = await page.$$eval(checkSelector, tds => tds.map((td) => {
      return td.outerHTML;
      }));

      // Save MC-Number
      const elHandle0 = await page.$x(xPathLine0);
      var xMCnum = await page.evaluate(el => el.textContent, elHandle0[0]);

      // Remove "MC-" from MC-Number so format allows for number-only data to be trasnferred to Auto Company Snapshot tool
      xMCnum = xMCnum.replace("MC-","");

      // Save Company Name
      const elHandle1 = await page.$x(xPathLine1);
      var xCompany = await page.evaluate(el => el.textContent, elHandle1[0]);

      // Save Entire Address Line 1
      const elHandle2 = await page.$x(xPathLine2);
      var xAddress = await page.evaluate(el => el.textContent, elHandle2[0]);

      // If they have a DBA name, ignore it and make sure to save address to correct variable
      if(!hasNumber(xAddress) || xAddress.indexOf("D/B/A") > -1){
        const elHandle2 = await page.$x(xPathLine3);
        var xAddress = await page.evaluate(el => el.textContent, elHandle2[0]);
        }

        // Escape characters
        while(xAddress.indexOf(" \'") > 0){
          xAddress = xAddress.replace(" \'", "\'");
        }
      
        // Save Address Line Two
      const elHandle3 = await page.$x(xPathLine3);
      var xCity = await page.evaluate(el => el.textContent, elHandle3[0]);
      
      if(xCity.indexOf(",") < 0){
        const elHandle3 = await page.$x(xPathLine4);
        var xCity = await page.evaluate(el => el.textContent, elHandle3[0]);
      }

      if(hasNumber(xCity)){
        var xZip = xCity.substring( (xCity.indexOf(",") + 5) );
        var xState = xCity.substring( (xCity.indexOf(",") + 2), (xCity.indexOf(",") + 4) );
        xCity = xCity.substring( 0, (xCity.indexOf(',')) );
      }
      
      console.log("\nXPATH MC: \'" + xMCnum + "\'");
      console.log("XPATH NAME: \'" + xCompany + "\'");
      console.log("XPATH ADDRESS: \'" + xAddress + "\'");
      console.log("XPATH CITY: \'" + xCity + "\'");
      console.log("XPATH STATE: \'" + xState + "\'");
      console.log("XPATH ZIP: \'" + xZip + "\'");


      let companyInfoObject = {
        mcNumber: xMCnum,
        company: xCompany,
        address: xAddress,
        city: xCity,
        state: xState,
        zip: xZip
      };

  if (stateList.indexOf(companyInfoObject.state) > -1){
    csvData.push(companyInfoObject);
    mcNumListData.push(companyInfoObject.mcNumber);
  }

        var isStateGood = false;
        stateList.forEach(element => {
        if ( companyInfoCheck[0].indexOf(", " + element) > -1 ){





          console.log("\nSTATE: " + element);
          console.log("INDEX: " + companyInfo[0].indexOf("<div>"));
          var numCheck = companyInfo[0].charAt(companyInfo[0].indexOf("<div>") + 5);
          if ( isNumber(numCheck)  ){
            companyInfo[0] = companyInfo[0].replace("<div>","</td><td>");
            companyInfo[0] = companyInfo[0].replace("</div>","");
          }
            else {
              companyInfo[0] = companyInfo[0].replace("<div>","ReplaceLater");
            }
          companyInfo[0] = companyInfo[0].replace("<div>","</td><td>");
          companyInfo[0] = companyInfo[0].replace("<div>","</td><td>");
          companyInfo[0] = companyInfo[0].replace("</div>","");
          companyInfo[0] = companyInfo[0].replace("</div>","");
          companyInfo[0] = companyInfo[0].replace("ReplaceLater","<div>");
          if(companyInfo[0].indexOf("<td>&nbsp;<div>&nbsp;<div>&nbsp;</div></div></td>") > -1){
            companyInfo[0] = companyInfo[0].replace("<td>&nbsp;<div>&nbsp;<div>&nbsp;</div></div></td>","");
          }
          while (companyInfo[0].indexOf("D/B/A") > -1){
            companyInfo[0] = companyInfo[0].replace("D/B/A","");
          }

          var startRemove = companyInfo[0].lastIndexOf("<td");
          var endRemove = companyInfo[0].indexOf("</tr>");
          var removeSection = companyInfo[0].substring(startRemove,endRemove);
          companyInfo[0] = companyInfo[0].replace(removeSection,"");


          resultsBody += companyInfo;
          savedResults++;
          console.log("\nresults updated");
        }
        });


    }

  }
  // Add commas to deliminate the MC numbers, and save them all to one string called 'mcNumListBody'. This will be our HTML body.
  var mcNumListBody = '';
  mcNumListData.forEach(element => {
    element = element.concat(",");
    mcNumListBody = mcNumListBody.concat(element);
    });

  var resultsHead = `<html>

  <head>
    <title>Results</title>
  </head>

  <body>
    <style>
      table a:link {
        color: #666;
        font-weight: bold;
        text-decoration: none;
      }

      table a:visited {
        color: #999999;
        font-weight: bold;
        text-decoration: none;
      }

      table a:active,
      table a:hover {
        color: #bd5a35;
        text-decoration: underline;
      }

      table {
        font-family: Arial, Helvetica, sans-serif;
        color: #666;
        font-size: 12px;
        text-shadow: 1px 1px 0px #fff;
        background: #eaebec;
        margin: 20px;
        border: #ccc 1px solid;

        -moz-border-radius: 3px;
        -webkit-border-radius: 3px;
        border-radius: 3px;

        -moz-box-shadow: 0 1px 2px #d1d1d1;
        -webkit-box-shadow: 0 1px 2px #d1d1d1;
        box-shadow: 0 1px 2px #d1d1d1;
      }

      table th {
        padding: 21px 25px 22px 25px;
        border-top: 1px solid #fafafa;
        border-bottom: 1px solid #e0e0e0;

        background: #ededed;
        background: -webkit-gradient(linear, left top, left bottom, from(#ededed), to(#ebebeb));
        background: -moz-linear-gradient(top, #ededed, #ebebeb);
      }

      table th:first-child {
        text-align: left;
        padding-left: 20px;
      }

      table tr:first-child th:first-child {
        -moz-border-radius-topleft: 3px;
        -webkit-border-top-left-radius: 3px;
        border-top-left-radius: 3px;
      }

      table tr:first-child th:last-child {
        -moz-border-radius-topright: 3px;
        -webkit-border-top-right-radius: 3px;
        border-top-right-radius: 3px;
      }

      table tr {
        text-align: center;
        padding-left: 20px;
      }

      table td:first-child {
        text-align: left;
        padding-left: 20px;
        border-left: 0;
      }

      table td {
        padding: 18px;
        border-top: 1px solid #ffffff;
        border-bottom: 1px solid #e0e0e0;
        border-left: 1px solid #e0e0e0;

        background: #fafafa;
        background: -webkit-gradient(linear, left top, left bottom, from(#fbfbfb), to(#fafafa));
        background: -moz-linear-gradient(top, #fbfbfb, #fafafa);
      }

      table tr.even td {
        background: #f6f6f6;
        background: -webkit-gradient(linear, left top, left bottom, from(#f8f8f8), to(#f6f6f6));
        background: -moz-linear-gradient(top, #f8f8f8, #f6f6f6);
      }

      table tr:last-child td {
        border-bottom: 0;
      }

      table tr:last-child td:first-child {
        -moz-border-radius-bottomleft: 3px;
        -webkit-border-bottom-left-radius: 3px;
        border-bottom-left-radius: 3px;
      }

      table tr:last-child td:last-child {
        -moz-border-radius-bottomright: 3px;
        -webkit-border-bottom-right-radius: 3px;
        border-bottom-right-radius: 3px;
      }

      table tr:hover td {
        background: #f2f2f2;
        background: -webkit-gradient(linear, left top, left bottom, from(#f2f2f2), to(#f0f0f0));
        background: -moz-linear-gradient(top, #f2f2f2, #f0f0f0);
      }
    </style>
    <table>
  <caption style="font-size: 20px">Date: ` + dateReleased + `<br>Results Saved: ` + savedResults + `</caption>
      <tr>
        <th align="center" scope="col" width="10%" nowrap="">&nbsp;MC Number</th>
        <th align="center" scope="col" width="10%" nowrap="">Date Filed</th>
        <th align="center" scope="col" width="35%">Company</th>
        <th align="center" scope="col" width="30%">Address Line 1</th>
        <th align="center" scope="col" width="35%">Address Line 2</th>
      </tr>
  `;
  var resultsFoot = `</table></body></html>`;

  // get date information
  while (dateReleased[0].indexOf("/") > -1){
    dateReleased[0] = dateReleased[0].replace("/","-")
  }
  dateOf = dateReleased[0];


      // create MC list HTML results code
      var mcHTML = '<html><head><title>MC-Number List</title></head><body>';
      mcHTML = mcHTML.concat(mcNumListBody);
      mcHTML = mcHTML.concat('</body></html>');

      // Write MC List Data to file system
      let fileNameMC = ("C:\\AutoCompanyIndex\\validResultsHTML\\(" +  dateReleased[0]  + ") -mcNumberList.html");
      fs.ensureFileSync(fileNameMC);
      fs.writeFile(fileNameMC, mcHTML, 'utf8', (err) => {
          if (err) throw err;
          console.log("The MC-Number List Results file has been saved!");
      });

      // create main table HTMl results code
    var html = resultsHead.concat(resultsBody);
    html = html.concat(resultsFoot);

    const fileName = ("C:\\AutoCompanyIndex\\validResultsHTML\\(" +  dateReleased[0]  + ") -Results.html");
      fs.ensureFileSync(fileName);
      fs.writeFile(fileName, html, 'utf8', (err) => {
          if (err) throw err;
          console.log("The HTML Results file has been saved!");
      });
      console.log("Saving CSV file...");
      csvWriter.writeRecords(csvData)       // returns a promise
        .then(() => {
            console.log('...Done! CSV File Saved!');
        });
      browser.close();
      mainWindow.webContents.send('complete:success',savedResults);
      ipcMain.on('show:results', function(e) {
        printResults();
      });
      ipcMain.on('results:mcList', function(e) {
        printResultsMC();
      });
}

function printResults() {
    shell.openExternal("C:\\AutoCompanyIndex\\validResultsHTML\\(" +  dateOf + ") -Results.html");
}

function printResultsMC() {
  shell.openExternal("C:\\AutoCompanyIndex\\validResultsHTML\\(" +  dateOf + ") -mcNumberList.html");
}

function isNumber(target){
  switch(target){
    case '0': target = 0; break;
    case '1': target = 1; break;
    case '2': target = 2; break;
    case '3': target = 3; break;
    case '4': target = 4; break;
    case '5': target = 5; break;
    case '6': target = 6; break;
    case '7': target = 7; break;
    case '8': target = 8; break;
    case '9': target = 9; break;
    default: return false;
  }
 for (var i=0; i < 10; i++){
   if (target == i ){
     return true;
   }
 }

  return false;
}

// Create menu template
const mainMenuTemplate = [
    // Each object is a dropdown
    {
        label: 'File',
        submenu: [{
                label: 'View Results',
                click() {
                    printResults();
                }
            },
            {
              label: 'View MC Numbers',
              click() {
                printResultsMC();
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

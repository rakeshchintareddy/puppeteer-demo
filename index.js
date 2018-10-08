const puppeteer = require('puppeteer');
const CREDS = require('./creds');
const SELECTORS = require('./selectors');
const mongoose = require('mongoose');
const User = require('./models/user');

async function run() {
    const browser = await puppeteer.launch({headless:false});
    const page = await browser.newPage();
    await page.goto('https://github.com');
    await login(page);
    const numberOfPages = 10; //await getNumPages(page);
    await users(page, numberOfPages);

    browser.close();
}

async function login(page) {
    await page.goto('https://github.com/login');
    await page.click(SELECTORS.userId);
    await page.keyboard.type(CREDS.username);
    await page.click(SELECTORS.password);
    await page.keyboard.type(CREDS.password);
    await page.click(SELECTORS.login_button);
    await page.waitForNavigation();
    await page.screenshot({
        path: 'screenshots/github-logic-success.png'
    });
}

async function users(page, numberOfPages) {
    console.log('numberOfPages', numberOfPages);
    for (let pageNumber = 1; pageNumber <= numberOfPages; pageNumber++) {
        const pageSelector = SELECTORS.searchUrl.replace('PAGE', pageNumber);
        await page.goto(pageSelector);
        await page.waitFor(1000);

        let listLength = await page.evaluate((sel) => {
            return document.getElementsByClassName(sel).length;
        }, SELECTORS.length_selector_class);

        for (let index = 1; index <= listLength; index++) {
            let usernameSelector = SELECTORS.username.replace('INDEX', index);
            let emailSelector = SELECTORS.email.replace('INDEX', index);

            let username = await page.evaluate((sel) => {
                return document.querySelector(sel).getAttribute('href').replace('/', '');
            }, usernameSelector);

            let email = await page.evaluate((sel) => {
                let element = document.querySelector(sel);
                return element ? element.innerHTML : null;
            }, emailSelector);

            // not all users have emails visible
            if (!email)
                continue;

            console.log(username, ' -> ', email);

            upsertUser({
                username: username,
                email: email,
                dateCrawled: new Date()
            });
        }
    }
}

async function getNumPages(page) {
    let inner = await page.evaluate((sel) => {
        let html = document.querySelector(sel);
        return html.replace(',', '').replace('users', '').trim();
    }, SELECTORS.numberOfUsers);

    console.log('Number of Users0: ', inner);
    
    let numUsers = parseInt(inner);

    console.log('Number of Users: ', numUsers);
    let numPages = Math.ceil(numUsers / 10);
    return numPages;
}

function upsertUser(userObj) {
    const DB_URL = 'mongodb+srv://user:password@cluster0-dklrt.mongodb.net/test?retryWrites=true';
    if (mongoose.connection.readyState == 0) {
        mongoose.connect(DB_URL);
    }
    // if this email exists, update the entry, don't insert
    let conditions = {
        email: userObj.email
    };
    let options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
    };

    User.findOneAndUpdate(conditions, userObj, options, (err, result) => {
        if (err) throw err;
    });
}

run();
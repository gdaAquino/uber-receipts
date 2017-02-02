/**
 * Sums app all Uber ride expenses by getting data from your Gmail
 *
 * How to use:
 * Create an app and enable Gmail Api https://developers.google.com/gmail/api/quickstart/js#prerequisites
 * Download `client_secret.json`
 * run `npm install`
 * run `node receipts.js`
 */
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var async = require('async');
var _ = require('underscore');
var crypto = require('crypto');
var gmail = google.gmail('v1');

// Query for searching uber messages from your gmail
var QUERY_UBER_MESSAGES = 'from:Uber Receipts';
// Pattern for getting the cost from the message snippet
var PATTERN_UBER_RIDE_COST = '[\\₱]\\d+.\\d+';
// Size for concurrent message request, speeds up the program
var CONCURRENT_MESSAGE_REQUEST_SIZE = 250;

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/uber-receipt-gmail-token.json
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'uber-receipt-gmail-token.json';
// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Gmail API.
    authorize(JSON.parse(content), computeUberExpenses);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

function computeUberExpenses(auth, messages) {
    async.waterfall([
            function(done) {
                _listAllMessages(auth, QUERY_UBER_MESSAGES, function(err, messages) {
                    return done(err, _.pluck(messages, 'id'));
                });
            },
            function(ids, done) {
                _getMessages(auth, ids, 'snippet', function(err, response) {
                    return done(err, _.pluck(response, 'snippet'));
                });
            },
            function(snippets, done) {
                var expenses = [];
                async.each(snippets, function(snippet, callback) {
                        var expense = {};
                        var match = snippet.match(PATTERN_UBER_RIDE_COST);
                        if (match) expense.amount = match[0].substring(1);
                        else expense.amount = "0.00";
                        expense.hash = crypto.createHash('md5').update(snippet).digest('hex');
                        expenses.push(expense);
                        return callback();
                    },
                    function(err) {
                        return done(err, expenses);
                    });
            },
            function(expenses, done) {
                var unique = _.uniq(expenses, false, function(expense) {
                    return expense.hash;
                });
                return done(null, unique);
            },
            function(expenses, done) {
                var total = _.reduce(expenses, function(memo, expense) {
                    return memo + parseFloat(expense.amount);
                }, 0);
                return done(null, total);
            }
        ],
        function(err, result) {
            log("Your Uber Expenses: " + result);
            console.log();
        });
}

function _listAllMessages(auth, query, done) {
    log("Searching for Messages with:" + query);
    var next = "";
    var messages = [];
    async.doWhilst(
        function(callback) {
            _listMessages(auth, query, next, function(err, response) {
                if (err) {
                    return callback(err);
                }
                log("Found Messages: " + messages.length + " ");
                next = response.nextPageToken;
                messages = _.union(messages, response.messages);
                return callback(err, messages);
            });
        },
        function() {
            return next;
        },
        function(err) {
            return done(err, messages);
        });
}

function _listMessages(auth, query, next, done) {
    var options = {
        q: query,
        auth: auth,
        userId: 'me',
        pageToken: next
    };
    gmail.users.messages.list(options, done);
}

function _getMessages(auth, ids, fields, done) {
    var progress = 0;
    var messages = [];
    var queue = async.queue(function(id, callback) {
        _getMessage(auth, id, fields, function(err, response) {
            progress++;
            log("Getting your Messages: " + progress + "/" + ids.length);
            if (err) return callback(err);
            messages.push(response);
            return callback();
        });
    }, CONCURRENT_MESSAGE_REQUEST_SIZE);
    queue.drain = function(err) {
        return done(err, messages);
    };
    _.each(ids, function(id) {
        queue.push(id);
    });
}

function _getMessage(auth, id, fields, done) {
    var options = {
        id: id,
        auth: auth,
        userId: 'me',
        fields: fields,
        format: 'full'
    };
    gmail.users.messages.get(options, done);
}

function log(message) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(message);
}
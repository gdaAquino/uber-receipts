// how to use:
// * Create an app and enable Gmail API https://developers.google.com/gmail/api/quickstart/js#prerequisites
// * Download the client_secret.json
// * run `npm install`
// * run `node receipts.js`
// * watch and enjoy

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var async = require('async');
var _ = require('underscore');
var crypto = require('crypto');
var gmail = google.gmail('v1');

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
    authorize(JSON.parse(content), _computeUberExpenses);
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
/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
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

function _computeUberExpenses(auth) {
    async.waterfall([
            function(done) {
                _searchAllMessages(auth, 'from:Uber Receipts', function(err, result) {
                    return done(err, result);
                });
            },
            function(messages, done) {
                var count = 0;
                var amount = 0.00;
                var identifiers = [];
                async.whilst(
                    function() {
                        return count < messages.length;
                    },
                    function(callback) {
                        _getMessage(auth, messages[count].id, function(err, result) {
                            if (err) {
                                return callback(err);
                            }
                            // may broke if uber email format changes
                            var price = "";
                            try {
                                price = result.snippet.match('[\₱]\\d+.\\d+')[0].substring(1);
                            } catch (e) {
                                // no prices found, ie receipt is from a promotion
                                price = "0";
                                console.log(e);
                                console.log(result.snippet);
                            }
                            // create an identifier for this due to receipts being sent multiple times
                            var hash = crypto.createHash('md5').update(result.snippet).digest("hex");
                            if (_.contains(identifiers, hash)) {
                                console.log("duplicate entry found: " + price);
                            } else {
                                identifiers.push(hash);
                                amount += parseInt(price);
                                console.log("+" + price);
                            }
                            count++;
                            return callback(err);
                        });
                    },
                    function(err) {
                        return done(err, amount);
                    });
            }
        ],
        function(err, result) {
            console.log(err);
            console.log("Total amount computed: " + result);
        });
}

/**
 * Search gmail messages base on query, and fetch all results.
 *
 * @param {google.auth.OAuth2} token
 * @param {object} the query object
 * @param {function} callback to call (err, messages)
 */
function _searchAllMessages(auth, query, done) {
    var next = "";
    var messages = [];
    async.doWhilst(
        function(callback) {
            _searchMessages(auth, query, next, function(err, result) {
                if (err) {
                    return callback(err, null);
                }
                console.log("Loaded page: " + next);
                console.log(result.messages);
                next = result.nextPageToken;
                messages = _.union(messages, result.messages);
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

/**
 * Search gmail messages base on query.
 *
 * @param {google.auth.OAuth2} token
 * @param {object} the query object
 * @param {object} pagination for gmail messages
 * @param {function} callback to call (err, messages)
 */
function _searchMessages(auth, query, next, done) {
    gmail.users.messages.list({
            auth: auth,
            userId: 'me',
            q: query,
            pageToken: next
        },
        done);
}

/**
 * Request the full details of the gmail message
 *
 * @param {google.auth.OAuth2} token
 * @param {object} the message id
 * @param {function} callback to call (err, message)
 */
function _getMessage(auth, id, done) {
    gmail.users.messages.get({
            auth: auth,
            userId: 'me',
            id: id,
            format: 'full'
        },
        done);
}
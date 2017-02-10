var fs = require('fs');
var async = require('async');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var TOKEN_PATH = 'client_token.json';
var SECRET_PATH = 'client_secret.json';
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/** Request access token from google **/
function authorize(done) {
    async.waterfall([
        function(callback) {
            _readFile(SECRET_PATH, function(err, result) {
                if (err) return callback(err);
                return callback(null, JSON.parse(result));
            });
        },
        function(secret, callback) {
            _readFile(TOKEN_PATH, function(err, result) {
                if (err) {
                    return callback(null, secret, null);
                }
                return callback(null, secret, JSON.parse(result));
            });
        },
        function(secret, token, callback) {
            var auth = new googleAuth();
            var client_id = secret.installed.client_id;
            var client_secret = secret.installed.client_secret;
            var redirect = secret.installed.redirect_uris[0];
            var oauth = new auth.OAuth2(client_id, client_secret, redirect);
            if (token) {
                oauth.credentials = token;
                return callback(null, oauth);
            }
            _requestToken(oauth, function(err, result) {
                if (err) return callback(err);
                oauth.credentials = result;
                _writeFile(TOKEN_PATH, JSON.stringify(result));
                return callback(null, oauth);
            })
        }
        ],
        function(err, result) {
            return done(err, result);
        });
}


function _requestToken(oauth, callback) {
    var url = oauth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url:', url);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(input) {
        rl.close();
        oauth.getToken(input, function(err, token) {
            return callback(err, token);
        });
    });
}

function _writeFile(path, data, callback) {
    fs.writeFile(path, data, callback);
}

function _readFile(path, callback) {
    fs.readFile(path, callback);
}

module.exports.authorize = authorize;
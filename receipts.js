/**
 * Sums app all Uber ride expenses by getting data from your Gmail
 *
 * How to use:
 * Create an app and enable Gmail Api https://developers.google.com/gmail/api/quickstart/js#prerequisites
 * Download `client_secret.json`
 * run `npm install`
 * run `node receipts.js` or `node receipts.js begin-date end-date` in yyyy/mm/dd format. eg 2017/01/25
 */
var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var google = require('googleapis');
var gmail = google.gmail('v1');
var authenticator = require('./GoogleAuthenticator.js');

var QUERY_UBER_MESSAGES = 'from:Uber Receipts';
var PATTERN_UBER_RIDE_COST = '[\\₱]\\d+.\\d+';
var CONCURRENT_MESSAGE_REQUEST_SIZE = 250;

authenticator.authorize(function(err, result) {
    if (err) {
        console.log(err);
        return;
    }
    computeUberExpenses(result);
})

function computeUberExpenses(auth) {
    async.waterfall([
            function(done) {
                if (process.argv.length == 4) {
                    QUERY_UBER_MESSAGES += " date-begin:" + process.argv[2] + " date-end:" + process.argv[3];
                }
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
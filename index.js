// chatbot/index.js
// App entry point; everything starts here

// We require a few packages
// Express lets us define boilerplate server logic more easily
var express = require('express')
// But we can"t just include it--we need our app variable to be an Express instance
var app = express()
// Malicious user input protection
var sanitizer = require('express-sanitizer')
// We need `body-parser` to parse the content of POST requests
var bodyParser = require('body-parser')

// Helper functions
var helpers = require('./helpers')
// Twilio
var twilio = require('./twilio')
// Cronjobs
var cron = require('./cron')
// Dialogflow helpers
var dialogflowHelpers = require('./dialogflowHelpers')
// multiple text handling
var mongoose = require('mongoose')
mongoose.Promise = global.Promise
// Models
var User = require('./models/user')
var Message = require('./models/message')
var Job = require('./models/job')
// General config variables
var config = require('./config')

// Connect mongoose to mongo
mongoose.connect(config.mongoUrl, { server: { reconnectTries: Number.MAX_VALUE } })
mongoose.connection
    .once('open', function () {
        console.log('Mongoose successfully connected to Mongo')
    })
    .on('error', function (error) {
        console.error('Mongoose/ Mongo connection error:', error)
    })

// Enable body-parser and express-sanitizer packages on our app
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(sanitizer())

// Pesky header handling middleware to ensure our requests go through
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST')
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Credentials'
    )
    res.header('Access-Control-Allow-Credentials', 'true')
    next()
})

// Initialize our cronjobs
cron.constantJob

// Twilio webhook endpoint
app.post('/sms', function (req, res) {
    console.log('Hitting Twilio hook')
    // Save the Twilio request body to the Messages collection
    Message.logBlob('Twilio', req.body)
    // Extract phone number and user message
    var userPhoneNumber = req.body.From
    var userMessage = req.body.Body
    var sessionId = userPhoneNumber.substring(1)
    User.findOne({ phone: userPhoneNumber })
        .then(function (user) {
            twilio.processUserSMS(user, userPhoneNumber, userMessage)
        })
    res.send('Success')
})

// Dialogflow webhook endpoint
app.post('/hook', function (req, res) {
    console.log('Hitting Dialogflow /hook')
    var blob = helpers.chunkTheBlob(req.body)
    // Save the Dialogflow request body to the Messages collection
    Message.logBlob('Dialogflow', blob.formattedBlob)
    var cleanContexts = dialogflowHelpers.buildCleanContexts(blob.contexts)
    var sendBotResponse = true

    User.findOne({ phone: blob.phone })
        .then(function (user) {
            // Prevent 10-minute context expiration
            helpers.updateUserContexts(user, cleanContexts)
                .then(function (user) {
                    var noEmptyParameters = dialogflowHelpers.handleEmptyParameters(blob.parameters, blob.intent, user.contexts, user)
                    if (noEmptyParameters) {
                        console.log('No empty parameters. Moving on to handling delimiters')
                        dialogflowHelpers.handleRequests(blob.parameters, blob.contexts, user)
                    } else {
                        console.log('Found empty parameters. Skipping SMS till we fill them')
                        sendBotResponse = false
                    }
                    if (sendBotResponse) {
                        twilio.sendSMS(blob.phone, blob.dialogflowMessages)
                    }
                })
        })
        .catch(function (reason) {
            console.log('Promise rejected finding user with phone: ' + blob.phone)
            console.error(reason)
        })

    res.send('Success')
})

// Start listening for events on our port
app.listen(config.port, function (req, res) {
    console.log('Port ' + config.port + ': "Whirrr..."')
})

// chatbot/twilio.js
// Twilio API handler

// Error handling
var helpers = require('./helpers')
// Blob construction
var dialogflow = require('./dialogflow')
var cron = require('./cron')
var config = require('./config')
var moment = require('moment-timezone')
var schedule = require('node-schedule')
// Models
var User = require('./models/user')
var Message = require('./models/message')
// Chatbot's phone number
var chatbotNumber = process.env.CHATBOT_NUMBER
// Initialize the Twilio client object with our Twilio credentials
var twilioClient = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
)

// Send messageContent to userNumber from chatbotNumber
function sendSMS (userNumber, dialogflowMessages) {
    var sessionId = userNumber.substring(1)
    var messageContent
    if (dialogflowMessages.length > 0) {
        messageContent = dialogflowMessages.shift().speech
        if (messageContent) {
            var messageBlob = {
                to: userNumber,
                from: chatbotNumber,
                body: messageContent
            }
            console.log(messageBlob)
            sendText(messageBlob)
                .then(function (sentMessage) {
                    console.log(
                        'Calling sendSMS again, with ' +
                        dialogflowMessages.length +
                        ' more messages'
                    )
                    setTimeout(sendSMS, config.messageDelay, userNumber, dialogflowMessages)
                })
                .catch(function (reason) {
                    console.log('Promise rejected while sending text from Chatbot')
                    console.log(reason)
                    console.error(reason)
                })
        } else {
            console.log('No messageContent!')
        }
    } else {
        console.log('No more dialogflowMessages')
    }
}

function sendText (messageBlob) {
    return new Promise(function (resolve, reject) {
        twilioClient.messages.create(messageBlob)
            .then(function (sentMessage) {
                console.log(
                    'Successfully sent Twilio message\nFrom: ' +
                    sentMessage.from +
                    '\nTo: ' +
                    sentMessage.to +
                    '\nBody: ' +
                    sentMessage.body
                )
                var loggedMessage = {
                    From: sentMessage.from,
                    To: sentMessage.to,
                    NumMedia: sentMessage.numMedia,
                    NumSegments: sentMessage.numSegments,
                    MessageSid: sentMessage.sid,
                    Body: sentMessage.body
                }
                Message.logBlob('Twilio', loggedMessage)
                resolve(sentMessage)
            })
            .catch(function (reason) {
                console.log('Failed to sendText')
                console.log(reason)
                reject(reason)
            })
    })
}

function processUserSMS (user, phone, message) {
    var requestBlob = {}
    var contexts = []
    // If the user isn't in the database
    return new Promise(function (resolve, reject) {
        if (user === null) {
            console.log("It's a new user")
            // Create a new user
            User.create({ phone: phone }, function (err, user) {
                helpers.logError(err, 'creating new user in processUserSMS')
                console.log('Created new user')
                console.log(user)
                slack.findGroup('signups')
                    .then(function (groupId) {
                        slack.client.chat.postMessage(groupId,
                            '*New user signup!*\nPhone: ' + user.phone
                        )
                    })
                    .catch(function (reason) {
                        console.log('Promise rejected finding channel #signups')
                        console.log(reason)
                    })
                requestBlob = dialogflow.buildEventBlob('newUser', user, [])
                dialogflow.post(requestBlob)
                resolve(user)
            })
        } else if (user.stopped) {
            requestBlob = dialogflow.buildEventBlob('stop-handler', user, [])
            dialogflow.post(requestBlob)
            resolve(user)
        } else {
            // Process request normally
            console.log("It's an existing user")
            // Make sure Chatbot is unpaused for this user
            User.findOneAndUpdate(
                {
                    _id: user._id
                },
                {
                    $set: { isPausingChatbot: false }
                }
            ).then(function (result) {
                requestBlob = dialogflow.buildQueryBlob(message, user)
                dialogflow.post(requestBlob)
                resolve(result)
            })
        }
    })
}

// Expose Chatbot's phone number and the ability to send SMS to users
module.exports = {
    sendSMS: sendSMS,
    chatbotNumber: chatbotNumber,
    processUserSMS: processUserSMS
}

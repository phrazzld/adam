// chatbot/dialogflow.js
// Dialogflow API handling

// The request library lets us build requests to external web services
var request = require('request')
// Our helpers module defines an error handling pattern we use all over
var helpers = require('./helpers')

// API.AI variables
var botBaseUrl = 'https://api.dialogflow.com/v1/query?v=20150910&lang=en&'
var accessToken = process.env.CLIENT_ACCESS_TOKEN

// Build a GET request to API.AI with a URL string
function getRequest (url) {
  request.get(url, {
    auth: { bearer: accessToken }
  })
}
// Build a POST request to API.AI with a JSON blob
function postRequest (data) {
  var stringified = JSON.stringify(data)
  var opts = {
    url: 'https://api.dialogflow.com/v1/query?v=20150910',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: stringified
  }
  request.post(opts, function (err, response, body) {
    helpers.logError(err, 'in postRequest')
  })
}

// Build and return a requestBlob for event requests
function buildEventBlob (eventName, user, contexts) {
  var blob = {
    event: {
      name: eventName,
      data: user
    },
    contexts: contexts,
    lang: 'en',
    timezone: user.timezone,
    sessionId: helpers.sessionId(user)
  }
  return blob
}

// Build and return a requestBlob for query requests
function buildQueryBlob (query, user) {
  return {
    query: [query],
    contexts: user.contexts,
    timezone: user.timezone,
    lang: 'en',
    sessionId: helpers.sessionId(user)
  }
}

// Expose core API.AI functionality to the rest of the application
module.exports = {
  baseUrl: botBaseUrl,
  get: getRequest,
  post: postRequest,
  buildEventBlob: buildEventBlob,
  buildQueryBlob: buildQueryBlob
}

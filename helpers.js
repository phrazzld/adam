// adam/helpers.js

var User = require('./models/user')

// Update user contexts
function updateUserContexts (user, contexts) {
  return new Promise(function (resolve, reject) {
    User.findOneAndUpdate(
      { _id: user._id },
      { $set: { contexts: contexts } },
      { new: true }
    )
      .then(function (user) {
        console.log('Finished saving contexts to user')
        console.log(user)
        resolve(user)
      })
      .catch(function (reason) {
        console.log('Promise rejected when saving contexts to user')
        console.error(reason)
        reject(reason)
      })
  })
}

// Chunk API.AI request blob into more manageable pieces
function chunkTheBlob (blob) {
  var chunked = {
    formattedBlob: formatKeys(blob),
    result: blob.result,
    contexts: blob.result.contexts,
    dialogflowMessages: blob.result.fulfillment.messages,
    intent: blob.result.metadata.intentName,
    parameters: blob.result.parameters,
    query: blob.result.resolvedQuery,
    sessionId: blob.sessionId,
    phone: '+' + blob.sessionId
  }
  return chunked
}

// Replace dots with hyphens to save API.AI blobs to Messages
function formatKeys (obj) {
  return Object.keys(obj).reduce(function (o, prop) {
    var value = obj[prop]
    var formattedValue
    if (Array.isArray(value)) {
      // Assign each element of value to formatKeys(elem)
      formattedValue = value.map(function (x) {
        return formatKeys(x)
      })
    } else if (typeof value === 'object') {
      formattedValue = formatKeys(value)
    }
    var newProp = prop.replace('.', '-')
    o[newProp] = formattedValue || value
    return o
  }, {})
}

// Common error handling pattern
function logError (err, source) {
  if (err) {
    console.log('Error (' + source + ')')
    console.error(err)
  }
}

// Get user's sessionId
function sessionId (user) {
  return user.phone.substring(1)
}

// Expose our error handling function to the rest of our app
module.exports = {
  formatKeys: formatKeys,
  logError: logError,
  sessionId: sessionId,
  updateUserContexts: updateUserContexts,
  chunkTheBlob: chunkTheBlob
}

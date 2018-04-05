// chatbot/database.js
// Access and manage MongoDB

// Base object for Mongo functionality
var MongoClient = require("mongodb").MongoClient
var config = require("./config")

// Open database connection once, reuse everywhere
var conn = MongoClient.connect(config.mongoUrl)

// Take an array of collection names as input, and create them
var createCollections = function (collections) {
  conn.then(function (db) {
    collections.forEach(function (collection) {
      db.createCollection(collection, function (err, res) {
        helpers.logAndThrowError(err)
        console.log("Created " + collection + " collection")
      })
    })
  })
}

// Insert a new document into the Messages collection
var createMessage = function (source, blob) {
  conn.then(function (db) {
    db.collection("Messages").insertOne({
      "source": source,
      "blob": blob
    })
  })
}

// Insert a new document into the Users collection
var createUser = function (phone, timezone) {
  conn.then(function (db) {
    db.collection("Users").insertOne({
      "phone": phone,
      "timezone": timezone
    })
  })
}

// Insert a new document into the Jobs collection
var createJob = function (activationTime, requestBlob) {
  conn.then(function (db) {
    db.collection("Jobs").insertOne({
      "activationTime": activationTime,
      "requestBlob": requestBlob
    })
  })
}

// Delete a job
var deleteJob = function (id) {
  conn.then(function (db) {
    db.collection("Jobs").deleteOne({ "_id": id })
  })
}

// Expose Mongo connnection and functions to the rest of the app
module.exports = {
    conn: conn,
    createCollections: createCollections,
    createMessage: createMessage,
    createUser: createUser,
    createJob: createJob,
    deleteJob: deleteJob
}

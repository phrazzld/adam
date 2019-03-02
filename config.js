// adam/config.js
// General app config variables

module.exports = {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/adam',
    port: process.env.PORT || 8080,
    messageDelay: 3000, // ms
    waitDelay: 10000 // ms
}

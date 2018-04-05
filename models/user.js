var mongoose = require('mongoose')
var Schema = mongoose.Schema

var UserSchema = new Schema(
  {
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      required: true
    },
    responseQueue: {
      type: Array,
      required: true,
      default: ['']
    },
    timezone: {
      type: String,
      required: true,
      default: 'America/Los_Angeles'
    },
    timezonePretty: {
      type: String,
      default: 'Pacific Time'
    },
    isPausingChatbot: {
      type: Boolean,
      required: true,
      default: false
    },
    stopped: {
      type: Boolean,
      required: true,
      default: false
    },
    contexts: {
      type: Array,
      default: new Array()
    }
  },
  {
    timestamps: true
  }
)

var User = mongoose.model('User', UserSchema)
module.exports = User

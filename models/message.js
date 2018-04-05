var mongoose = require('mongoose')
var Schema = mongoose.Schema

var MessageSchema = new Schema(
  {
    source: {
      type: String,
      enum: ['Dialogflow', 'Twilio'],
      required: true
    },
    blob: {
      type: Object,
      required: true
    }
  },
  {
    timestamps: true
  }
)

MessageSchema.statics.logBlob = function logBlob (source, blob) {
  return Message.create({ source: source, blob: blob })
    .then(function (result) {
      console.log('Successfully logged ' + source + ' blob to Messages collection')
    })
    .catch(function (reason) {
      console.log('Promise rejected saving ' + source + ' blob to Messages collection')
      console.error(reason)
    })
}

var Message = mongoose.model('Message', MessageSchema)
module.exports = Message

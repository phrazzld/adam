var mongoose = require('mongoose')
var Schema = mongoose.Schema

var JobSchema = new Schema(
  {
    disabled: {
      type: Boolean,
      required: true,
      default: false
    },
    activationTime: {
      year: {
        type: Number,
        required: true
      },
      month: {
        type: Number,
        required: true
      },
      date: {
        type: Number,
        required: true
      },
      hours: {
        type: Number,
        required: true
      },
      minutes: {
        type: Number,
        required: true
      },
      seconds: {
        type: Number,
        required: true
      },
      timezone: {
        type: String,
        required: true
      }
    },
    requestBlob: {
      type: Object,
      required: true
    }
  },
  {
    timestamps: true
  }
)

var Job = mongoose.model('Job', JobSchema)
module.exports = Job

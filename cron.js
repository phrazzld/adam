// chatbot/cron.js
// Everything chatbot needs to initiate conversations with users

// node-schedule makes cronjobs possible
var schedule = require('node-schedule')
// Datetime arithmetic sucks, but less so with moment-timezone
var moment = require('moment-timezone')
// Our jobs are all about scheduling requests to Dialogflow
var dialogflow = require('./dialogflow')
// Error handling
var helpers = require('./helpers')
// Models
var Job = require('./models/job')
var User = require('./models/user')
var Message = require('./models/message')

// Check in on all of our jobs every minute
// And process them if it's past their activation time
var constantJob = schedule.scheduleJob('*/15 * * * * *', function () {
    Job.find({ disabled: false }, function (err, jobs) {
        helpers.logError(err, 'finding jobs in constantJob')
        jobs.forEach(function (job) {
            var phone = '+' + job.requestBlob.sessionId
            User.findOne({ phone: phone })
                .then(function (user) {
                    if (user != null) {
                        if (userIsOn(user)) {
                            if (shouldActivateJob(job)) {
                                console.log('Activating job')
                                dialogflow.post(job.requestBlob)
                                disableJob(job._id)
                            }
                        } else {
                            disableJob(job._id)
                        }
                    } else {
                        console.log('user is null, kill the job')
                        disableJob(job._id)
                    }
                })
                .catch(function (reason) {
                    console.log('Promise rejected finding user by phone in constantJob')
                    console.error(reason)
                })
        })
    })
})

// Disable job by id
function disableJob (id) {
    Job.findOneAndUpdate(
        { _id: id },
        { $set: { disabled: true } }
    )
        .then(function (result) {
            console.log('Successfully disabled job')
            console.log(result)
        })
        .catch(function (reason) {
            console.log('Promise rejected disabling job')
            console.error(reason)
        })
}

function userIsOn (user) {
    if (user.isPausingChatbot || user.stopped) {
        return false
    } else {
        return true
    }
}

function shouldActivateJob (job) {
    var now = moment.tz(job.activationTime.timezone)
    var activationTime = moment.tz(job.activationTime.timezone)
    var eventName = job.requestBlob.event.name
    activationTime.year(job.activationTime.year)
    activationTime.month(job.activationTime.month)
    activationTime.date(job.activationTime.date)
    activationTime.hours(job.activationTime.hours)
    activationTime.minutes(job.activationTime.minutes)
    activationTime.seconds(job.activationTime.seconds)
    if (activationTime.isBefore(now)) {
        return true
    } else {
        return false
    }
}

// Take a moment object and return an activationTime object
function buildActivationTime (time) {
    return {
        year: time.year(),
        month: time.month(),
        date: time.date(),
        hours: time.hours(),
        minutes: time.minutes(),
        seconds: time.seconds(),
        timezone: time.tz()
    }
}

// Write a new document to the Jobs collection
function scheduleNewJob (time, eventName, contexts, user) {
    return new Promise(function (resolve, reject) {
        var activationTime = buildActivationTime(time)
        var requestBlob = dialogflow.buildEventBlob(eventName, user, contexts)
        Job.create(
            {
                activationTime: activationTime,
                requestBlob: requestBlob
            },
            function (err, job) {
                if (err) {
                    helpers.logError(err, 'creating a new Job in scheduleNewJob')
                    reject(err)
                } else {
                    resolve(job)
                }
            }
        )
    })
}

// Expose our cronjobs to the rest of our application
module.exports = {
    constantJob: constantJob,
    buildActivationTime: buildActivationTime,
    scheduleNewJob: scheduleNewJob,
    shouldActivateJob: shouldActivateJob,
    autopause: autopause
}

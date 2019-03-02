// adam/dialogflowHelpers.js
// Helper functions to parse Dialogflow objects

// import shiz
var cron = require('./cron')
var helpers = require('./helpers')
var moment = require('moment-timezone')
var dialogflow = require('./dialogflow')
var twilio = require('./twilio')
var config = require('./config')

var User = require('./models/user')
var Job = require('./models/job')

// Handler for the "delay" delimiter
function delay (delayEvent, delayAmount, contexts, user) {
    return new Promise(function (resolve, reject) {
        User.findOne({ _id: user._id }, function (err, user) {
            var activate = moment.tz(user.timezone)
            activate.add(delayAmount, 'seconds')
            // Set up when the scheduled job should execute, and what it should do
            cron.scheduleNewJob(activate, delayEvent, user.contexts, user).then(
                function (result) {
                    resolve('Success')
                },
                function (reason) {
                    helpers.logError(reason, 'delay')
                    reject(reason)
                }
            )
        })
    })
}

function assumeFuture (activationTime, timezone) {
    var now = moment.tz(timezone)
    if (activationTime.isBefore(now)) {
        activationTime.add(1, 'day')
    }
    return activationTime
}

function setByTime (activationTime, dialogflowTime, eventName, contexts, user) {
    return new Promise(function (resolve, reject) {
        var hours = Number(dialogflowTime.substring(0, 2))
        var minutes = Number(dialogflowTime.substring(3, 5))
        activationTime.hours(hours).minutes(minutes)
        activationTime = assumeFuture(activationTime, user.timezone)
        cron.scheduleNewJob(activationTime, eventName, user.contexts, user)
            .then(function (result) {
                resolve(result)
            })
            .catch(function (reason) {
                helpers.logError(reason, 'setByTime')
                reject(reason)
            })
    })
}

function setByDuration (
    activationTime,
    duration,
    later,
    eventName,
    contexts,
    user
) {
    var durationType = typeof duration
    var sessionId = helpers.sessionId(user)
    return new Promise(function (resolve, reject) {
        if (durationType === 'object') {
            console.log('duration.amount: ' + duration.amount)
            console.log('duration.unit: ' + duration.unit)
            if (duration.unit === 'min') {
                duration.unit = 'minutes'
            }
            if (later) {
                activationTime = activationTime.add(duration.amount, duration.unit)
            } else {
                activationTime = activationTime.subtract(duration.amount, duration.unit)
            }
            console.log('activationTime in setByDuration')
            console.log(activationTime)
            cron.scheduleNewJob(activationTime, eventName, user.contexts, user).then(
                function (result) {
                    resolve(result)
                },
                function (reason) {
                    helpers.logError(reason, 'setByDuration')
                    reject(reason)
                }
            )
        } else if (durationType === 'string') {
            if (isNaN(Number(duration))) {
                console.log('Duration parameter could not be cast as a number')
                reject(
                    'Skipping job scheduling, duration parameter could not be cast as a number'
                )
            } else {
                console.log('Duration could be cast as a number')
                console.log('duration: ' + duration)
                console.log('Number(duration): ' + Number(duration))
                // Super hacky
                if (Number(duration) === 0) {
                    duration = 30
                }
                if (later) {
                    activationTime = activationTime.add(Number(duration), 'minutes')
                } else {
                    activationTime = activationTime.subtract(Number(duration), 'minutes')
                }
                console.log('activationTime in setByDuration:')
                console.log(activationTime)
                cron.scheduleNewJob(activationTime, eventName, user.contexts, user).then(
                    function (result) {
                        resolve(result)
                    },
                    function (reason) {
                        helpers.logError(reason, 'setByDuration')
                        reject(reason)
                    }
                )
            }
        }
    })
}

// Handler for the "set" delimiter
function set (eventName, time, duration, later, contexts, user) {
    var activate = moment.tz(user.timezone)
    return new Promise(function (resolve, reject) {
        if (time) {
            setByTime(activate, time, eventName, contexts, user).then(
                function (result) {
                    resolve('Success')
                },
                function (reason) {
                    helpers.logError(reason, 'set')
                    reject(reason)
                }
            )
        } else {
            setByDuration(activate, duration, later, eventName, contexts, user)
                .then(
                    function (result) {
                        resolve('Success')
                    },
                    function (reason) {
                        helpers.logError(reason, 'set')
                        reject(reason)
                    }
                )
        }
    })
}

function handleEmptyParameters (intentParams, eventName, contexts, user) {
    var paramKeys = Object.keys(intentParams)
    // Return value, default to true, function works to prove it false
    var noEmptyParameters = true
    // Loop through parameter keys
    paramKeys.forEach(function (paramKey) {
        var parameterIsEmpty = intentParams[paramKey] === ''
        var attr = detailedAttribute(user, paramKey)
        if (parameterIsEmpty && attr.canBeInterpolated) {
            // If the user has the missing data, send it back to API.AI
            processPost(eventName, user, contexts)
            noEmptyParameters = false
            return noEmptyParameters
        } else if (parameterIsEmpty && attr.isReplaceable && !attr.value) {
            // If the user's missing the data but we can stub it, that works too
            var data = stubUserData(user)
            processPost(eventName, data, contexts)
            noEmptyParameters = false
            return noEmptyParameters
        }
    })
    // If all parameters are filled, or are missing but cannot be stubbed, return true
    return noEmptyParameters
}

function detailedAttribute (user, attribute) {
    var replaceables = ['name']
    var attr = {
        // Name of the attribute we're updating
        name: attribute,
        // Value we're trying to update the attribute to
        value: user[attribute],
        // Can we stub the attribute if the user doesn't have a valid value for it?
        isReplaceable: replaceables.indexOf(attribute) > -1,
        // Does the user have a value for the attribute, and is it a string?
        canBeInterpolated: Boolean(user[attribute] && typeof user[attribute] === 'string')
    }
    return attr
}

function stubUserData (user) {
    var data = {
        name: user.name,
        phone: user.phone
    }
    if (!user.name) {
        data.name = 'pal'
    }
    return data
}

function processPost (eventName, data, contexts) {
    var requestBlob = dialogflow.buildEventBlob(eventName, data, contexts)
    dialogflow.post(requestBlob)
}

// Given a set of keys and a delimiter
// Return an array of each instance of that delimiter
function extractAction (keys, delimiter) {
    return keys.filter(function (k) {
        if (k.indexOf(delimiter) > -1) {
            return k
        }
    })
}

// Handle delete actions
// Return a promise so we definitely delete before we set
function handleDeleteActions (deletes, intentParams, sessionId) {
    var ps = []
    for (var i = 0; i < deletes.length; i++) {
        var p = new Promise(function (resolve, reject) {
            jobName = intentParams[deletes[i]]
            Job.updateMany(
                {
                    $and: [
                        { 'requestBlob.sessionId': sessionId },
                        { 'requestBlob.event.name': jobName }
                    ]
                },
                {
                    $set: { disabled: true }
                }
            )
                .then(function (result) {
                    resolve(result)
                })
                .catch(function (reason) {
                    helpers.logError(err, 'handleDeleteActions')
                    reject(reason)
                })
        })
        ps.push(p)
    }
    return Promise.all(ps)
}

function handleRequests (intentParams, contexts, user) {
    var sessionId = helpers.sessionId(user)
    var keys = Object.keys(intentParams)
    // Filter out keys into separate arrays for each action
    var deletes = extractAction(keys, 'delete')
    var sets = extractAction(keys, 'set')
    var delays = extractAction(keys, 'delayAmount')
    var triggers = extractAction(keys, 'trigger')
    var updates = extractAction(keys, 'updateAttribute')
    var forks = extractAction(keys, 'fork')
    return new Promise(function (resolve, reject) {
        handleDeleteActions(deletes, intentParams, sessionId)
            .then(function (result) {
                handleUpdates(updates, intentParams, user)
                    .then(function (result) {
                        for (var i = 0; i < sets.length; i++) {
                            eventName = intentParams[sets[i]]
                            console.log('Setting ' + eventName + ' for ' + user.name)
                            console.log('intentParams.duration: ' + intentParams.duration)
                            console.log(intentParams)
                            set(
                                eventName,
                                intentParams.time,
                                intentParams.duration,
                                intentParams.later,
                                contexts,
                                user
                            )
                        }
                        for (var i = 0; i < delays.length; i++) {
                            delayAmount = intentParams[delays[i]]
                            delayEvent = intentParams.delayEvent
                            delay(delayEvent, delayAmount, contexts, user)
                        }
                        for (var i = 0; i < triggers.length; i++) {
                            eventName = intentParams[triggers[i]]
                            setTimeout(processPost, config.messageDelay * 3, eventName, user, contexts)
                        }
                        for (var i = 0; i < forks.length; i++) {
                            switch (intentParams[forks[i]]) {
                                case 'disableUserJobs':
                                    disableUserJobs(user)
                                    break
                                case 'resetDaysOff':
                                    resetDaysOff(user)
                                    break
                                default:
                                    console.error('Unrecognized fork: ' + intentParams[forks[i]])
                                    break
                            }
                        }
                        resolve('Requests successfully handled')
                    })
            })
    })
}

function resetDaysOff (user) {
    User.findOneAndUpdate(
        { _id: user._id },
        { $set:
            {
                daysOff: new Array(),
                daysOffPretty: '... hey, you don\'t have any days off!'
            }
        },
        { new: true }
    )
        .then(function (result) {
            console.log('Successfully reset daysOff')
            console.log(JSON.stringify(result, null, 2))
        })
        .catch(function (reason) {
            console.log('Promise rejected resetting daysOff')
            console.error(reason)
        })
}

function handleUpdates (updates, intentParams, user) {
    var ps = []
    for (var i = 0; i < updates.length; i++) {
        var p = new Promise(function (resolve, reject) {
            var attribute = intentParams[updates[i]]
            var value = intentParams['update-' + attribute]
            if (attribute === 'weekendsOff') {
                attribute = 'daysOff'
                value = ['Friday', 'Saturday'] // Weekends = nights before weekends
            }
            if (value) {
                update(attribute, value, user)
                    .then(function (result) {
                        console.log('Update successful')
                        resolve(result)
                    })
                    .catch(function (reason) {
                        helpers.logError(reason, 'handleUpdates')
                        reject(new Error(reason))
                    })
            } else {
                resolve('No value, skipping update for ' + attribute)
            }
        })
        ps.push(p)
    }
    return Promise.all(ps)
}

function update (attr, val, user) {
    return new Promise(function (resolve, reject) {
        // Process specific user attributes, reject unknowns
        console.log('Updating user.' + attr + ' to ' + val)
        var hours, minutes
        if (attr === 'bedtime' || attr === 'precommit') {
            hours = Number(val.substring(0, 2))
            minutes = Number(val.substring(3, 5))
        }
        switch (attr) {
            case 'name':
                user[attr] = val
                break
            case 'timezone':
                user.timezone = val
                user.timezonePretty = prettifyTimezone(val)
                break
            case 'stopped':
                user.stopped = val
                disableUserJobs(user)
                break
            default:
                console.log(
                    'Blocking attempt to update unknown user attr (' + attr + ')'
                )
                break
        }
        user.save(function (err, user) {
            if (err) {
                helpers.logError(err, 'saving user in update')
                reject(new Error(err))
            }
            updateJobsUserInfo(user)
            resolve(user)
        })
    })
}

function updateJobsUserInfo (user) {
    return new Promise(function (resolve, reject) {
        Job.updateMany(
            {
                disabled: false,
                'requestBlob.sessionId': helpers.sessionId(user)
            },
            {
                $set: {
                    'requestBlob.event.data': user,
                    'requestBlob.timezone': user.timezone,
                    'activationTime.timezone': user.timezone
                }
            },
            function (err, jobs) {
                if (err) {
                    helpers.logError(err,
                        'updating user info in scheduled jobs in update'
                    )
                    reject(err)
                } else {
                    console.log('Updated user info in scheduled jobs')
                    console.log(jobs)
                    resolve(jobs)
                }
            }
        )
    })
}

function disableUserJobs (user) {
    return new Promise(function (resolve, reject) {
        Job.update(
            {
                disabled: false,
                'requestBlob.sessionId': helpers.sessionId(user)
            },
            {
                $set: { disabled: true }
            }
        )
            .then(function (result) {
                resolve(result)
            })
            .catch(function (reason) {
                helpers.logError(reason, 'disableUserJobs')
                reject(reason)
            })
    })
}

function prettifyTimezone (timezone) {
    var prettyTimezone
    switch (timezone) {
        case 'America/Los_Angeles':
            prettyTimezone = 'Pacific Time'
            break
        case 'America/Denver':
            prettyTimezone = 'Mountain Time'
            break
        case 'America/Chicago':
            prettyTimezone = 'Central Time'
            break
        case 'America/New_York':
            prettyTimezone = 'Eastern Time'
            break
        default:
            prettyTimezone = 'unsupported'
            break
    }
    return prettyTimezone
}

function buildCleanContexts (contexts) {
    var cleanContexts = []
    for (var i = 0; i < contexts.length; i++) {
        cleanContexts.push({
            name: contexts[i].name,
            lifespan: contexts[i].lifespan
        })
    }
    return cleanContexts
}

// Expose helper functions to rest of application
module.exports = {
    delay: delay,
    set: set,
    update: update,
    handleEmptyParameters: handleEmptyParameters,
    handleRequests: handleRequests,
    extractAction: extractAction,
    handleDeleteActions: handleDeleteActions,
    handleUpdates: handleUpdates,
    whichVacationResponse: whichVacationResponse,
    setByTime: setByTime,
    setByDuration: setByDuration,
    prettifyDaysOff: prettifyDaysOff,
    prettifyPrecommit: prettifyPrecommit,
    prettifyTimezone: prettifyTimezone,
    prettifyVacation: prettifyVacation,
    processPost: processPost,
    stubUserData: stubUserData,
    detailedAttribute: detailedAttribute,
    disableUserJobs: disableUserJobs,
    assumeFuture: assumeFuture,
    updateJobsUserInfo: updateJobsUserInfo,
    updateJobsPrecommitsForUser: updateJobsPrecommitsForUser,
    buildCleanContexts: buildCleanContexts
}

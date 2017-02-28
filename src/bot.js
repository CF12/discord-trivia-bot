'use strict'

// Import Libraries
const DiscordJS = require('discord.js')
const path = require('path')
const fs = require('fs')
const req = require('req-fast')
const he = require('he')

// Config File Declarations
let config
let opentdbFile

// Loads files
loadFiles()

// Variable Declarations
let pf = config.prefix
let categoryMappings = {
  'general': 9,
  'video-games': 15,
  'math': 19,
  'music': 12,
  'history': 23,
  'politics': 24,
  'anime': 31,
  'geography': 22
}

// Creates discordjs object
const bot = new DiscordJS.Client()

// Bot login
bot.login(config.bot_token)

// Functions
function checkTriviaToken (callback) {
  req({url: `https://www.opentdb.com/api.php?amount=1&token=${opentdbFile.session_token}`}, (err, res) => {
    if (err) throw Error('Error in initial OpenTDB check: Check if the service is up.')
    if (res.body.response_code === 3) return callback(true)
  })
}

function getTriviaToken () {
  req({url: `https://www.opentdb.com/api_token.php?command=request`}, (err, res) => {
    if (err) throw Error('Error in retrieval of new token for OpenTDB: Check if the service is up.')
    opentdbFile.session_token = res.body.token
    console.log(`INFO >> New OpenTDB token generated: ${opentdbFile.session_token}`)
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'opentdb.json'), JSON.stringify(opentdbFile), 'utf8')
  })
}

function resetTriviaToken (callback) {
  req(`https://www.opentdb.com/api_token.php?command=reset&token=${opentdbFile.session_token}`, (err, res) => {
    if (err) throw Error('OpenTDB session token could not be renewed.')
    console.log(`INFO >> OpenTDB token has been reset: ${opentdbFile.session_token}`)

    if (callback) callback()
  })
}

function loadFiles () {
  try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json')))
    opentdbFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'opentdb.json')))
  } catch (err) {
    if (err) throw Error('Please make sure you have set up all the config files properly')
  }
}

function logChannel (channel, type, msg) {
  let embed

  if (type === 'info') embed = {color: 2993972, description: `:information_source: **INFO - ** `}
  if (type === 'err') embed = {color: 16736580, description: `:warning: **ERROR - ** `}
  else throw Error('Invalid Channel Log')

  embed.description += msg

  return channel.sendEmbed(embed)
}

// Classes
class TriviaQuestion {
  constructor (diff, category) {
    this.category = category
    this.diff = diff
    this.reqUrl = ''
    this.q = ''
    this.c = ''
    this.i1 = ''
    this.i2 = ''
    this.i3 = ''

    this.updateReqUrl()
  }

  updateReqUrl () {
    if (this.category === 'any') this.reqUrl = `https://opentdb.com/api.php?amount=1&difficulty=${diff}&type=multiple&token=${opentdbFile.session_token}`
    else this.reqUrl = `https://opentdb.com/api.php?amount=1&category=${categoryMappings[this.category]}&difficulty=${this.diff}&type=multiple&token=${opentdbFile.session_token}`
  }

  load () {
    this.updateReqUrl()
    return new Promise((resolve, reject) => {
      req(this.reqUrl, (err, res) => {
        if (!err && res.statusCode === 200) {
          if (res.body.response_code === 4) {
            console.log('asdasd')
            resetTriviaToken(() => {
              this.load()
              return
            })
          }

          console.log(res.body.results[0])
          this.q = he.decode(res.body.results[0].question)
          this.c = he.decode(res.body.results[0].correct_answer)
          this.i1 = he.decode(res.body.results[0].incorrect_answers[0])
          this.i2 = he.decode(res.body.results[0].incorrect_answers[1])
          this.i3 = he.decode(res.body.results[0].incorrect_answers[2])
          resolve()
        } else reject(err)
      })
    })
  }

  getEmbed () {
    return {
      color: 4833279,
      title: this.q,
      fields: [
        { name: `**[A] - ${this.i1}**`, value: `\0` }
      ]
    }
  }
}

// Event: When bot is ready
bot.on('ready', () => {
  console.log('INFO >> Bot started')

  // Initial trivia session check
  checkTriviaToken((state) => { if (state) getTriviaToken() })
})

// Event: When the bot detects a message
bot.on('message', (msg) => {
  // Returns when unnecessary messages are detected
  if (msg.author.bot || !msg.content.startsWith(pf)) return

  // Variable shortcuts
  let msgChannel = msg.channel
  let msgContent = msg.content
  let msgArray = msgContent.split(' ')
  let msgCommand = msgArray[0].slice(pf.length).toUpperCase()
  let msgArgs = msgArray.slice(1)
  let msgUser = msg.author
  let msgMember = msg.member

  if (msgCommand === 'DEBUG') {
    let tq = new TriviaQuestion('easy', 'math')
    tq.load().then(() => {
      console.log(tq.getEmbed())
      msgChannel.sendEmbed(tq.getEmbed())
    }, (err) => { if (err) console.log('ERROR >> Error in OpenTDB request') })
  }

  if (msgCommand === 'TRIVIA') {
    if (msgArgs.length === 0) return logChannel(msgChannel, 'err', `Invalid usage! Use **${pf}trivia help** for more info.`)
    if (msgArgs.length === 1) {
      if (msgArgs[0] === 'unranked') {

      }
    }
    return
  }
})

setTimeout(() => { resetTriviaToken() }, 18000000)

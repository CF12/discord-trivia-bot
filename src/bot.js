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
let userCache = {}
let categoryMappings = {
  'GENERAL': 9,
  'VIDEO-GAMES': 15,
  'MATH': 19,
  'MUSIC': 12,
  'HISTORY': 23,
  'POLITICS': 24,
  'ANIME': 31,
  'GEOGRAPHY': 22
}

// Creates discordjs object
const bot = new DiscordJS.Client()

// Bot login
if (process.argv[2].toUpperCase() === 'CI') bot.login('Mjg3MDcwODk1NTE0NzE0MTEy.C57-6Q.SYgRsqpoWT-7Bh7ldMx84avW0Vo)
else bot.login(config.bot_token)

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

function shuffleArray (array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1))
    let temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }

  return array
}

// Classes
class TriviaQuestion {
  constructor (diff, category, ranked) {
    this.category = category.toUpperCase()
    this.diff = diff.toLowerCase()
    this.reqUrl = ''
    this.question = ''
    this.choices = []
    this.type = 'UNRANKED'

    if (ranked) this.type = 'RANKED'

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
          this.question = he.decode(res.body.results[0].question)
          this.choices.push([he.decode(res.body.results[0].correct_answer), 1])
          for (let i of res.body.results[0].incorrect_answers) this.choices.push([he.decode(i), 0])

          this.choice = shuffleArray(this.choices)
          console.log(this.choices)

          resolve()
        } else reject(err)
      })
    })
  }

  getEmbed () {
    return {
      color: 4833279,
      author: {
        name: `=========================❰ TRIVIA ❱=========================`
      },
      title: `:thinking: [${this.type}] || [${this.category}] || [${this.diff.toUpperCase()}] :thinking:`,
      description: `__**${this.question}**__`,
      fields: [
        {name: `**[A] - ${this.choices[0][0]}**`, value: `=========================`},
        {name: `**[B] - ${this.choices[1][0]}**`, value: `=========================`},
        {name: `**[C] - ${this.choices[2][0]}**`, value: `=========================`},
        {name: `**[D] - ${this.choices[3][0]}**`, value: `=========================`}
      ],
      footer: {text: 'Powered by the Open Trivia Database: https://opentdb.com'}
    }
  }
}

// Event: When bot is ready
bot.on('ready', () => {
  console.log('INFO >> Bot started')
  if (process.argv[2].toUpperCase() === 'CI') console.log('INFO >> Using CI account')

  // Initial trivia session check
  checkTriviaToken((state) => { if (state) getTriviaToken() })
  resetTriviaToken()
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
    if (msgArgs.length >= 1) {
      if (msgArgs[0] === 'unranked') {
        if (msgArgs.length !== 3) return logChannel(msgChannel, 'err', `Invalid usage! Usage: **${pf}trivia unranked (difficulty) (category)**`)
        if (!['EASY', 'MEDIUM', 'HARD'].includes(msgArgs[1].toUpperCase())) return logChannel(msgChannel, 'err', `Invalid difficulty! Valid difficulties: **Easy, Medium, Hard**`)
        if (!Object.keys(categoryMappings).includes(msgArgs[2].toUpperCase())) return logChannel(msgChannel, 'err', `Invalid category! To get a list of all available categories, please use **${pf}trivia categories**`)

        let tq = new TriviaQuestion(msgArgs[1], msgArgs[2])

        if (!Object.keys(userCache).inclues(msgMember.id)) userCache.msgMember.id = tq

        tq.load().then(() => {
          msgChannel.sendEmbed(tq.getEmbed())
          .then((msg) => {
            setTimeout(() => {
              msg.delete()
            }, 10000)
          })
        })
      }
    }
    return
  }

  if (msgCommand === 'INFO') {
    let imgCredits = [
      {name: 'Bot Icon', value: '*Icon made by Dimi Kazak from www.flaticon.com*'}
    ]
    msgChannel.sendEmbed({color: 16736580, description: `Image Credits:`, fields: imgCredits})

    return
  }
})

setTimeout(() => { resetTriviaToken() }, 18000000)

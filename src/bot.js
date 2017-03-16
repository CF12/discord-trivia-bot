'use strict'

// Import Libraries
const DiscordJS = require('discord.js')
const Nedb = require('nedb')
const path = require('path')
const fs = require('fs')
const req = require('req-fast')
const he = require('he')

// Creates discordjs object
const bot = new DiscordJS.Client()

// Config File Declarations
let config
let opentdbFile

// Loads files
if (process.argv.length === 2) loadFiles()

// Variable Declarations
let pf
let userCache = {}
let db = new Nedb({filename: 'data/database.db', autoload: true})
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

if (process.argv.length === 2) pf = config.prefix

// Bot login
if (process.argv.includes('CI')) bot.login(process.env.CI_BOT_TOKEN)
else bot.login(config.bot_token)

// Functions
function loadFiles () {
  try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json')))
    opentdbFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'opentdb.json')))
  } catch (err) {
    if (err) throw Error('Please make sure you have set up all the config files properly')
  }
}

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

function logChannel (channel, type, msg) {
  let embed

  if (type === 'info') embed = {color: 2993972, description: `:information_source: **INFO - **`}
  else if (type === 'err') embed = {color: 16736580, description: `:warning: **ERROR - **`}
  else if (type === 'correct') embed = {color: 16736580, description: `:white_check_mark: **RESULT - **`}
  else if (type === 'incorrect') embed = {color: 16736580, description: `:x: **RESULT - **`}
  else if (type === 'notime') embed = {color: 16736580, description: `:alarm_clock: **TIME - **`}
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

function dbCheckAddUser (member) {
  db.findOne({guild_ID: member.guild.id, user_ID: member.id}, true, (err, doc) => {
    if (err) throw err
    if (doc === null) db.insert({guild_ID: member.guild.id, user_ID: member.id, xp: 0, money: 0})
  })
}

function dbAddXP (member, amount) {
  db.findOne({guild_ID: member.guild.id, user_ID: member.id}, true, (err, doc) => {
    if (err) throw err
    if (doc === null) return console.log(`ERROR >> User Not Found: ${member.id}`)

    db.update({guild_ID: member.guild.id, user_ID: member.id}, {$set: {xp: doc.xp + amount}}, {}, (err, doc) => {
      if (err) throw err
    })
  })
}

// function dbAddMoney (msgMember, amount) {
//   let money
//   db.findOne({guild_ID: msgMember.guild.id, user_ID: msgMember.id}, true, (err, doc) => {
//     if (err) throw err
//     if (doc === null) return console.log(`ERROR >> User Not Found: ${msgMember.id}`)
//     money = doc.money
//     console.log(doc.money)
//     console.log(money)
//   })

//   db.update({guild_ID: msgMember.guild.id, user_ID: msgMember.id}, {$set: {'money': money += amount}}, {}, (err, doc) => {
//     if (err) throw err
//   })
// }

// Classes
class TriviaQuestion {
  constructor (diff, category, ranked, guildMember) {
    this.category = category.toUpperCase()
    this.diff = diff.toLowerCase()
    this.reqUrl = ''
    this.question = ''
    this.choices = []
    this.type = 'UNRANKED'
    this.author = guildMember
    this.correct = undefined
    this.msg

    if (ranked) this.type = 'RANKED'

    this.updateReqUrl()
  }

  updateReqUrl () {
    if (this.category === 'any') this.reqUrl = `https://opentdb.com/api.php?amount=1&difficulty=${this.diff}&type=multiple&token=${opentdbFile.session_token}`
    else this.reqUrl = `https://opentdb.com/api.php?amount=1&category=${categoryMappings[this.category]}&difficulty=${this.diff}&type=multiple&token=${opentdbFile.session_token}`
  }

  getChoices () { return this.choices }

  getAuthor () { return this.author }

  getMsg () { return this.msg }

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

          this.question = he.decode(res.body.results[0].question)
          this.choices.push([he.decode(res.body.results[0].correct_answer), 1])
          for (let i of res.body.results[0].incorrect_answers) this.choices.push([he.decode(i), 0])

          this.choices = shuffleArray(this.choices)

          resolve()
        } else reject(err)
      })
    })
  }

  send (channel, callback) {
    channel.sendEmbed({
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
    })
    .then((msg) => {
      this.msg = msg
      if (callback) callback(msg)
    })
  }
}

// Event: When bot is ready
bot.on('ready', () => {
  console.log('INFO >> Bot started')
  if (process.argv.includes('CI')) {
    console.log('TEST >> Bot Initiation Success! Ending Process...')
    process.exit(0)
  }

  // Initial trivia session check
  checkTriviaToken((state) => { if (state) getTriviaToken() })
  resetTriviaToken()
})

// Event: When the bot detects a message
bot.on('message', (msg) => {
  // Check if message is from bot
  if (msg.author.bot) return

  // Variable shortcuts
  let msgChannel = msg.channel
  let msgContent = msg.content
  let msgArray = msgContent.split(' ')
  let msgBase = msgArray[0].toUpperCase()
  let msgArgs = msgArray.slice(1)
  let msgUser = msg.author
  let msgMember = msg.member

  // Trivia answer handler
  if (Object.keys(userCache).length !== 0 && msgMember.id in userCache) {
    if (!['A', 'B', 'C', 'D'].includes(msgBase)) return logChannel(msgChannel, 'err', 'Invalid Answer! Please respond using the letter corresponding to your choice.')
    let choiceIndex

    if (msgBase === 'A') choiceIndex = 0
    if (msgBase === 'B') choiceIndex = 1
    if (msgBase === 'C') choiceIndex = 2
    if (msgBase === 'D') choiceIndex = 3

    if (userCache[msgMember.id].getChoices()[choiceIndex][1]) {
      logChannel(msgChannel, 'correct', 'Correct!')
      userCache[msgMember.id].msg.delete()
      delete userCache[msgMember.id]
      dbAddXP(msgMember, 10)
      return
    } else {
      logChannel(msgChannel, 'incorrect', 'Incorrect!')
      userCache[msgMember.id].msg.delete()
      delete userCache[msgMember.id]
      dbAddXP(msgMember, -10)
      return
    }
  }

  // Returns when unnecessary messages are detected
  if (!msg.content.startsWith(pf)) return
  msgBase = msgBase.slice(pf.length)

  // Command: Debug
  if (msgBase === 'DEBUG') {
    let tq = new TriviaQuestion('easy', 'math')
    tq.load().then(() => {
      console.log(tq.send())
      msgChannel.sendEmbed(tq.send())
    }, (err) => { if (err) console.log('ERROR >> Error in OpenTDB request') })
  }

  // Command: Main Trivia Command
  if (msgBase === 'TRIVIA') {
    dbCheckAddUser(msgMember)
    if (msgArgs.length === 0) return logChannel(msgChannel, 'err', `Invalid usage! Use **${pf}trivia help** for more info.`)
    if (msgArgs.length >= 1) {
      if (msgArgs[0] === 'unranked') {
        if (msgArgs.length !== 3) return logChannel(msgChannel, 'err', `Invalid usage! Usage: **${pf}trivia unranked (difficulty) (category)**`)
        if (!['EASY', 'MEDIUM', 'HARD'].includes(msgArgs[1].toUpperCase())) return logChannel(msgChannel, 'err', `Invalid difficulty! Valid difficulties: **Easy, Medium, Hard**`)
        if (!Object.keys(categoryMappings).includes(msgArgs[2].toUpperCase())) return logChannel(msgChannel, 'err', `Invalid category! To get a list of all available categories, please use **${pf}trivia categories**`)

        let tq = new TriviaQuestion(msgArgs[1], msgArgs[2], false, msgMember)

        if (!Object.keys(userCache).includes(msgMember.id)) userCache[msgMember.id] = undefined
        else if (typeof userCache[msgMember.id] === 'function') return logChannel(msgChannel, 'err', `Please answer your current trivia question!`)
        userCache[msgMember.id] = tq

        tq.load().then(() => {
          tq.send(msgChannel, (msg) => {
            setTimeout(() => {
              if (!userCache[msgMember.id] || userCache[msgMember.id].getMsg().id !== msg.id) return

              msg.delete()
              delete userCache[msgMember.id]
              return logChannel(msgChannel, 'notime', 'Time\'s up!')
            }, 10000)
          })
        })
      }
    }
    return
  }

  if (msgBase === 'INFO') {
    let imgCredits = [
      {name: 'Bot Icon', value: '*Icon made by Dimi Kazak from www.flaticon.com*'}
    ]
    msgChannel.sendEmbed({color: 16736580, description: `Image Credits:`, fields: imgCredits})

    return
  }
})

setTimeout(() => { resetTriviaToken() }, 18000000)

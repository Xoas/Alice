const {ipcRenderer, remote} = require('electron')

const fs = require('graceful-fs')
const glob = require("glob")
const path = require("path")
const request = require('request')
const md5 = require('md5')
const uniqueId = require('node-machine-id').machineIdSync()

const BrowserWindow = remote.BrowserWindow
const Configstore = require('configstore')
const conf = new Configstore("harmony")

const themesFolder = remote.app.getPath('userData')+'/Themes'
const pluginsFolder = remote.app.getPath('userData')+'/Plugins'

let client_ids = tmpSpecialviewTrackList = tmpSearchTrackList = null
let data = settings = g = {}
let services = trackList = g.selected = []
let sortKey = 'none'
let offline = false

// Loading the internal & external plugins 
const files = glob.sync(`{${__dirname}/js/plugins/*.js, ${pluginsFolder}/*.js}`)

for (let file of files) {
	const serviceId = file.substr(file.lastIndexOf('/')+1).slice(0, -3)
	window[serviceId] = require( path.resolve( file ) )
	services.push(serviceId)
}

console.log("We are on a -"+process.platform+"- system")

if (process.platform == "darwin" && !(conf.get("settings") && conf.get("settings").tray === 'pinned') ) { // OSX, but don't enable it when pinned to menubar
	removeClass("title", "hide")
	addClass("header", "osx")
} else if (process.platform == "win32") { //Windows
	addClass("header", "win32")
}
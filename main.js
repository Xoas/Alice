'use strict';

const fs = require('fs')
const { powerSaveBlocker, ipcMain, app, globalShortcut, Menu, BrowserWindow, Tray, TouchBar } = require('electron')
const {TouchBarLabel, TouchBarButton, TouchBarSpacer} = TouchBar
const windowStateKeeper = require('electron-window-state')

const Configstore = require('configstore')
const conf = new Configstore("harmony")

let settings = (conf.get('settings') || {tray: 'none'})

let willQuitApp = false
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let window

let tray = null

let psb

ipcMain.on('track:start', () => {
	//console.log('powerSaveBlocker enabled')
	psb = powerSaveBlocker.start('prevent-app-suspension')
})

ipcMain.on('track:end', () => {
	//console.log('powerSaveBlocker disabled')
	powerSaveBlocker.stop(psb)
})


ipcMain.on('update:tray', (evt, newTray) => {
	let oldTray = settings.tray
	settings.tray = newTray // To update

	if (newTray == 'none') tray.destroy()
		
	initExternalControls()

	if (oldTray === 'pinned' || newTray === 'pinned') {
		window.hide()
		window.destroy()
		createWindow()
	}

})

/// FUNCTIONS USED FOR TRAY PINNING

const getWindowPosition = () => {
	const windowBounds = window.getBounds()
	const trayBounds = tray.getBounds()

	// Center window horizontally below the tray icon
	const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2))

	// Position window 4 pixels vertically below the tray icon
	const y = Math.round(trayBounds.y + trayBounds.height + 4)

	return {x: x, y: y}
}

const createTray = () => {
	if (tray) tray.destroy() // So we never have two

	let icon = 'icon'

	if (process.platform === 'darwin') {
		icon = 'osx/iconTemplate'
	} else {
		switch (settings.trayIconStyle) {
			case 'white': 
				icon = 'icon-white'
				break
			case 'black': 
				icon = 'icon-black'
				break
		}
	}

	if (process.platform === 'win32') {
		tray = new Tray(__dirname + '/icons/win/'+icon+'.ico')
	} else {
		tray = new Tray(__dirname + '/icons/'+icon+'.png')
	}

	if (process.platform === 'darwin') {
		tray.setPressedImage(__dirname + '/icons/osx/iconHighlight.png')
	}

	tray.setToolTip('Harmony')

}

const toggleWindow = () => {
	if (window.isVisible()) window.hide()
	else showWindow()
}

const showWindow = () => {
	const position = getWindowPosition()
	window.setPosition(position.x, position.y, false)
	window.show()
	window.focus()
}

//// END

function createWindow() {

	if (settings && settings.tray === 'pinned') {
		window = new BrowserWindow({
			resizable: true,
			height: 500,
			minHeight: 200,
			maxHeight: 700,
			width: 350,
			minWidth: 250,
			maxWidth: 400,
			center: true,
			frame: false,
			vibrancy: 'light',
			fullscreenable: false,
			acceptFirstMouse: true,
			icon: 'icons/icon.png'
		})

		// Hide the window when it loses focus
		window.on('blur', () => {
			window.hide()
		})

		window.setVisibleOnAllWorkspaces(true)

		createTray()

		tray.on('right-click', toggleWindow)
		tray.on('double-click', toggleWindow)
		tray.on('click', toggleWindow)

		if (app.dock) app.dock.hide() // Hide dock icon

		showWindow()

	} else {

		let windowState = windowStateKeeper({
			defaultWidth: 701,
			defaultHeight: 450
		})

		window = new BrowserWindow({
			resizable: true,
			height: windowState.height,		
			width: windowState.width,
			x: windowState.x,
			y: windowState.y,
			minWidth: 210,
			minHeight: process.platform === 'darwin' ? 102 : 90,
			vibrancy: 'light',
			acceptFirstMouse: true,
			icon: 'icons/icon.png',
			titleBarStyle: 'hidden'
		})

		windowState.manage(window)

		if (app.dock) app.dock.show()
	}

	window.setMenu(null)
	window.loadURL('file://' + __dirname + '/app/index.html')
	//window.webContents.openDevTools()

	window.on('close', (e) => {
		if (willQuitApp || process.platform !== 'darwin') {
			/* the user tried to quit the app */
			window = null
		} else {
			/* the user only tried to close the window */
			e.preventDefault()
			window.hide()
		}
	})

	// Init all the external controls like the Tray, MPRIS & mediakeys
	initExternalControls()

	// Create the Application's main menu
	if (process.platform == 'darwin') { // To enable shortcuts on OSX

		var template = [{
			label: "Harmony",
			submenu: [
				{ label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
				{ label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
				{ type: "separator" },
				{ label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
				{ label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
				{ label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
				{ label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" },
				{ type: "separator" },
				{ type: "checkbox", label: "Always on top", checked: settings.alwaysOnTop, click: (menuItem) => { 
					window.setAlwaysOnTop(!window.isAlwaysOnTop())
					menuItem.checked = window.isAlwaysOnTop()
				}},
				{ type: "separator" },
				{ label: "Hide", accelerator: "Cmd+H", click: () => window.hide() },
				{ label: "Close window", accelerator: "Cmd+W", click: () => window.hide() },
				{ label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() }
			]
		}]

		Menu.setApplicationMenu(Menu.buildFromTemplate(template))
	}

}

app.setName('Harmony')

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow)

// 'activate' is emitted when the user clicks the Dock icon (OS X)
app.on('activate', () =>  {
	window.show()
})

// 'before-quit' is emitted when Electron receives 
// the signal to exit and wants to start closing windows
app.on('before-quit', () =>  {
	willQuitApp = true
})

app.on('window-all-closed', () =>  {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

/**** EXTERNAL CONTROLS ***/

const isDebInstall = (process.platform == 'linux' && fs.existsSync('/usr/share/applications/harmony.desktop'))
const isAppImageInstall = (process.platform == 'linux' && fs.existsSync(process.env['HOME'] + '/.local/share/applications/appimagekit-harmony.desktop'))

let mprisPlayer = { enabled: false }
let trayPlayer = {trackName: '', trackArtist: '', enabled: false}

const initExternalControls = () => {

	globalShortcut.register('MediaPlayPause', () => window.webContents.send('control:playPause'))
	globalShortcut.register('MediaNextTrack', () => window.webContents.send('control:nextTrack'))
	globalShortcut.register('MediaPreviousTrack', () => window.webContents.send('control:prevTrack'))

	const updateTray = (playing) => {

		if (trayPlayer.enabled) {
			let contextMenu = Menu.buildFromTemplate([
				{ label: trayPlayer.trackName},
				{ label: (trayPlayer.trackArtist != '' ? 'By: '+trayPlayer.trackArtist : '')},
				{ type: "separator" },
				{ label: 'Favorite', click: () => window.webContents.send('control:favPlaying') },
				{ label: ( playing ? 'Pause' : 'Play'), click: () => window.webContents.send('control:playPause') },
				{ label: 'Next', click: () => window.webContents.send('control:nextTrack') },
				{ label: 'Previous', click: () => window.webContents.send('control:prevTrack') },
				{ type: "separator" },
				{ label: 'Show/hide player', click: () => window.isVisible() ? window.hide() : window.show() },
				{ label: 'Quit', click: () => app.quit() }
			])

			tray.setContextMenu(contextMenu)

			tray.on('click', _ =>  tray.popUpContextMenu(contextMenu) )
		}
	}


	const updateTouchBar = (playing) => {

		if (process.platform === 'darwin') {
			const touchBar = new TouchBar([
				new TouchBarButton({
					label: 'Previous',
					click: () => window.webContents.send('control:prevTrack')
				}),
				new TouchBarButton({
					label:  ( playing ? 'Pause' : 'Play'),
					click: () => window.webContents.send('control:playPause')
				}),
				new TouchBarButton({
					label: 'Next',
					click: () => window.webContents.send('control:nextTrack')
				}),
				new TouchBarSpacer({size: 'small'}),
				new TouchBarButton({
					label: '❤️',
					click: () => window.webContents.send('control:favPlaying')
				}),
			])

			window.setTouchBar(touchBar)
		}
	}

	updateTouchBar(false)

	if (isDebInstall || isAppImageInstall) {
		console.log('Linux MPRIS compatible system.')

		try {
			const mpris = require('mpris-service')

			mprisPlayer = mpris({
				name: 'harmony',
				identity: 'Harmony',
				desktopEntry: "harmony"
			})

			mprisPlayer.on("playpause", () => window.webContents.send('control:playPause'))
			mprisPlayer.on("pause", () => window.webContents.send('control:playPause'))
			mprisPlayer.on("play", () => window.webContents.send('control:playPause'))
			mprisPlayer.on("next", () => window.webContents.send('control:nextTrack'))
			mprisPlayer.on("previous", () => window.webContents.send('control:prevTrack'))
			mprisPlayer.on("raise", () => window.focus())

			mprisPlayer.enabled = true

		} catch (e) {
			console.error("Error loading MPRIS module")
		}

	}


	ipcMain.on('change:song', (evt, track) => {

		if (mprisPlayer.enabled) {
			console.log('mprisPlayer enabled, lets change track')
			mprisPlayer.metadata = {
				'mpris:trackid': mprisPlayer.objectPath(track.id+Math.floor((Math.random() * 100) + 1)),
				'mpris:length': track.duration * 1000,
				'mpris:artUrl': track.artwork,
				'xesam:title': track.title,
				'xesam:album': track.album.name,
				'xesam:artist': [ track.artist.name ]
			}

			mprisPlayer.playbackStatus = 'Playing'
		}

		trayPlayer.trackName = track.title.length > 30 ? track.title.substring(0, 30) + "..." : track.title
		trayPlayer.trackArtist = track.artist.name.length > 30 ? track.artist.name.substring(0, 30) + "..." : track.artist.name

		updateTray(true)
		updateTouchBar(true)

	})


	ipcMain.on('change:playback', (evt, playbackState) => {

		if (mprisPlayer.enabled) {
			mprisPlayer.playbackStatus = ( playbackState === true ? 'Playing' : 'Paused')
		}

		updateTray(playbackState)
		updateTouchBar(playbackState)

	})

	if (settings && settings.tray === 'controls') {
		createTray()

		trayPlayer.enabled = true

		updateTray(false)
	} else {
		trayPlayer.enabled = false
	}

}
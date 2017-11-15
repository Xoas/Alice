/**
 * Show a given tab on the settings page
 *
 * @param id {string} The tab's ID
 */
function showTab(id) {
	addClass(['general', 'plugins', 'themes'], 'hide');
	removeClass(['generalBtn', 'pluginsBtn', 'themesBtn'], 'selected');

	removeClass(id, 'hide');
	addClass(id+'Btn', 'selected');
}

/***
* Install a new plugin
***/

function installPlugin() {

	if( !fs.existsSync(pluginsFolder) ) fs.mkdirSync(pluginsFolder)

	let url = getById('pluginURL').value
	let filename = url.split('/').pop()

	let file = fs.createWriteStream(pluginsFolder+'/'+filename)
	
	let r = request(url)

	r.on('response', res => {
		res.pipe(file)

		new Notification('Plugin successfully installed!', {'origin': 'Harmony' })
	})

	getById('pluginURL').value = ''

}



/***
* Install a new theme
***/

function installTheme() {

	if( !fs.existsSync(themesFolder) ) fs.mkdirSync(themesFolder)

	let url = getById('themeURL').value
	let filename = url.split('/').pop()

	let file = fs.createWriteStream(themesFolder+'/'+filename)
	
	let r = request(url)

	r.on('response', res => {
		res.pipe(file)

		new Notification('Theme successfully installed!', {'origin': 'Harmony' })
	})

	refreshThemes()

	getById('themeURL').value = ''

}

/****
* Refresh themes list
****/

function refreshThemes() {
	const files = glob.sync(themesFolder+'/*.css' )

	getById('settingsPrimaryTheme').innerHTML = `<option value="">Basic</option>`
	getById('settingsSecondaryTheme').innerHTML = `<option value="">Basic</option>`

	getById('settingsPrimaryTheme').innerHTML += `<option value="css/dark.css">Dark</option>`
	getById('settingsSecondaryTheme').innerHTML += `<option value="css/dark.css">Dark</option>`


	getById('settingsPrimaryTheme').innerHTML += `<option value="css/arc.css">Arc</option>`
	getById('settingsSecondaryTheme').innerHTML += `<option value="css/arc.css">Arc</option>`

	if (process.platform === 'darwin') {
		getById('settingsPrimaryTheme').innerHTML += `<option value="css/vibrancy.css">Vibrancy</option>`
		getById('settingsSecondaryTheme').innerHTML += `<option value="css/vibrancy.css">Vibrancy</option>`
	}

	for (let file of files) {
		const themeId = file.substr(file.lastIndexOf('/')+1).slice(0, -4)
		getById('settingsPrimaryTheme').innerHTML += `<option value="${file}">${themeId}</option>`
		getById('settingsSecondaryTheme').innerHTML += `<option value="${file}">${themeId}</option>`
	}

	getById("settingsPrimaryTheme").value = settings.primaryTheme
	getById("settingsSecondaryTheme").value = settings.secondaryTheme
}


/**
* Save changes when 
*
* @param service {Object} The services's API Object
*/
function saveChange(tochange, value) {
	
	if (tochange.includes(',')) {
		let service = tochange.split(',')[0]
		tochange = tochange.split(',')[1]
		settings[service][tochange] = value
	} else {
		settings[tochange] = value
	}

	asyncSaveSettings()
}


/**
 * Reset all settings
 */
function resetSettings(update) {
	console.log("Reseting all settings")

	settings = {
		volume: 1,
		notifOff: false,
		license: '',
		primaryTheme: (process.platform === 'darwin' ? 'css/vibrancy.css' : ''),
		secondaryTheme: 'css/dark.css',
		coverView: false,
		coverViewNoAlbums: false,
		tray: 'none',
		checkUpdate: true,
		refreshOnStart: false,
		repeat: false,
		shuffle: false
	}

	for (let s of services)
		settings[s] = window[s].settings

	if (!update) return

	conf.set('settings', settings)

	remote.getCurrentWindow().reload()
}

function updateTray() {
	ipcRenderer.send('update:tray', settings.tray);
}

function updateSettings() {

	getById("tempServicesSettings").innerHTML = ''

	for (let s of services) {
		if (!window[s].settingsItems) continue

		getById("tempServicesSettings").innerHTML += `<hr><b>${window[s].fullName}</b>`

		for (let item of window[s].settingsItems) {

			switch (item.type) {
				case 'checkbox':
					getById("tempServicesSettings").innerHTML += `<br><input type="checkbox" id="${s+item.id}" onchange="saveChange('${s+','+item.id}', this.checked)" ${settings[s][item.id] ? 'checked': ''}> ${item.description}</input><br>`
					break

				case 'select':
					let options = ''

					for (let option of item.options)
						options += `<option value="${option.value}" ${settings[s][item.id] === option.value ? 'selected' : ''} >${option.title}</option>`
			

					getById("tempServicesSettings").innerHTML += `<br>${item.description} <select class='rectInput' id="${s+item.id}" onchange="saveChange('${s+','+item.id}', this.value)"> ${options} </select><br>`
				
					break

				case 'text':
					getById("tempServicesSettings").innerHTML += `<br>${item.description} <input class='rectInput' type="text" id="${s+item.id}" value='${settings[s][item.id] || ''}' placeholder='${item.placeholder || '' }' onchange="saveChange('${s+','+item.id}', this.value)"></input><br>`
					break
			}

		}

		getById("tempServicesSettings").innerHTML += ''
	}

	/*** General settings */

	getById("settingsCheckUpdate").checked = settings.checkUpdate
	getById("settingsCoverView").checked = settings.coverView
	getById("settingsCoverViewNoAlbums").checked = settings.coverViewNoAlbums
	getById("settingsNotifOff").checked = settings.notifOff
	getById("settingsRefreshOnStart").checked = settings.refreshOnStart
	getById("settingsTrayIconStyle").value = settings.trayIconStyle
	getById("settingsLicenseBox").value = settings.license
	getById("settings"+settings.tray).checked = true  // Check the appropriate radio button
}

//////////////////////////////
//     When we start      ///
////////////////////////////

if (process.platform === 'darwin') {
	const els = document.getElementsByClassName('ctrlorcmd')
	Array.from(els).forEach(el => el.innerHTML = 'Cmd')
	
	addClass('trayIconSettings', 'hide')
} else {
	addClass('onlyMac', 'hide')
}

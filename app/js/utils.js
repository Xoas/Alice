/**
 * Tests the internet connection & Gets the latest API Keys & Secrets
 *
 * @returns {Promise} The XMLHttpRequest that's testing the internet connection
 */
function testInternet(checklicense, checkUpdate, callback) {
	console.log("Testing internet & checking for updates...")

	const currentVersion = remote.app.getVersion()
	const url = `https://getharmony.xyz/data.php?license=${settings.license}&v=${currentVersion}&machineId=${uniqueId}&platform=${process.platform}`

	request(url, (err, res, body) => {  
		if (err) {
			console.warn('Offline !')
			console.warn(err)
			offline = true// Global var
			if (callback) callback(false)
			return
		}

		offline = false

		body = JSON.parse(body)
		settings.client_ids = body.clientIds

		//The annoying popup
		const licenseIsValid = body['licenseValid']
		if (checklicense && !licenseIsValid) licenseDialog((settings.license != ''))

		if (callback) callback(true)

		const latestVersion = body['latestVersion']
		console.log("Latest release is " + latestVersion + " and we're running " + currentVersion)

		if (checkUpdate && compareVersions(currentVersion, latestVersion) < 0)
			remote.dialog.showMessageBox({ 
				type: 'info', 
				title: 'Update available', 
				message: 'A new update is available for Harmony!\n\nDo you want to download it?\n\nThis message can be disabled in the settings.', 
				buttons: ['Download', 'Not now']
			}, (btnIndex, checked) => { 
				if (btnIndex === 0) return require('electron').shell.openExternal('https://getharmony.xyz/download')
			})

	})
}

function licenseDialog(wrongLicense) {
	let body
	if (wrongLicense) body = "Hey! I hope you enjoy Harmony.\n\nThis is an unregistered evaluation version.\nAlthough the trial is untimed, a license must be purchased for continued use.\n\nIt seems like the license you entered isn't valid. If you think that's an error, contact vince@getharmony.xyz"
	else body = "Hey! I hope you enjoy Harmony.\n\nThis is an unregistered evaluation version.\nAlthough the trial is untimed, a license must be purchased for continued use."

	//checkboxLabel: 'Check to confirm you read this'
	remote.dialog.showMessageBox({ 
		type: 'info', 
		title: 'License registration', 
		message: body, 
		buttons: ['Buy', 'Not now']
	}, (btnIndex, checked) => { 
		if (btnIndex === 0) return require('electron').shell.openExternal('https://getharmony.xyz/buy')
		//if (!checked) return licenseDialog()
	})

}

function oauthLogin (url, callback) {
	
	let authWindow = new BrowserWindow({ 
		title: 'Login', 
		width: 400, 
		height: 500, 
		show: false, 
		nodeIntegration: false, 
		webPreferences: { 
			nodeIntegration: false, 
			webSecurity: false, 
			plugins: true 
		} 
	})

	let done = false

	authWindow.setMenu(null)
	authWindow.loadURL(url)
	authWindow.show()

	function handleCallback (url) {
		let code = ( getParameterByName('code', url) || getParameterByName('token', url) )

		let error = getParameterByName('error', url)

		if (code || error) authWindow.destroy()

		if (code) {
			callback(code)
		} else if (error) {
			alert("Error, please try again later !")
			//alert(error)
			callback(null)
		}
	}

	authWindow.webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
		if (getHostname(newUrl) == 'localhost' && done == false) {
			done = true
			handleCallback(newUrl)
		}
	})

	authWindow.webContents.on('will-navigate', (event, newUrl) => {
		if (getHostname(newUrl) == 'localhost' && done == false) {
			done = true
			handleCallback(newUrl)
		}
	})

	authWindow.on('close', () => { 
		authWindow = null
		callback(null)
	}, false)

}

/**
* Gets an element by its id
*
* @param id {String}
* @returns {HTMLElement} The HTML Element
*/
function getById(id) {
	return document.getElementById(id)
}

/**
* Gets a track's element visible height
*
* @param parentId {String}
* @param el {HTMLElement}
* @returns {Array} The visible heights, acocrding to bottom and top of parent
*/
function visibleArea (parentId, el) {
	let parentDim = getById(parentId).getBoundingClientRect()
    let elDim = el.getBoundingClientRect()

    return [parentDim.bottom - elDim.bottom, elDim.top - parentDim.top]
}

/**
* Get current active 'track list' user is using
*
*/

const getCurrentTrackListId = _ => {

	if (!getById('searchResults').classList.contains('hide')) return 'searchResultsContainer'
	else if (!getById('specialView').classList.contains('hide')) return 'specialViewTracksContainer'
	else if (settings.coverView) return 'trackList'

	return 'track_body'
}


/** 
give all permutations & combinations of array
https://stackoverflow.com/a/21557600
**/ 

function permutate (src, minLen, maxLen){

	minLen = minLen-1 || 0;
	maxLen = maxLen || src.length+1;
	var Asource = src.slice(); // copy the original so we don't apply results to the original.

	var Aout = [];

	var minMax = function(arr){
	    var len = arr.length;
	    if(len > minLen && len <= maxLen){
	        Aout.push(arr);
	    }
	}

	var picker = function (arr, holder, collect) {
		if (holder.length) {
			collect.push(holder);
		}
		var len = arr.length;
		for (var i=0; i<len; i++) {
			var arrcopy = arr.slice();
			var elem = arrcopy.splice(i, 1);
			var result = holder.concat(elem);
			minMax(result);
			if (len) {
				picker(arrcopy, result, collect);
			} else {
				collect.push(result);
			}
		}   
	}

	picker(Asource, [], []);

	return Aout;

}

/**
* Returns true if the current tracks matched the search value
*
* @param track {Object} The track Object
* @returns {boolean}
*/
function isSearched(track, query) {
	if (!query) query = getById("search").value.toLowerCase()

	if (query.length > 1) {

		let toCheck = [track.artist.name, track.title, track.album.name]

		for (let permutation of permutate(toCheck)) {
			let string = permutation.join(' ')
			if (string.toLowerCase().indexOf(query) > -1 || similarity(string, query) > 0.7) return true
		}

		return false
	}

	return true
}

/**
 * Gets the parameter by name
 *
 * @param name {string} The name
 * @param url {string} The URL containing the parameter
 * @returns {string}
 */
function getParameterByName(name, url) {
	name = name.replace(/[\[\]]/g, "\\$&")
	const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)")
	const results = regex.exec(url)

	if (!results || !results[2]) {
        return null
	}

	return decodeURIComponent(results[2].replace(/\+/g, " "))
}

/**
 * Get the hostname of an url
 * @param url {string}
 * @returns {string}
 */
function getHostname(url) {
	const l = document.createElement("a")
	l.href = url
	return l.hostname
}

/**
 * Get the full object of a track
 * @param source {Object}: the location/playlist of the track
 * @param id {String}: the id of the track
 * @returns {Object}
 */
function getTrackObject(source, id) {
	for (let i of source)
        if (i.id === id) return i

	return null
}

/**
 * Get the full object of a track list
 * @param locationString {String}: the location of the list
 * @returns {Object}
 */
function getListObject(locationString, callback) {
	let service = locationString.split(',')[0]
	let playlistId = locationString.split(',')[1]
	
	Data.findOne({ service: service, id: playlistId }, (err, listObject) => {
		callback(listObject)
	})
}

String.prototype.capitalize = function() { // Not arrow function for -this-
	return this.charAt(0).toUpperCase() + this.slice(1)
}

/**
 * Randomize an array
 * @param array {Object}: the array to randomize
 * @returns {Object}
 */
function shuffle(array) {
	let currentIndex = array.length
	let temporaryValue = null
	let randomIndex = null

	while (0 !== currentIndex) {

		randomIndex = Math.floor(Math.random() * currentIndex)
		currentIndex -= 1

		temporaryValue = array[currentIndex]
		array[currentIndex] = array[randomIndex]
		array[randomIndex] = temporaryValue
	}

	return array
}

/*
* Save settings without blocking page
*/
function asyncSaveSettings() {
	setTimeout(_=> {
		conf.set('settings', settings)	
	})
}

/**
Compare versions numbers
https://stackoverflow.com/a/6832706
*/

function compareVersions(a, b) {
    if (a === b) return 0

    var a_components = a.split(".")
    var b_components = b.split(".")

    var len = Math.min(a_components.length, b_components.length)

    // loop while the components are equal
    for (var i = 0; i < len; i++) {
        if (parseInt(a_components[i]) > parseInt(b_components[i])) return 1
        if (parseInt(a_components[i]) < parseInt(b_components[i])) return -1
    }

    if (a_components.length > b_components.length) return 1
    if (a_components.length < b_components.length) return -1

    return 0;
}

/**
 * Sort an track list object by a certain key
 * @param Array {Object}: the array to sort
 * @param key {string}: the key used to sort
 * @returns {Object}
 */
Array.prototype.sortBy = function(key, reverse) { // Don't use arrow function for the -this-

	switch (key) {

		case 'track': {
            this.sort((a, b) => {
                if (a.title < b.title)
                    return -1
                if (a.title > b.title)
                    return 1

                return 0
            })

            break
		}

		case 'artist': {
            this.sort((a, b) => {
                if (a.artist.name < b.artist.name)
                    return -1
                if (a.artist.name > b.artist.name)
                    return 1

                if (a.artist.name == b.artist.name) {
                    if (a.album.name < b.album.name)
                        return -1
                    if (a.album.name > b.album.name)
                        return 1

                    if (a.album.name == b.album.name) {
                        if (a.trackNumber < b.trackNumber)
                            return -1
                        if (a.trackNumber > b.trackNumber)
                            return 1
                    }
                }

                return 0
            })

            break
		}

		case 'time': {
            this.sort((a, b) => {
                if (a.duration < b.duration)
                    return -1
                if (a.duration > b.duration)
                    return 1

                return 0
            })

            break
		}

		case 'album': {
            this.sort((a, b) => {
                if (a.album.name < b.album.name)
                    return -1
                if (a.album.name > b.album.name)
                    return 1

                if (a.album.name == b.album.name) {
                    if (a.artist.name < b.artist.name)
                        return -1
                    if (a.artist.name > b.artist.name)
                        return 1

                    if (a.artist.name == b.artist.name) {
                        if (a.trackNumber < b.trackNumber)
                            return -1
                        if (a.trackNumber > b.trackNumber)
                            return 1
                    }
                }

                return 0
            })

            break
		}
			
		default: {
			break
		}

	}
	
	return reverse ? this.reverse() : this
}

/**
 * Converts a millisecond duration in minutes:seconds format
 * @param ms {number}: the duration in milliseconds
 * @returns {string}
 */
function msToDuration(ms) {
	let seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)

	seconds = seconds - (minutes * 60)

	if (seconds.toString().length == 1)
        seconds = '0' + seconds

	return minutes + ':' + seconds
}

/**
 * Update the small playing icon next to the playing track's name
 */
function updatePlayingIcon() {
	if (g.playing) {
		
		for (let el of document.getElementsByClassName("playingIcon")) // Remove all icons before insert new ones
			el.remove()

		let playingSongs = document.getElementsByName(g.playing.id)

		playingSongs.forEach(song => {
			
			let iconPlaying = song

			if (song.tagName === 'TR') iconPlaying = song.firstElementChild

			const iconHTML = "<span class='icon icon-play playingIcon'></span> "
			
			iconPlaying.innerHTML = iconHTML + iconPlaying.innerHTML
		})
	}
}

/**
 * Add a specific class to element(s)
 * @param id {string or Object}: the elements to add the class
 * @returns {string}
 */
function addClass(id, className) {
	if (Array.isArray(id)) {
		for (let i of id) {
			getById(i).classList.add(className)
		}
	} else if (getById(id)) {
		getById(id).classList.add(className)
	} else if (document.getElementsByName(id).length) {
		const elements = document.getElementsByName(id)
		elements.forEach(el => el.classList.add(className))
	} else if (document.getElementsByClassName(id).length) {
		const elements = document.getElementsByClassName(id)
		Array.from(elements).forEach(el => el.classList.add(className))
	}
}

/**
 * Remove a specific class from element(s)
 * @param id {string or Object}: the elements to add the class
 * @returns {string}
 */
function removeClass(id, className) {
	if (Array.isArray(id)) {
		for (let i of id) {
			getById(i).classList.remove(className)
		}
	} else if (getById(id)) {
		getById(id).classList.remove(className)
	} else if (document.getElementsByName(id).length) {
		const elements = document.getElementsByName(id)
		elements.forEach(el => el.classList.remove(className))
	} else if (document.getElementsByClassName(id).length) {
		const elements = document.getElementsByClassName(id)
		Array.from(elements).forEach(el => el.classList.remove(className))
	}
}

/***
* Converts ISO8601 time format to seconds
*/

function ISO8601ToSeconds(input) {
	const reptms = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
	let hours = 0,
		minutes = 0,
		seconds = 0,
		totalseconds

	if (reptms.test(input)) {
		const matches = reptms.exec(input)

		if (matches[1]) hours = Number(matches[1])
		if (matches[2]) minutes = Number(matches[2])
		if (matches[3]) seconds = Number(matches[3])

		totalseconds = hours * 3600 + minutes * 60 + seconds
	}

	return (totalseconds)
}


/**
 * Converts invalid artwork urls to the default one
 * @param artwork {string}
 * @returns {string}
 */
function testArtwork(artwork) {
	if (artwork && artwork.length) return artwork

    return 'file://' + __dirname + '/img/blank_artwork.png'
}

/** Calculate the similarity between 2 music titles **/
/** Taken/adapted from stackoverflow ***/

function similarity(s1, s2) {
	var longer = s1.toLowerCase().replace(/feat.*$/,"").replace(/ft.*$/,"").replace('official', '').replace('video', '').replace('music', '').replace('explicit', '').replace('hd', '').replace('hq', '').replace(/\W+/g, "")
	var shorter = s2.toLowerCase().replace(/feat.*$/,"").replace(/ft.*$/,"").replace('official', '').replace('video', '').replace('music', '').replace('explicit', '').replace('hd', '').replace('hq', '').replace(/\W+/g, "")

	if (longer.length < shorter.length) {
		let oldLonger = longer
		longer = shorter
		shorter = oldLonger
	}

	let longerLength = longer.length

	if (longer.length == 0) return 1

	var costs = new Array()

	for (var i = 0; i <= longer.length; i++) {
		var lastValue = i
		for (var j = 0; j <= shorter.length; j++) {
			if (i == 0)
				costs[j] = j
			else {
				if (j > 0) {
					var newValue = costs[j - 1]
					if (longer.charAt(i - 1) != shorter.charAt(j - 1))
					newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
					costs[j - 1] = lastValue
					lastValue = newValue
				}
			}
		}
		if (i > 0) costs[shorter.length] = lastValue
	}

	let editDistance = costs[shorter.length]

	return (longerLength - editDistance) / parseFloat(longerLength)
}

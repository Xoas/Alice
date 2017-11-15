const LinvoDB = require("linvodb3")

LinvoDB.defaults.store = { db: require("level-js") }

const Data = new LinvoDB("data", {})

Data.addPlaylist = function(playlist) { // Shortcut for services 
	playlist.id = playlist.id.toString()
	return Data.insert(playlist)
}

/*
* Play a track from a specific index (of the track list)
* @param index: the index to play / or a track dom object
*/

function playByIndex(index, parentId=getCurrentTrackListId()) {
	let temp = []

	for (let i = 0; i < trackList.length; i++) {
		let selectionIndex = parseInt(document.querySelectorAll(`#${parentId} [i='${i}']`)[0].getAttribute('s'))
		trackList[i].s = selectionIndex
		temp.push(trackList[i])
	}

	temp.sort((a, b) => { return a.s - b.s }) // Sort by selection index

	playingTrackList = temp.slice()

	updateTrackListIndexes()

	// So we increment the index of one if we played an album
	let played = false
	let currentIndex = index
	while (played == false && index < currentIndex+2) {
		for (let tr of playingTrackList)
			if (tr.s === index) {
				Player.playTrack(tr)
				played = true
				break
			}
		index++
	}

	// Change tab playing icon
	let source_icon = getById("source_icon")
	if (source_icon) source_icon.remove()

	if (getById(settings.activeTab) && ['trackList', 'track_body'].includes(parentId) )
		getById(settings.activeTab).innerHTML += "<span id='source_icon' class='icon icon-play playing'></span>"

	if (settings.shuffle) {
		playingTrackList = shuffle(playingTrackList)
		updateTrackListIndexes()
	}
}

/*
* Put tracks indexes in order corresponding to tracklist
*/

function updateTrackListIndexes() {
	let temp = playingTrackList.slice() // Evitate object reference

	for (let n = 0; n < playingTrackList.length; n++)
		temp[n].indexPlaying = n

	playingTrackList = temp.slice()
}


/*
* Toggle shuffling when playing
*/

function toggleShuffle() {

	if (settings.shuffle) {
		settings.shuffle = false
		removeClass("shuffle-btn", "active")

		playingTrackList = []
		playingTrackList.push.apply(playingTrackList, trackList)

	} else {
		settings.shuffle = true
		addClass("shuffle-btn", "active")
		playingTrackList = shuffle(playingTrackList)
	}

	updateTrackListIndexes()
}

/*
* Fill the sidebar with playlistes
*/

function renderPlaylists() {

	let selectRaw = {}
	let selectContent = ''

	Data.find({}).sort({ service: 1, icon: -1, title: 1 }).exec((err, playlists) => {

		getById('menuItems').innerHTML = ''

		for (let playlist of playlists) {
			const service = playlist.service

			if (!settings[service] || !settings[service].active || !window[service] || window[service].isGeneralPlugin) continue

			if (!getById(service)) {
				getById('menuItems').innerHTML += `
					<div id="${service}">
						<h5 class="serviceTitle">${window[service].fullName}</h5>
						<div id="${service}_playlists">
							<!-- Here come all the playlists-->
						</div>
					</div>
				`
			}

			let temp = document.createElement('span')
			temp.setAttribute("onmousedown", "changeActiveTab('" + service + "," + playlist.id + "')")
			temp.setAttribute("ondblclick", "playByIndex(0)")
			temp.setAttribute("class", "playlistTitle nav-group-item")
			temp.setAttribute("name", service)
			temp.setAttribute("id", service + "," + playlist.id)

			temp.innerHTML = "<span class='icon icon-" + (playlist.icon ? playlist.icon : 'list') + "'></span> " + playlist.title

			getById(service+"_playlists").appendChild(temp)

			selectRaw[service] += `
				<option value="${service + "," + playlist.id}">${playlist.title}</option>
			`
		}

		for (let service in selectRaw) {
			selectContent += `
				<optgroup label="${window[service].fullName}">
					${selectRaw[service]}
				</optgroup>
			`
		}

		getById('playlistSelect').innerHTML = selectContent
		getById('playlistSelect').value = settings.activeTab

		if (settings.activeTab) addClass(settings.activeTab, "active")

	})


}

function updateThemes() {
	if (settings.secondaryThemeEnabled) {
		getById('customTheme').href = settings.secondaryTheme
	} else {
		getById('customTheme').href = settings.primaryTheme
	}
}


/*
* Fired up on start or when settings are closed: puts everything in place
* @param refresh {Boolean}: Whether we want to also refresh the library
*/

function init(refresh, licenseCheck = true) {

	let firstTime = false;

	if (!conf.get("settings")) {
		console.log("First time app is launched!")

		resetSettings()

		licenseCheck = false
		firstTime = true

		remote.dialog.showMessageBox({
			type: 'info',
			title: 'Integrated plugins',
			message: "Some plugins integrated in Harmony may result in a break of some terms & conditions depending on your country and usage. \n\nThese plugins may be removed in the future from Harmony. \n\nThe concerned plugins are: Spotify, Google Play Music, Deezer & YouTube.\n\n",
			buttons: ['Agree']
		},
			(btnIndex) => {
			if (btnIndex === 0) openServices()
		})

	} else {
		settings = conf.get("settings")
	}

	// For the settings
	updateSettings()
	refreshThemes()

	updateThemes()

	Data.find({}, (err, playlists) => { // Get all playlists, from all services

		if (playlists.length) {
			renderPlaylists()
		} else { 
			console.log('Data not found. Fetching data.')

			refresh = true
		}

		let noActiveServices = true

		for (let s of services) {

			if (settings[s].active) {
				noActiveServices = false

				if (typeof window[s].appStarted === 'function')
					window[s].appStarted() // Plugin function, for init stuff

			}
		}

		if (settings.activeTab) changeActiveTab(settings.activeTab)

		testInternet(licenseCheck, settings.checkUpdate)

		if (refresh || settings.refreshOnStart) return getData(false, false)
	})
}


/*
* Fetch the data and refresh the tracklist
*/

function getData(licenseCheck, internetCheck = true) {

	Data.remove({ }, { multi: true }) // Empty current data

	addClass("refreshBtn", "spinning")

	removeClass(['refreshStatus', 'statusRefresh'], 'hide')
	addClass(["fullscreen_offline", 'statusError', 'statusOffline', 'statusLonger'], 'hide')

	function refresh(retryTimer) {
		if (offline) {
			for (let s of services) addClass(s, "hide") // Hide everything but local tracks if offline
			removeClass("local", "hide")

			addClass(["fullscreen_loading", 'statusRefresh'], "hide")
			removeClass("refreshBtn", "spinning")

			removeClass('statusOffline', 'hide')

			clearTimeout(retryTimer)

			if (!settings.local.active) {
				removeClass("fullscreen_offline", "hide")
				//openServices()
			} else {
				window["local"].fetchData().then(() => {
					console.log("No internet, local fetched")

					changeActiveTab('local,library')
					addClass("fullscreen_offline", "hide")

				}).catch((err) => {
					if (err[1]) openServices()
					removeClass("fullscreen_offline", "hide")
				})
			}
		} else {

			let fn = (v) => {
				if (settings[v].active && typeof window[v].fetchData === 'function')
					return window[v].fetchData()
			}

			///// USE ALL FETCHDATA FUNCTIONS FROM ALL SERVICES
			Promise.all(services.map(fn)).then(() => {

				console.log("Fetching services data over.")

				conf.set('settings', settings) // Save settings

				renderPlaylists()

				renderView()

				addClass(["fullscreen_loading", 'refreshStatus'], "hide")
				removeClass("refreshBtn", "spinning")

				clearTimeout(retryTimer)

			}).catch((err) => {
				
				if (Array.isArray(err))
					console.error("Error fetching data.", err[0])
				else
					console.error("Error fetching data.", err)

				addClass("fullscreen_loading", "hide")
				removeClass("refreshBtn", "spinning")

				addClass('statusRefresh', 'hide')
				removeClass('statusError', 'hide')

				clearTimeout(retryTimer)

				if (err[1]) openServices() // Probably an auth error, opening settings to tell the user to re-log

			})
		}
	}


	///// SHOW RETRY TEXT AFTER 60S
	let retryTimer = setTimeout(() => {
		removeClass("statusLonger", "hide")
	}, 100000)

	if (internetCheck) testInternet(licenseCheck, false, () => { refresh(retryTimer) })
	else refresh(retryTimer)


}

/*
* Change current playlist
* @param {String} activeTab: the playlist to change to
*/

function changeActiveTab(activeTab) {
	getById('playlistSelect').value = activeTab // Update the select

	removeClass(settings.activeTab, "active")
	addClass(activeTab, "active")

	setTimeout(() => { // Async so it doesn't block the activetab changing process on loading large lists
		hideSpecialView()

		getById("search").value = "" // Reset search

		if (settings.activeTab != activeTab) {
			g.selected = []

			settings.activeTab = activeTab

			getById("track_body").scrollTop = 0 // If the user scrolled, go back to top
			getById("trackList").scrollTop = 0 // For coverView
		}

		renderView('none')
	})
}


function resetSearch(soft) {
	// In case we were in small mode
	removeClass('searchBar', 'expanded')
	removeClass('playlistSelectDiv', 'hide')
	addClass('searchResults', 'hide')
	removeClass('search', 'globalSearch')

	if (tmpSearchTrackList) trackList = tmpSearchTrackList
	tmpSearchTrackList = null

	if (!getById("search").value.length) return
	if (!soft) getById('search').value = ''

	renderView()
	g.globalSearch = false
}

/*
* Performs search 
* @param service {String}: the service id to performs the search's with
*/

function search(service, global) {

	const query = getById("search").value

	if (global) g.globalSearch = true

	if (!g.globalSearch) return renderView(null, query)
	
	if (query.length < 2) return resetSearch(true)

	if (offline) service = 'local'

	let searchServices = []
	if (!offline) 
		for (let s of services)
			if (settings[s].active && typeof window[s].searchTracks === 'function')
				searchServices.push(s)

	let serviceToUse = searchServices.includes(service) ? service : searchServices[0]

	if (!serviceToUse) return g.globalSearch = false

	addClass('search', 'globalSearch')

	renderView() // To restore the view if previously filtered

	getById('searchResultsServices').innerHTML = ""
	for (let s of searchServices)
		getById('searchResultsServices').innerHTML += `<span onclick="search('${s}')">${window[s].fullName} ${(s === serviceToUse ? '▼' : '')}<span style='background: ${window[s].color}'></span></span>`

	if (getById('searchResults').classList.contains('hide')) tmpSearchTrackList = trackList

	removeClass('searchResultsLoading', 'hide')
	addClass(['searchResultsContainer', 'searchResultsEmpty'], 'hide')

	toggleDropup('searchResults', resetSearch, getById("searchBar")) // Show the results div

	window[serviceToUse].searchTracks(query, (tracks, confirmation) => {
		addClass('searchResultsLoading', 'hide')

		if (!tracks.length) return removeClass('searchResultsEmpty', 'hide')
		else removeClass('searchResultsContainer', 'hide')

		trackList = tracks

		if (query === confirmation) renderCoverview('searchResultsContainer', tracks, true)

		getById("searchResultsContainer").scrollTop = 0 // Scroll back top
	})
}

/*
* The special view for search & special things like albums/artists
* @param tracks {Object}: list of track to render
* @param type {String}: the type of tracklist we are rendering (artist, album, search, ...)
* @param title {String}: the tracklist we are rendering (album name, search content, ...)
* @param image {String}: the image of the tracklist we are rendering (album cover, ...)
*/

function specialView(service, tracks, type, title, image) {

	if (getById('specialView').classList.contains('hide')) tmpSpecialviewTrackList = trackList // So we don't assign oldTracklist to a special view's tracklist
	trackList = tracks

	addClass('trackList', 'hide')
	removeClass('specialView', 'hide')
	removeClass('specialViewImage', 'hide')

	if (image) getById('specialViewImage').src = image
	else getById('specialViewImage').src = 'img/blank_artwork.png'

	getById('specialViewTitle').innerHTML = type.capitalize() +': '+ (title == '' ? 'Unknown' : title)
	getById("specialViewTracks").innerHTML = ""

	addClass('specialViewEmpty', 'hide')
	addClass('specialViewTracksContainer', 'hide')
	addClass('specialViewLoading', 'hide')

	// So we can call the function with tracks = loading to show the spinner
	if (tracks == 'loading') return removeClass('specialViewLoading', 'hide')
	else if (!tracks.length) return removeClass('specialViewEmpty', 'hide')
	else removeClass('specialViewTracksContainer', 'hide')

	renderListview('specialViewTracks')

}

/*
* Hide the special view
*/

function hideSpecialView() {
	addClass('specialView', 'hide')
	removeClass('trackList', 'hide')

	if (tmpSpecialviewTrackList) {
		trackList = tmpSpecialviewTrackList
		tmpSpecialviewTrackList = null
	}
}


/**
 * Render the coverlist
 * @param divId {String}: the id of the div where to render tracklist
 */

function renderCoverview(divId, toRender=trackList, noAlbums=settings.coverViewNoAlbums) {
	getById(divId).innerHTML = ""

	albums = []

	let noDuration = true
	for (let track of toRender) {
		if (track.duration) {
			noDuration = false
			break
		}
	}

	let decalage = 0 // Used to account for decalage occured by albums (non)

	for (let i = 0; i < toRender.length; i++) {

		let track = toRender[i]

		if (albums.includes(track.album.id)) {
			decalage -= 1
			continue // Track already rendered in album
		}

		let diffed = i+decalage

		let tempAlbum = []

		if (!noAlbums) {
			for (let t = 0; t < toRender.length; t++)
				if (toRender[t].album.id === track.album.id && (track.album.id != '' || track.artist.id == '')) {
					toRender[t].i = t
					tempAlbum.push(toRender[t])
				}
		}

		if (tempAlbum.length <= 1) {

			let tempDiv = `
				<div i='${i}' class='coverElement' s='${diffed}' name='${track.id}' oncontextmenu='trackContextMenu(event, ${diffed})' onmousedown='selectIndex(event, ${diffed})' ondblclick='playByIndex(${diffed})'>
					<img src='${testArtwork(track.artwork)}' onerror="this.onerror=null;this.src='img/blank_artwork.png'"/>
					<h3>${track.title}</h3>
					<h4>${track.artist.name == '' ? 'Unknown artist' : track.artist.name}</h4>
					<span class='duration'>${msToDuration(track.duration)}</span>
				</div>
			`

			getById(divId).insertAdjacentHTML('beforeend', tempDiv)

		} else {

			albums.push(track.album.id)

			let tempDiv = `
				<div i='${i}a' class='coverElement' s='${diffed}' name='${track.album.id}' onmousedown='selectIndex(event, ${diffed})' ondblclick='playByIndex(${diffed+1})'>
					<img src='${testArtwork(track.artwork)}'/>
					<h3>${track.album.name == '' ? 'Unknown album' : track.album.name}</h3>
					<h4>${track.artist.name == '' ? 'Unknown artist' : track.artist.name}</h4>
					<span class='duration'>${tempAlbum.length} tracks</span>
				</div>

				<table class='albumContent' id='tempAlbum_${track.album.id}'></table>
			`
			
			getById(divId).insertAdjacentHTML('beforeend', tempDiv)

			renderListview('tempAlbum_'+track.album.id, tempAlbum, diffed, 1, decalage)

			decalage += (tempAlbum.length > 1 ? tempAlbum.length : 1)

		}

	}

	updatePlayingIcon()

	if (noDuration) addClass('duration', 'hide')
	else removeClass('duration', 'hide')
}



/**
* Render the tracklist in  the basic list form
* @param divId {String}: the id of the div where to render tracklist
*/

function renderListview(divId, toRender=trackList, startIndex=0, album=false, decalage=0) {

	getById(divId).innerHTML = ""

	let noAlbums = true
	for (let track of toRender) {
		if (track.album.name.length) {
			noAlbums = false
			break
		}
	}

	let noDuration = true
	for (let track of toRender) {
		if (track.duration) {
			noDuration = false
			break
		}
	}

	let tempData = ''

	for (let i = 0; i < toRender.length; i++) {

		let index = i+startIndex
		let track = toRender[i]
		let trackListIndex = (track.i ? track.i : index-decalage)

		let diffed = (album ? index+1 : index)

		// i / index represents the position of the track in the playlist
		// s / selection represents the position of the track with all the other tracks

		tempData += `<tr i='${trackListIndex}' class='listTrack' s='${diffed}' name='${track.id}' oncontextmenu='trackContextMenu(event, ${diffed})' onmousedown='selectIndex(event, ${diffed})' ondblclick='playByIndex(${diffed})'>
						<td>${track.title}</td>
						<td class='artist'>${track.artist.name == '' ? 'Unknown artist' : track.artist.name}</td>
						<td name='albumCol'>${track.album.name == '' ? 'Unknown' : track.album.name}</td>
						<td class='duration'>${msToDuration(track.duration)}</td>
					</tr>`

	}

	getById(divId).insertAdjacentHTML('beforeend', tempData)

	if (noAlbums) addClass('albumCol', 'hide')
	else removeClass('albumCol', 'hide')

	if (noDuration) addClass('duration', 'hide')
	else removeClass('duration', 'hide')

	updatePlayingIcon()
}

/*
* Render the tracks, use coverview or basic listview
* @param {string} key: the sorting key
*/

function renderView(key, query) {
	if (!settings.activeTab) return

	let reverse = false

	if (!key) { // No key was specified so we continue as previously
		key = getById('sortingIndicator') ? getById('sortingIndicator').parentElement.id : 'none'
		reverse = (getById('sortingIndicator') && getById('sortingIndicator').classList.contains(`icon-up-dir`))
	} else if (document.querySelector(`#${key} #sortingIndicator`)) {
		if (getById('sortingIndicator').classList.contains('icon-down-dir')) reverse = true
		else if (getById('sortingIndicator').classList.contains('icon-up-dir')) key = 'none' // We reset the filtering
	}

	getListObject(settings.activeTab, listObject => {

		if (query && query.length) {
			let temp = []
			for (let tr of listObject.tracks)
				if (isSearched(tr)) temp.push(tr)
			listObject.tracks = temp
		}

		if (!listObject || !listObject.tracks.length) {
			trackList.length = 0;
			removeClass("empty_tracklist", "hide")
			addClass("trackListTable", "hide")
			addClass("coverView", "hide")
			return
		} 

		trackList = listObject.tracks.slice() // To remove links with the original array

		if (key) trackList = trackList.sortBy(key, reverse)

		addClass("empty_tracklist", "hide")

		getById('coverView').innerHTML = ''
		getById('track_body').innerHTML = ''

		if (settings.coverView) {
			removeClass("coverView", "hide")
			addClass("trackListTable", "hide")

			renderCoverview('coverView')
		} else {
			removeClass("trackListTable", "hide")
			addClass("coverView", "hide")

			renderListview('track_body')
		}

	})

	if (getById('sortingIndicator')) getById('sortingIndicator').remove()
	if (getById(key)) getById(key).innerHTML +=  ` <span class='icon icon-${reverse ? 'up' : 'down'}-dir' id='sortingIndicator'></span>`
}


/**
* Select a track in the list to control it with arrows and enter to play
* @param index {Int}: the index of the track to selct
*/

function selectIndex(e, index, parentId=getCurrentTrackListId()) {
	if (e && e.which !== 1) return // We keep only clicks coming from left mouse button

	// Remove the select class from the previously selected track
	if (g.selected && g.selected.length)
		for (let i of g.selected) {
			document.querySelectorAll(`[s='${i}']`).forEach( track => {
				track.classList.remove('selected')
			})
		}

	let indexes = [index]

	if (e && e.shiftKey) {
		indexes = []
		let lastSelected = g.selected[g.selected.length-1]

		if (lastSelected < index)
			for (let i = lastSelected; i <= index; i++)
				indexes.push(i)
		else
			for (let i = lastSelected; i >= index; i--)
				indexes.push(i)

	}

	if (e && (e.ctrlKey || e.metaKey)) { // Ctrl key with the click: selection is added

		indexesCopy = []

		for (let i of indexes) {
			let iIndex = g.selected.indexOf(i) 
			if (iIndex > -1 && !e.shiftKey) g.selected.splice(iIndex, 1) // If it was previously selected then unselect it
			else indexesCopy.push(i)
		}

		g.selected = g.selected.concat(indexesCopy)

	} else {

		g.selected = indexes
	}

	g.selected = Array.from(new Set(g.selected)) // remove duplicates, es6 way

	// Add the select class to the track to select
	for (let i of g.selected) {
		document.querySelectorAll(`#${parentId} [s='${i}']`).forEach( track => {
			track.classList.add('selected')
		})
	}

}


/*
* Handle double click on header to maximize
*/

function toggleMaximize(e) {

	if (e.target.id !== 'header') return

	if (BrowserWindow.getFocusedWindow().isMaximized()) BrowserWindow.getFocusedWindow().unmaximize() 
	else BrowserWindow.getFocusedWindow().maximize()
}


/*
* Open volume dropdowns (bottom bar)
* @param {string} id: the id of the element to show
*/

function toggleDropup(id, callback=null, excluded=null) {
	if (!getById(id).classList.contains('hide')) return

	removeClass(id, 'hide')

	function handler(event) { // we have to use a named function, or it wont unregister
		if (getById(id).contains(event.target) || event.target == excluded || (excluded && excluded.contains(event.target) )) return
		addClass(id, 'hide')

		if (callback) callback()

		document.removeEventListener('mousedown', handler)
	}

	document.addEventListener('mousedown', handler)
}

/*
* Open the settings
*/

function openServices() {
	conf.set('settings', settings)
	let servicesWin = new BrowserWindow({
		title: 'Services (Auto saved)',
		width: 350,
		height: 530,
		resizable: false,
		show: true,
		nodeIntegration: true
	})
	servicesWin.setMenu(null)
	servicesWin.loadURL('file://' + __dirname + '/services.html')
	//servicesWin.webContents.openDevTools()
	servicesWin.on('close', () => {
		init(true, false)
	}, false)
}


//////////////////////////////
//     When we start      ///
////////////////////////////

init()

if (settings.shuffle) addClass("shuffle-btn", "active")

getById("volume_range").value = settings.volume
volume()

Data.on('inserted', _ => { // Every time a playlist is added to library
	renderPlaylists()
	renderView()
})

Data.on('updated', _ => { // Every time a playlist is updated
	renderPlaylists()
	renderView()
})

//////////////////////////////
//     When we close      ///
////////////////////////////

window.onbeforeunload = function (e) { 
	conf.set('settings', settings)
}
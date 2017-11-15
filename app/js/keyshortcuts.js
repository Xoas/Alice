/*** General controls ***/

Mousetrap.bind(['shift+down', 'down'], e => {

	if (!g.selected || !g.selected.length) return

	let lastSelected = g.selected[g.selected.length-1]
	
	let f = {which: 1, ctrlKey: e.shiftKey, shiftKey: e.shiftKey}  // Force to keep previous selection when shift is pressed

	let parentId = getCurrentTrackListId()

	let nextEl = document.querySelectorAll(`#${parentId} [s='${lastSelected+1}']`)[0]

	if (!nextEl) return

	selectIndex(f, lastSelected+1, parentId)

	let visible = visibleArea(parentId, nextEl)[0]

	if (visible <= 0) getById(parentId).scrollTop -= visible

	e.preventDefault()
	
});

Mousetrap.bind(['shift+up', 'up'], e => {

	if (!g.selected || !g.selected.length) return

	let lastSelected = g.selected[g.selected.length-1]

	if (lastSelected <= 0) return
	let f = {which: 1, ctrlKey: e.shiftKey, shiftKey: e.shiftKey}  // Force to keep previous selection when shift is pressed

	let parentId = getCurrentTrackListId()

	let prevEl = document.querySelectorAll(`#${parentId} [s='${lastSelected-1}']`)[0]

	selectIndex(f, lastSelected-1, parentId)

	let visible = visibleArea(parentId, prevEl)[1]

	if (visible <= 0) getById(parentId).scrollTop += visible;

	e.preventDefault()
});

Mousetrap.bind('enter', e => {
	if (!g.selected || !g.selected.length) return

	let parentId = getCurrentTrackListId()

	if (g.selected.length > 1) {

		let copy = g.selected.slice();
		copy.sort((a, b) => {return a - b})
		
		playingTrackList = []

		for (let i of copy) {
			let trueIndex = parseInt(document.querySelectorAll(`#${parentId} [s='${i}']`)[0].getAttribute('i'))
			playingTrackList.push(trackList[trueIndex])
		}

		updateTrackListIndexes()

		Player.playTrack(playingTrackList[0])

	} else {

		// Necessary to be able to play albums :/
		let trueIndex = document.querySelectorAll(`#${parentId} [s='${g.selected[0]}']`)[0].getAttribute('i').replace('a', '')
		let newIndex = parseInt(document.querySelectorAll(`#${parentId} [i='${trueIndex}']`)[0].getAttribute('s'))

		playByIndex(newIndex, parentId)

	}
	
	e.preventDefault()

});


// Select all tracks
Mousetrap.bind('mod+a', e => {
	g.selected = [0]
	let f = {which: 1, shiftKey: true} // Simulate shift key to select all
	const lastIndex = trackList.length-1
	selectIndex(f, lastIndex)
});

// Focus search bar
Mousetrap.bind('mod+f', e => {
	getById("search").focus()
});

// Toggle Sidebar
Mousetrap.bind('mod+k', e => {
	if (getById('sidebar').classList.contains('hide')) removeClass('sidebar', 'hide')
	else addClass('sidebar', 'hide')

	e.preventDefault();
});

//// Toggle secondary theme (by default dark mode)
Mousetrap.bind('mod+d', e => {

	addClass('app', 'changeTheme'); // Show a fluid transition using CSS3 transitions

	if (settings.secondaryThemeEnabled) {
		settings.secondaryThemeEnabled = false
		getById('customTheme').href = settings.primaryTheme
	} else {
		settings.secondaryThemeEnabled = true
		getById('customTheme').href = settings.secondaryTheme
	}

	setTimeout(_=> {
		removeClass('app', 'changeTheme')
	}, 1000)

	e.preventDefault()

});

// Refresh library
Mousetrap.bind('mod+r', e => {
	getData()
	e.preventDefault()
});

// Show all available shortcuts
Mousetrap.bind('?', e => {
	if (getById('availableShortcuts').classList.contains('show')) {
		getById('availableShortcuts').classList.remove('show')
	} else {
		getById('availableShortcuts').classList.add('show')

		function handler() {
			getById('availableShortcuts').classList.remove('show')
			document.removeEventListener('click', handler)
		}

		document.addEventListener('click', handler)

	}
	
	//getById('availableShortcuts').classList[getById('availableShortcuts').classList.contains('show') ? 'remove' : 'add']('show')

	e.preventDefault()
});

/*** Player controls ***/

Mousetrap.bind('space', e => {
	Player.playPause()
	e.preventDefault()
});

Mousetrap.bind('l', e => {
	Player.FavPlaying()
	e.preventDefault()
});

Mousetrap.bind(['mod+right','n'], e => {
	Player.nextTrack()
	e.preventDefault()
});

Mousetrap.bind(['mod+left','p'], e => {
	Player.prevTrack()
	e.preventDefault()
});

/* add tracks to current playing playlist */
Mousetrap.bind('q', e =>{
	if (g.selected.length === 0) return

	let parentId = getCurrentTrackListId()

	let copy = g.selected.slice();
	copy.sort((a, b) => {return a - b})

	let tempTracks = []

	for (let i of copy) {
		let trueIndex = parseInt(document.querySelectorAll(`#${parentId} [s='${i}']`)[0].getAttribute('i'))
		let copyNoRef = JSON.parse(JSON.stringify(trackList[trueIndex]))
		tempTracks.push(copyNoRef)
	}

	let args = [g.playing.indexPlaying+1, 0].concat(tempTracks)
	Array.prototype.splice.apply(playingTrackList, args)

	updateTrackListIndexes()

	new Notification('Tracks added', {
		'silent': true,
		'body': 'Selection will play next.',
		'origin': 'Harmony'
	})

	e.preventDefault()
})

/*** Toggle developper tools  **/

Mousetrap.bind('mod+alt+i', e => {
	remote.getCurrentWindow().toggleDevTools()
	e.preventDefault()
});

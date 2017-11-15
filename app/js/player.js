const scrub = getById('playerProgressContainer')
let confirmId
let playPauseIcon = getById("playpauseIcon").classList
let g = window.g

/**
 * Player class
 */
class Player {

	/**
	 * Play the next track
	 */
	static nextTrack () {
		let index = g.playing.indexPlaying + 1
		const isLastTrack = index == playingTrackList.length
		const parentId = getCurrentTrackListId()
		let nextTrack = (isLastTrack ? playingTrackList[0] : playingTrackList[index])

		Player.playTrack(nextTrack)

		// We restart playlist
		if (isLastTrack) {

			getById(parentId).scrollTop = 0

		} else if (!settings.shuffle) {
			// So it scroll with tracks if shuffle isn't on

			let selIndex = parseInt(document.querySelectorAll(`#${parentId} [i='${index}']`)[0].getAttribute('s'))
			let el = document.querySelectorAll(`#${parentId} [s='${selIndex}']`)[0]	
			
			if (el.getAttribute('name') === nextTrack.id) { // Make sure the next element IS the next track (not the case if we changed activetab)
				let visible = visibleArea(parentId, el)[0]
				if (visible <= 0) getById(parentId).scrollTop -= visible
			}
		}
	}

	/**
	 * Play the previous track
	 */
	static prevTrack () {
		let prevTrack = playingTrackList[g.playing.indexPlaying - 1]
		const isFirstTrack = g.playing.indexPlaying == 0

		// We restart the song
		if (isFirstTrack) {
			prevTrack = g.playing
		}

		Player.playTrack(prevTrack)
	}


	/**
	 * Play a given track.
	 *
	 * @param track {Object} The track object
	 */
	static playTrack (track) {
		track.artwork = testArtwork(track.artwork)

		const windowIsFocused = remote.getCurrentWindow().isFocused()

		getById("playerTrackTitle").innerHTML = track.title
		getById("playerTrackTitle").setAttribute('title', track.title)
		getById("playerTrackArtist").innerHTML = track.artist.name
		getById("playerTrackCover").src = track.artwork

		getById('player').pause()
		getById('player').currentTime = 0
		getById('player').src = ""

		g.playing = track
		 
		Player.isInFavorites(track, res => {
			g.playing.favorited = res

			if (res) addClass("playerFavBtn", "active")
			else removeClass("playerFavBtn", "active")
		})


		let streamObtained = (err, streamUrl, id) => {
			if (g.playing.id === id) { // We make sure the returned stream url corresponds to the track we asked, useful when fast zapping tracks
				
				if (err) {
					console.error(err)
					return Player.nextTrack()
				}

				getById('player').src = streamUrl
				getById('player').load()
				getById('player').play()
			}
		}

		if (typeof window[track.service].getStreamUrl === 'function') {
			window[track.service].getStreamUrl(track, streamObtained )
		} else {
			if (services.includes('youtube'))
				window['youtube'].getStreamUrl(track, streamObtained) // Uses YouTube to get streamurl (spotify, deezer)
			else
				return alert('Please install the YouTube plugin to play this track.')
		}

		playPauseIcon.remove("icon-play")
		playPauseIcon.add("icon-pause")
		updatePlayingIcon()

		addClass("playingIcon", "blink")

		if (!windowIsFocused && !settings.notifOff) {
			new Notification(track.title, {
				silent: true,
				body: 'By ' + track.artist.name,
				icon: track.artwork,
				tag: 'Harmony-playTrack',
				origin: 'Harmony'
			})
		}

		ipcRenderer.send('track:start')
		ipcRenderer.send('change:song', track)

		const scrobblingEnabled = window[track.service].scrobbling

		if (scrobblingEnabled)
			for (let s of services)
				if (settings[s].active && (s === track.service || window[s].isGeneralPlugin) && typeof window[s].onTrackPlay === 'function' )
					window[s].onTrackPlay(track) // Only last.fm as of now

	}

	/**
	 * Toggle play or pause.
	 */
	static playPause () {

		/** Should really convert this into using pub/sub **/
		if (getById('player').paused) {
			getById('player').play()
			if (g.playing) {
				playPauseIcon.remove("icon-play")
				playPauseIcon.add("icon-pause")
			} else {
				playByIndex(0)
			}

			ipcRenderer.send('change:playback', true)
			ipcRenderer.send('track:start')
		} else {
			getById('player').pause()
			playPauseIcon.remove("icon-pause")
			playPauseIcon.add("icon-play")

			ipcRenderer.send('change:playback', false)
			ipcRenderer.send('track:end')
		}

	}

	/**
	 * Returns whether track is in favorites
	 *
	 * @param track {Object} The track object
	 * @returns {boolean} True if the track is in favorites
	 */
	static isInFavorites (track, callback) {
		const favsLocation = window[track.service].favsLocation

		if (!favsLocation) {
			addClass('playerFavBtn', 'hide')
			return false
		} else removeClass('playerFavBtn', 'hide')

		getListObject(favsLocation, favsList => {
			
			if (!favsList || !favsList.tracks) return callback(false)

			for (let t of favsList.tracks)
				if (t.id == track.id)
					return callback(true)

			callback(false)

		})

	}

	/**
	 * Add or unadd currently playing track from favorites
	 *
	 * @param onlyFav {boolean} True if we only wants to like the track and not unlike it even if already a favorite
	 */
	static FavPlaying (onlyFav) {

		const favsLocation = window[g.playing.service].favsLocation

		getListObject(favsLocation, favsList => {

			let playing = g.playing
			let notificationTitle = 'Track liked'

			if (!playing.favorited) {

				favsList.tracks.unshift(playing)

				playing.favorited = true
				addClass("playerFavBtn", "active")

				favsList.save(_=> {

					window[playing.service].like(playing, err => {

						if (!err) return

						console.error(err)

						new Notification('Error liking track', {
							'body': err,
							'tag': 'Harmony-Error',
							'origin': 'Harmony'
						})
					})

					if (settings.activeTab === window[g.playing.service].favsLocation) renderView() // Update current tab
				})

			} else if (onlyFav){

				notificationTitle = 'Track already liked'

			} else {

				favsList.tracks.splice(
					favsList.tracks.indexOf(
						getTrackObject(favsList.tracks, playing.id)
					), 
				1)

				playing.favorited = false
				removeClass("playerFavBtn", "active")

				favsList.save(_=> {
					window[playing.service].unlike(playing, (err) => {
						if (!err) return

						console.error(err)

						new Notification('Error unliking track', {
							'body': err,
							'tag': 'Harmony-Error',
							'origin': 'Harmony'
						})
					})
					if (settings.activeTab === window[g.playing.service].favsLocation) renderView() // Update current tab
				})

				notificationTitle = 'Track unliked'
			}

			new Notification(notificationTitle, {
				'silent': true,
				'body': playing.title,
				'icon': playing.artwork,
				'tag': 'Harmony-Like',
				'origin': 'Harmony'
			})

		})
		
	}

}


function volume () {
	const value = getById("volume_range").value
	settings.volume = getById('player').volume = parseFloat(value).toFixed(1)

	if (value > 0.6) {
		removeClass(['volume3', 'volume2', 'volume1'],'hide')
		removeClass('volumeBase', 'red')
	} else if (value <= 0.6 && value > 0.2) {
		addClass('volume3', 'hide')
		removeClass(['volume2', 'volume1'], 'hide')
		removeClass('volumeBase', 'red')
	} else if (value > 0) {
		addClass(['volume3', 'volume2'], 'hide')
		removeClass('volume1', 'hide')
		removeClass('volumeBase', 'red')
	} else {
		addClass(['volume3', 'volume2', 'volume1'],'hide')
		addClass('volumeBase', 'red')
	}
}

/**** Use YouTube to obtain a stream url ***/


ipcRenderer.on('control:nextTrack', (event, arg) => {
	Player.nextTrack()
})

ipcRenderer.on('control:prevTrack', (event, arg) => {
	Player.prevTrack()
})

ipcRenderer.on('control:playPause', (event, arg) => {
	Player.playPause()
})

ipcRenderer.on('control:favPlaying', (event, arg) => {
	Player.FavPlaying(true)
})

/*
* Static properties
*/

getById('player').addEventListener('timeupdate', () => {
	const mins = Math.floor(getById('player').currentTime / 60,10)
	const secs = Math.floor(getById('player').currentTime, 10) - mins * 60
	const pos = (getById('player').currentTime / getById('player').duration) * 100


  	if ( !isNaN(mins) || !isNaN(secs) ) 
		getById('playerCurrentTime').innerHTML = mins + ':' + (secs > 9 ? secs : '0' + secs)

	getById('playerProgressBar').style.transform = 'translateX(' + pos + '%)'
})

getById('player').addEventListener('progress', () => {
	try {
		const Bufpos = (getById('player').buffered.end(0) / getById('player').duration) * 100
		getById('playerBufferBar').style.transform = 'translateX(' + Bufpos + '%)'
	} catch (e) {}
})

getById('player').addEventListener('canplaythrough', () => removeClass("playingIcon", "blink"))

/**
 * Scrubs the player progress bar.
 *
 * @param e {Event} The mouse event
 */
function scrubTimeTrack (e) {
	const scrubWidth = parseFloat(window.getComputedStyle(scrub).width)
	const percent = (e.offsetX / scrubWidth)
	const seek = percent * getById('player').duration

	if (getById('player').networkState === 0 || getById('player').networkState === 3)
		console.error("Oups, can't play this track")

	if (getById('player').readyState > 0) {
		getById('playerProgressBar').style.transform = 'translateX(' + percent * 100 + '%)'
		getById('player').currentTime = parseInt(seek, 10)
	}
}

scrub.addEventListener('mousedown', e => {
	scrub.addEventListener('mousemove', scrubTimeTrack)
	getById('player').pause() // For smoothness on drag
	playPauseIcon.remove("icon-pause")
	playPauseIcon.add("icon-play")
	scrubTimeTrack(e) // For fast click event
})

scrub.addEventListener('mouseup', _ => {
	scrub.removeEventListener('mousemove', scrubTimeTrack)
	getById('player').play()
	playPauseIcon.add("icon-pause")
	playPauseIcon.remove("icon-play")
})

getById('player').addEventListener('loadeddata', _ => {
	const mins = Math.floor(getById('player').duration / 60,10),
    	secs = Math.floor(getById('player').duration, 10) - mins * 60

    if ( !isNaN(mins) || !isNaN(secs) ) {
        getById('playerDuration').innerHTML = mins + ':' + (secs > 9 ? secs : '0' + secs)
        getById('playerCurrentTime').innerHTML = '0:00'
    }
})

getById('player').addEventListener('ended', _ => {

	ipcRenderer.send('track:end')
	const scrobblingEnabled = window[g.playing.service].scrobbling

	if (scrobblingEnabled)
		for (let s of services)
			if (settings[s].active && (s === g.playing.service || window[s].isGeneralPlugin) && typeof window[s].onTrackEnded === 'function' )
				window[s].onTrackEnded(g.playing) // Only last.fm as of now

	playPauseIcon.remove("icon-pause")
	playPauseIcon.add("icon-play")

	getById('player').currentTime = 0

	Player.nextTrack()
})

/////////////////////////////////////////////
// When we start
/////////////////////////////////////////////

playPauseIcon.add("icon-play")

g.playing = null

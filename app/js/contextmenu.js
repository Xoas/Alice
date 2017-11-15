const basicContext = require('./js/vendor/basicContext.min.js')
let tracks

function trackContextMenu(e, i, toHandle=null) {

		if (!g.selected.includes(i)) selectIndex(null, i)

		if (!toHandle) {

			tracks = []

			let parentId = getCurrentTrackListId()

			for (let i of g.selected) {
				let trueIndex = document.querySelectorAll(`#${parentId} [s='${i}']`)[0].getAttribute('i')
				let copyNoRef = JSON.parse(JSON.stringify(trackList[trueIndex]))
				tracks.push(copyNoRef)
			}
			
		} else tracks = toHandle

		const trackAlone = (tracks.length == 1)
		const tracksService = tracks[0].service

		let addToPlaylistEnabled = (typeof window[tracksService].addToPlaylist === 'function')
		
		if (addToPlaylistEnabled) {
			Data.findOne({service: tracksService, editable: true}, (err, pl) => {
				if (!pl) addToPlaylistEnabled = false
			})
		}

		getListObject(settings.activeTab, currentPlaylist => {

			let removeFromPlaylistEnabled = (typeof window[tracksService].removeFromPlaylist === 'function' && currentPlaylist.editable)

			let extItems = []

			for (let s of services) {

				if ( (s === tracksService || window[s].isGeneralPlugin) && (window[s].contextmenuItems && window[s].contextmenuItems.length) ) {

					let items = window[s].contextmenuItems // Remove reference

					for (let i of items) {
						let copy = Object.create(i) // Copy object

						copy.disabled = (!copy.allowMultipleTracks && !trackAlone)

						extItems.push(copy)
					}

					extItems.push({}) //Separator
				}
			}

			let items = [

				{ title: 'Play next', fn: () => {

					let args = [g.playing.indexPlaying+1, 0].concat(tracks)
					Array.prototype.splice.apply(playingTrackList, args)

					updateTrackListIndexes()

				} },

				{ } // Separator
			]

			items = items.concat(extItems).concat([

				{ title: 'Add to playlist', disabled: !addToPlaylistEnabled, fn: () => {
					if (!addToPlaylistEnabled) return

					Data.find({service: tracksService, editable: true}, (err, playlists) => {
						plItems = []

						for (let pl of playlists)
							plItems.push({ title: pl.title, fn: addToPlaylist(tracks, pl) })

						basicContext.show(plItems, e)

					})

			
				} },

				{ title: 'Remove from playlist', disabled: !removeFromPlaylistEnabled, fn: () => {
					if (!removeFromPlaylistEnabled) return

					for (let tr of tracks) {
						currentPlaylist.tracks.splice(
							currentPlaylist.tracks.indexOf(
								getTrackObject(currentPlaylist.tracks, tr.id)
							), 
						1)
					}

					currentPlaylist.save(_=> {
						window[tracks[0].service].removeFromPlaylist(tracks, currentPlaylist.id, err => {

							if (!err) return

							console.error(err)

							new Notification('Error removing track to playlist', {
								body: err,
								tag: 'Harmony-Error',
								origin: 'Harmony'
							})
							
						})

						changeActiveTab(settings.activeTab) // To see imidiately the changes

						new Notification('Track removed', {
							silent: true, 
							body: "Tracks successfully removed from "+currentPlaylist.title, 
							origin: 'Harmony' 
						})

					}) 

				} },

				{ }, // Separator

				{ title: 'Copy URL to share', disabled: !trackAlone, fn: () => {

					new Notification('Share URL copied', {
						silent: true, 
						body: 'Song URL successfully copied to clipboard!', 
						origin: 'Harmony' 
					})

					window.copyToClipboard(tracks[0].share_url)

				} },

			])

			basicContext.show(items, e)
		})
}

//Used to be able to identify the playlist

function addToPlaylist(tracks, pl) {
	return () => {

		function confirmed() {
			
			pl.tracks = pl.tracks.concat(tracks)

			pl.save(_=> { 
				window[tracks[0].service].addToPlaylist(tracks, pl.id, err => {

					if (!err) return

					console.error(err)

					new Notification('Error adding track to playlist', {
						body: err,
						tag: 'Harmony-Error',
						origin: 'Harmony'
					})

				})

				new Notification('Track(s) added', {
					silent: true, 
					body: "Track(s) successfully added to "+pl.title, 
					origin: 'Harmony' 
				})

			})
	
		}

		let duplicate = false

		for (let track of tracks)
			for (let tr of pl.tracks)
				if (tr.id == track.id) {
					duplicate = true
					break
				}


		if (duplicate) {
			let msgBody = "Track(s) is/are already in this playlist. Do you want to add anyway?"

			remote.dialog.showMessageBox({ type: 'warning', title: 'Duplicate', message: msgBody, 'buttons': ['Cancel', 'Continue']}, (btnIndex) => { 
				if (btnIndex === 0) return

				confirmed()
			})
		} else {
			confirmed()
		}

	}
}
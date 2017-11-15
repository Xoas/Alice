const dialog = remote.dialog
const recursive = require('recursive-readdir')
const mm = require('musicmetadata')
const imgFolder = remote.app.getPath('userData')+'/Artworks'


/** 
Get the metadatas of a disk file
@param filename: the path of the file
@param callback: function to call when over
**/

const getTrackMetadatas = (filename) => {

	return new Promise(function(resolve, reject) {

		const fileStream = fs.createReadStream(filename)
		
		const parser = new mm(fileStream, { duration: true }, (err, metadata) => {

			fileStream.close() // Without that everything is stored in ram

			const id = new Buffer(filename).toString('base64') // We generate array from base64 code

			getArtworkPath(metadata, artwork => {

				let tempTrack

				if (err || metadata.title === "" || metadata.title === undefined) {
					// No metadata were found

					let title = (process.platform == "win32" ? filename.split("\\").pop() : filename.split('/').pop())

					tempTrack = {
						'service': 'local',
						'title': title,
						'share_url': `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
						'artist': {
							'name': '',
							'id': ''
						},
						'album': {
							'name': '',
							'id': ''
						},
						'trackNumber': '',
						'id': id,
						'duration': metadata.duration * 1000,
						'artwork': artwork,
						'stream_url': `file://${filename}`
					}

				} else {
					metadata.album = metadata.album || ''
					metadata.artist[0] = metadata.artist[0] || ''
					const ytLookup = metadata.artist[0] + " " + metadata.title

					tempTrack = {
						'service': 'local',
						'title': metadata.title,
						'share_url': `https://www.youtube.com/results?search_query=${encodeURIComponent(ytLookup)}`,
						'artist': {
							'name': metadata.artist[0],
							'id': metadata.artist[0]
						},
						'trackNumber': metadata.track.no,
						'album': {
							'name': metadata.album,
							'id': md5(metadata.artist[0]+metadata.album)
						},
						'id': id,
						'duration': metadata.duration * 1000,
						'artwork': artwork,
						'stream_url': `file://${filename}`
					}
				}

				if (tempTrack.duration === 0) {
					getAudioDuration(tempTrack.stream_url, duration => {
						tempTrack.duration = duration
						resolve(tempTrack)
					})
				} else {
					resolve(tempTrack)
				}
				
			})
		})

	})
}

const getArtworkPath = (metadata, callback)  => {
	if (metadata.picture.length < 1) return callback('')

	let picture = metadata.picture[0]
	let artwork = URL.createObjectURL(new Blob([picture.data], { 'type': 'image/' + picture.format}))

	let reader = new window.FileReader()
	reader.readAsDataURL(new Blob([picture.data])) 
	reader.onloadend = () => {
		rawImage = reader.result
		let base64Data = rawImage.replace("data:base64,", "").replace("data:;base64,", "")
		const imgPath = imgFolder+"/"+md5(rawImage)+'.'+picture.format

		if (!fs.existsSync(imgPath)) {
			fs.writeFile(imgPath, base64Data, 'base64', (err) => {
				if (err) {
					console.error(err)
					return callback('')
				}

				callback(imgPath)
			})
		} else {
			callback(imgPath)
		}
	}
}

const resetImgFolder = () => {
	
	if( fs.existsSync(imgFolder) ) {

		fs.readdirSync(imgFolder).forEach( (file, index) => {
			let curPath = imgFolder + "/" + file
			fs.unlinkSync(curPath) // Delete file
		})
		
		fs.rmdirSync(imgFolder)
	}

	fs.mkdirSync(imgFolder)

}

/** 
Get the duration of an audio track, used when the metadata parsing for the duratio  failed.
@param path: the path of the file
@param callback: function to call when over
**/
const getAudioDuration = (path, callback) => {
	const audio = new Audio

	audio.addEventListener('loadedmetadata', () => {
		callback(audio.duration*1000)
	})

	audio.addEventListener('error', e => {
		console.warn('Could not get duration from '+path)
		callback(0)
	})

	audio.preload = 'metadata'
	audio.src = path
}


class Local {

	/**
	 * Fetch data
	 * @param callback
	 * @returns {Promise}
	 */
	static fetchData (callback) {

		return new Promise((resolve, reject) => {

			resetImgFolder()

			let temp
			
			if (!conf.get("localPlaylistFavs")) {
				temp = {
					service: 'local',
					title: 'Favorites',
					artwork: '',
					icon: 'heart',
					id: 'favs',
					tracks: []
				}

				conf.set("localPlaylistFavs", temp)
			} else {
				temp = conf.get("localPlaylistFavs")
				temp.service = 'local' // Compatibility with < v0.6.0
			}

			Data.addPlaylist(temp)

			Data.addPlaylist({
				service: 'local',
				title: 'Library',
				artwork: '',
				icon: 'drive',
				id: 'library',
				tracks: []
			})

			const supportedTypes = ['mp3', "wav", "flac", "ogg", "m4a"]

			let tempTracks = []

			// Useless 'for' for now, will be useful when multiple folders possible
			//for (let i of settings.local.paths) {

			recursive(settings.local.paths[0], (err, files) => {

				if (!files) {
					settings.local.error = true
					return reject([err, true])
				}

				let finishNow = false
				let musicFiles = []

				for (let file of files) {
					const fileExtension = file.split('.').slice(-1)[0].toLowerCase()

					if (supportedTypes.includes(fileExtension)) {
						musicFiles.push(file)
					}
				}

				let promises = musicFiles.map(getTrackMetadatas); // Convert each file to promise with it's metadatas and execute it later

				Promise.all(promises).then(function(tempTracks){

					Data.findOne({ service: 'local', id: 'library' }, (err, doc) => {
						if (err) reject(null)
						doc.tracks = tempTracks.sortBy('artist')
						doc.save()

						resolve()
					})

				});


				//////////
				/*
				let done = 0
				musicFiles.forEach(filename => {
					getTrackMetadatas(filename, (track) => {
						
						tempTracks.push(track)

						done++

						if (done == musicFiles.length)  { // When we treated all files

							Data.findOne({ service: 'local', id: 'library' }, (err, doc) => {
								if (err) reject(null)
								doc.tracks = tempTracks.sortBy('artist')
								doc.save()

								resolve()
							})
							
						}

					})

				})*/

				/////////

			})
			//}
		})
	}

	/**
	* Called when user wants to activate the service
	*
	* @param callback {Function} Callback function
	*/

	static login (callback) {

		settings.local.paths = dialog.showOpenDialog({
			properties: ['openDirectory']
		})

		if (settings.local.paths == undefined) return callback("No path selected")

		getById("LoggedBtn_local").innerHTML = settings.local.paths
		callback()

	}

	/**
	 * Like a song
	 * @param track {Object} The track object
	 */
	static like (track, callback) {
		this.toggleLike(callback)
	}

	/**
	 * Unlike a song
	 * @param track {Object} The track object
	 */
	static unlike (track, callback) {
		this.toggleLike(callback)
	}

	/**
	 * Toggle the like status on a local song
	 */
	static toggleLike (callback) {
		Data.findOne({ service: 'local', id: 'favs' }, (err, doc) => {
			if (err) callback(err)
				
			conf.set("localPlaylistFavs", doc) // We only need to save the playlist
		})
	}

	/**
	 * Get the streamable URL
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl (track, callback) {
		callback(null, track.stream_url, track.id)
	}

	/**
	 * View the artist
	 *
	 * @param track {Object} The track object
	 */
	static viewArtist (tracks) {
		let track = tracks[0]
		let temp = []

		Data.findOne({service: 'local', id: 'library'}, (err, pl) => {
			for (let tr of pl.tracks)
				if (tr.artist.id == track.artist.id)
					temp.push(tr)

			specialView('local', temp, 'artist', track.artist.name)
		})

	}

	/**
	 * View the album
	 *
	 * @param track {Object} The track object
	 */
	static viewAlbum (tracks) {
		let track = tracks[0]
		let temp = []

		Data.findOne({service: 'local', id: 'library'}, (err, pl) => {
			for (let tr of pl.tracks)
				if (tr.album.id == track.album.id)
					temp.push(tr)

			specialView('local', temp, 'album', track.album.name, track.artwork)
		})
	}

}

/** Static Properties **/
Local.fullName = "Local files"
Local.favsLocation = "local,favs"
Local.scrobbling = true
Local.color = "#666666"
Local.settings = {
	paths: [],
	active: false
}

Local.contextmenuItems = [

	{
		title: 'View artist',
		fn: () => Local.viewArtist(tracks)
	},

	{
		title: 'View album',
		fn: () => Local.viewAlbum(tracks)
	},

]

Local.loginBtnHtml = `

	<div id='Btn_local' class='button login local hide' onclick="login('local')">Listen with <b>local tracks</b></div>
	<div id='LoggedBtn_local' class='button login local hide' onclick="login('local')"></div>
	<span id='error_local' class='error hide'>Error with your path</span>

`

Local.loginBtnCss = `
	.local {
	  background-color: #6894B4;
	  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AIHDgkRjGtsSgAAAsxJREFUeNrt3b1qFGEUh/HnBIUUmhRGDVY2Noo24gVoI96EoMQ2nb2VhVhEwUYQrC1MIzYWXoBgJVGLEOz8wCQm8StxcyyyfdB9Z2eG9/lVqRZmz3/POTOzmwFJkiRJkiRJkiRJkiRJkiRJkvaXmZGZE028ru/u/5touOjnM/NlZm4Au8AgCwN2h38OMnMzM99n5kJmTlne/UWDxZ8EVoDZlo7tFXApIrYsczsd4GKLxQe4ADzJzAOWuZ0AnO3A8V0BHrontBOAEx05xmvAgqUefwBmO3Sc85l5z04w3gAc79ixzg93gmnLPp6zgDfAmQ4e80fgAfACWAY2gJ2ISANQNgBfgBk/YyPZBt4BtyJisTcBGJ56bTcZsMrsAKci4kNfdoAZi1/UQeByn5bAY9asuJMGoG5TBqBuh/oUgOPWq+4A2AEMgAo73KcAHLVe7gCqOABeAu5JACRJUp2K3LHLzBvAHHDaZaVxP9j7uv1T4HZE/Go1AJl5E7hjXVrxKCLm2g7ACg3dqtS+ViPiSNsB2MUvf7RlEBEj/fClxIWggXVozcg/eysRgFXr0Jo1A1C3dQNgBzAABsAAOAIMgB2grQB8tQ6OADkCZAeQAZAjQJ4FqC8BKPWNoB3A/8c3fpMR8bvtDlBkFumf/Ry1+CUD4B7Qw/ZvACo/AygZABdBO4AMgKodAQbADqCaA+AS6AiQI0AGQI4AVdgB1tl7LqBqDMDwaRtr1qTeEeAYGK8/EbFpAPz0GwADYABcADsSAC8HVx4AO4AjQHYAGQA5AuRZgBwBqmoEeEew5g4QEbvAN2tT7whwDFQ+AlwExyMNQN02I2LQ1QB8tj6N+1TyxUoHYMn6NO5tlwPwzPo07nlnAxARS8B9a9SY18DjojVrZE3NvApcB84B0zT3jOIafAeWgUXgbkRs+ZZIkiRJkiRJkiRJkiRJkiRJkiSAv7ZLOmGgbupvAAAAAElFTkSuQmCC);
	}
`

module.exports = Local
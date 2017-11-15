const api_url = "https://api.deezer.com"
const auth_url = "https://connect.deezer.com/oauth/access_token.php"

const apiRequest = (method, url, auth, params, callback) => {

	params.output = 'json'

	if (auth) params.access_token = settings.deezer.access_token
	
	if (!url.includes('https://')) url = api_url+url

	let requestOptions = { url: url, method: method, json: true}
	
	let urlParameters = Object.keys(params).map((i) => typeof params[i] !== 'object' && !getParameterByName(i, requestOptions.url) ? i+'='+params[i]+'&' : '' ).join('') // transforms to url format everything except objects
	requestOptions.url += (requestOptions.url.includes('?') ? '&' : '?') + urlParameters
	
	if (method !== 'GET') {
		requestOptions.json = params
	}

	request(requestOptions, (err, result, body) => {
		if (body && body.error) callback(body.error, body)
		else callback(err, body)
	})
	
}

const auth = (code, callback) => {

	request.post({
		url: auth_url+'?output=json', 
		json: true, 
		form: {
			client_id: settings.client_ids.deezer.client_id,
			client_secret: settings.client_ids.deezer.client_secret,
			grant_type: 'authorization_code',
			redirect_uri: 'http://localhost',
			code: code
		} 
	}, (err, res, body) => {
		callback(err, body)
	})

}

const convertTrack = (rawTrack) => {

	return {
		'service': 'deezer',
		'title': rawTrack.title,
		'share_url': rawTrack.link,
		'album': {
			'name': rawTrack.album.title,
			'id': rawTrack.album.id
		},
		'artist': {
			'name': rawTrack.artist.name,
			'id': rawTrack.artist.id
		},
		'id': rawTrack.id,
		'duration': rawTrack.duration * 1000,
		'artwork': rawTrack.album.cover_small
	}

}


/**
 * Deezer API Abstraction
 */
class Deezer {

	 /**
	 * Fetch data
	 *
	 * @returns {Promise}
	 */
	static fetchData () {
		return new Promise((resolve, reject) => {
			
			if (!settings.deezer.access_token) {
				settings.deezer.error = true
				return reject([null, true])
			}

			apiRequest('GET', '/user/me/flow', true, {}, (err, result) => {

				if (err) return reject([err])

				let tempTracks = []

				for (let i of result.data) 
					tempTracks.push(convertTrack(i))

				Data.addPlaylist({
					service: 'deezer',
					title: 'Flow', 
					artwork: '', 
					icon: 'user', 
					id: 'flow', 
					tracks: tempTracks
				})

				apiRequest('GET', '/user/me/playlists', true, {}, (err, result) => {

					if (err) return reject([err])

					let currentPl = 0
					let toGet = result.data.length

					for (let i of result.data) {
						!function outer(i) {

							apiRequest('GET', i.tracklist.split('.com')[1], true, {}, (err, result) => {

								if (err) return console.log(err)

								let tempTracks = []

								function moreTracks(url) {

									apiRequest('GET', url.split('.com')[1], true, {}, (err, result) => {
										if (err) return console.log(err)

										for (let t of result.data)
											tempTracks.push(convertTrack(t))

										if (result.next) moreTracks(result.next)
										else over()

									})
								}

								if (result) {
									for (let t of result.data)
										tempTracks.push(convertTrack(t))

									if (result.next) moreTracks(result.next)
									else over()
								}

								function over() {
									if (i.title.trim() == "Loved tracks")
										Data.addPlaylist({
											service: 'deezer',
											title: "Loved tracks",
											id: 'favs',
											icon: 'heart',
											artwork: i.picture_medium,
											tracks: tempTracks
										})
									else
										Data.addPlaylist({
											service: 'deezer',
											title: i.title,
											id: i.id,
											editable: (i.creator.id === settings.deezer.userId ? true : false),
											icon: null,
											artwork: i.picture_medium,
											tracks: tempTracks
										})

									currentPl += 1

									if (currentPl == toGet) resolve()
								}

							})
						}(i)
					}
					
				})
				
			})

		})
	}

	/**
	* Called when user wants to activate the service²
	*
	* @param callback {Function} Callback function
	*/

	static login (callback) {

		const oauthUrl = `https://connect.deezer.com/oauth/auth.php?app_id=${settings.client_ids.deezer.client_id}&redirect_uri=http://localhost&response_type=code&perms=manage_library,offline_access,listening_history,delete_library`
		oauthLogin(oauthUrl, (code) => {
			
			if (!code) return callback('stopped')

			auth(code, (err, data) => {

				if (err) return callback(err)

				// Parsing access token from received data
				settings.deezer.access_token = data.access_token

				apiRequest('GET', '/user/me', true, {}, (err, result) => {
					if (err) return callback(err)

					settings.deezer.userId = result.id
					callback()
				})

			})

		})
	}


	/**
	* Add tracks to a playlist
	*
	* @param tracks {Array} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static addToPlaylist (tracks, playlistId, callback) {
		let ids = ""

		for (let track of tracks)
			ids += track.id+','

		apiRequest('POST', `/playlist/${playlistId}/tracks`, true, {songs: ids}, (err, result) => {
			callback(err)
		})
	}



	/**
	* Remove tracks from a playlist
	*
	* @param tracks {Array} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static removeFromPlaylist (tracks, playlistId, callback) {
		let ids = ""

		for (let track of tracks)
			ids += track.id+','

		apiRequest('DELETE', `/playlist/${playlistId}/tracks`, true, {songs: ids}, (err, result) => {
			callback(err)
		})
	}


	/**
	 * Like a song
	 *
	 * @param track {Object} The track object
	 */
	static like (track, callback) {
		apiRequest('POST', `/user/me/tracks`, true, {track_id: track.id}, (err, result) => {
			callback(err)
		})
	}

	/**
	 * Unlike a track
	 *
	 * @param track {Object} The track object
	 */
	static unlike (track, callback) {
		apiRequest('DELETE', `/user/me/tracks`, true, {track_id: track.id}, (err, result) => {
			callback(err)
		})
	}
	

	/**
	 * View an artist
	 *
	 * @param track {Object} The track object
	 */
	static viewArtist (tracks) {
		let track = tracks[0]

		specialView('deezer', 'loading', 'artist', track.artist.name)

		apiRequest('GET', `/artist/${track.artist.id}/top`, false, {}, (err, result) => {
			if (err) return console.error(err)

			let temp = []

			for (let tr of result.data)
				temp.push(convertTrack(tr))

			specialView('deezer', temp, 'artist', track.artist.name, result.data[0].contributors[0].picture)
		})
	}

	/**
	 * View an album
	 *
	 * @param track {Object} The track object
	 */
	static viewAlbum (tracks) {
		let track = tracks[0]

		specialView('deezer', 'loading', 'album', track.album.name)

		apiRequest('GET', `/album/${track.album.id}`, false, {}, (err, result) => {
			if (err) return console.error(err)

			let temp = []

			for (let tr of result.tracks.data){
				tr.album = { title: track.album.name, id: track.album.id }
				temp.push(convertTrack(tr))
			}

			specialView('deezer', temp, 'album', track.album.name, result.cover_medium)
		})
	}


	/**
	* Search
	* @param query {String}: the query of the search
	* @param callback
	*/
	static searchTracks (query, callback) {

		apiRequest('GET', `/search`, false, {q: encodeURI(query)}, (err, result) => {

			if (err) return console.error(err)
			let tracks = []

			for (let tr of result.data)
				if (tr) tracks.push(convertTrack(tr))

			callback(tracks, query)

		})
	}

}

/** Static Properties **/
Deezer.fullName = "Deezer"
Deezer.favsLocation = "deezer,favs"
Deezer.scrobbling = true
Deezer.color = "#3a3a3a"
Deezer.settings = {
	active: false
}

Deezer.loginBtnHtml = `

	<div id='Btn_deezer' class='button login deezer hide' onclick="login('deezer')">Listen with <b>Deezer</b></div>
	<div id='LoggedBtn_deezer' class='button login deezer hide' onclick="logout('deezer')">Disconnect</div>
	<span id='error_deezer' class='error hide'>Error, please try to login again</span>

`

Deezer.loginBtnCss = `
	.deezer {
	  background-color: #3a3a3a;
	  background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAQAAADa613fAAAAAmJLR0QA/4ePzL8AAAAJcEhZcwAACxMAAAsTAQCanBgAAAAHdElNRQfgCgMPMjvVsvwFAAAEHklEQVR42u2Yz29UVRTHP3dmKoJARi1oSwQihOICGjWkNEaiC2NciAuCNrowlaUbY+LShYmJqcadif+BJoCAxhgVNWJcQCMJDSrBkP6A0oGRaWtnOtP2/TguuvTcN8O8TmZMzmd275tz3z33nu+9bw4YhmEYhmEYhmEYhmEYhmEYhmE0hOucqch2DpBVhCXOuX/+R2sqQ1KWQPldl331o3MdVR05dT65Ruom00GJZDzL2tBid9KOXOQd1SOLFNqUiBzhMVW4wmkXJ+5ItqMWW06JzinpSoh6TUI1qij72+WR6C6frxITqM/D9nkkbGpKMYFaWgHSpgtRBnlEFW5wwe8R74VY45f6F2JrduRJBoiVRRtlNCGqlxfoUqLmuER7bnb5wmP2k4lmf1VW1Khb7TO7rGmctM/ssxSU1ztKiZOqcpN1yvOi5+ho3OySY7Nnz8puOSHuCXrURGa4zCbV0FDhfvqVtzmWGHXldDuygxEeUqYU8z4/JMQd5ll17X+ixIdsU5P8gEXe5h4lqsQEKRPZyEG2qVW7NTFuH4fU50U2MMBOVethgWfQDoPbbExvdmnKzklRzWipzV7jD2aV4SPmEuMmuazeI5Ms8SdltbRmWWRMKS3H39TSmj3P09ynfkycd9cT4p5iuzrZKX7nkFoojgsEHPTc7OfcfLod6eU91SMRb5KQCMO8qD4/w0e86/HIW1T4WD1+bzNEykRybFFtHXNvYlzecxjkydHt0dYTslVNJG7ktsvUKbysJ8o1NWoGPCOC874tm97sC5xli7pGNxPjfvPs2EUq/EiP58u4yjfq8Ttb/xapl8g8X3nMPiWPMqjf+fzMr0x7TrMyX7NJ1cYJOK6ufrW+Q+pdIvtlQkLltyxH5XUJVO2q7JHPVSWUz6RP/vJow3JEKqpyYy36WllPha5WtPP4IJPgrUziiFl1Dq5VZs/ivIbP4Zo0u6+vtQZmL/IJedUjV+hiRE3lDiVOM66ON0aJT3nQoy0zopp9gWLaRISQULmjBUHUVoIjAmI1alULPdrqiO4/mmusi5KcR7/MeP60DskbHmVC+uSkRzshe2XSox2TlyVoVV9LPKsRERN7vlVDJLGvFXrfFXu0NelrReqkQgQhUj0SIZ4oiJvSotR9LenmMJtVj3xLjufU8eb5kkH61M/4q5znJfKqR86ywvPKCeWocMbdSbcjG3icbvWv7ijrGFATucV37Pb0tSLG6OdhNZFL1Djg6Wt9n97s06r9YnlFhj2mHZc9csKjHZe9MuE1+9FW9rXuvtPU7N9ZaWVfa4WCx9BVhGlVKxBSYsbT1wooqJ0SxyJVplvV11rPLvW1wiQZdqhBy1yjlwfUdZyjwC51sjBFxE61QgKuuRqGYRiGYRiGYRiGYRiGYRiGYbSZfwHCCjDNByXRvwAAAABJRU5ErkJggg==');
	}
`


Deezer.contextmenuItems = [

	{ 
		title: 'View artist', 
		fn: () => deezer.viewArtist(tracks)
	}, 
	{ 
		title: 'View album', 
		fn: () => deezer.viewAlbum(tracks)
	}

]

module.exports = Deezer
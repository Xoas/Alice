const ytdl = require('ytdl-core') 
const api_url = "https://www.googleapis.com/youtube/v3"
const auth_url = "https://www.googleapis.com/oauth2/v4/token"

const apiRequest = (method, url, auth, params, callback) => {

	if (!url.includes('https://')) url = api_url+url

	let requestOptions = { url: url, method: method, json: true}

	if (auth) requestOptions.auth = { bearer: settings.youtube.access_token }
	else params.key = settings.client_ids.youtube.key
	

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
		url: auth_url, 
		json: true, 
		form: {
			client_id: settings.client_ids.youtube.oauth_id,
			client_secret: settings.client_ids.youtube.oauth_secret,
			grant_type: 'authorization_code',
			redirect_uri: 'http://localhost',
			code: code
		} 
	}, (err, httpres, res) => {
		callback(err, res)
	})

}

const refreshToken = (callback) => {

	request.post({
		url: auth_url, 
		json: true, 
		form: {
			client_id: settings.client_ids.youtube.oauth_id,
			client_secret: settings.client_ids.youtube.oauth_secret,
			grant_type: 'refresh_token',
			redirect_uri: 'http://localhost',
			refresh_token: settings.youtube.refresh_token
		} 
	}, (err, httpres, res) => {
		if (err) return callback(err)

		settings.youtube.access_token = res.access_token
		callback()
	})

}

const convertTrack = rawTrack => {

	let id = rawTrack.id.videoId ? rawTrack.id.videoId : rawTrack.id

	return {
		service: 'youtube',
		title: rawTrack.snippet.title,
		artist: {
			id: rawTrack.snippet.channelId,
			name: rawTrack.snippet.channelTitle
		},
		album: {
			id: '',
			name: ''
		},
		share_url: 'https://youtu.be/'+id,
		id: id,
		duration: rawTrack.contentDetails ? ISO8601ToSeconds(rawTrack.contentDetails.duration)*1000 : null,
		artwork: rawTrack.snippet.thumbnails.default.url // For smaller artworks
	}
}

const extractIdFromUrl = url => {
	let regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
	let match = url.match(regExp)
	if (match && match[2].length == 11) return match[2]
	else return null
}


class Youtube {

	/**
	* Fetch data
	*
	* @returns {Promise}
	*/
	static fetchData () {


		return new Promise((resolve, reject) => {

			if (!settings.youtube.access_token) {
				settings.youtube.error = true
				return reject([null, true])
			}

			refreshToken(error => {

				if (error) {
					settings.youtube.error = true;
					return reject([error, true]);
				}

				let tempTracks = []

				function moreTracks(nextPageToken) {

					apiRequest('GET', '/videos', true, {myRating: 'like', part: 'snippet,contentDetails', maxResults: 50, pageToken: (nextPageToken || null)}, (err, res) => {

						if (err) return reject(err)

						for (let vid of res.items) 
							if ((settings.youtube.onlyMusicCategory && vid.snippet.categoryId === '10') || !settings.youtube.onlyMusicCategory)
								if (vid.snippet.liveBroadcastContent === 'none') // Disable livestreams
									tempTracks.push(convertTrack(vid))
						
						if (res.nextPageToken) moreTracks(res.nextPageToken)
						else over()

					})
				}

				moreTracks();

				function over() {
					Data.addPlaylist({
						service: 'youtube',
						title: 'Liked',
						id: 'favs',
						icon: 'thumbs-up',
						artwork: '',
						tracks: tempTracks
					})

					resolve()
				}
			})

			apiRequest('GET', '/playlists', true, {part: 'snippet', mine: 'true', maxResults: 50}, (err, res) => {
				if (err) return reject(err)
				
				for (let pl of res.items) {

					!function outer(pl) {

						let tempTracks = []

						function moreTracks(nextPageToken) {
							apiRequest('GET', '/playlistItems', true, {playlistId: pl.id, part: 'snippet', maxResults: 50, pageToken: (nextPageToken || null)}, (err, res) => {
								if (err) return reject(err)

								let tempIds = []

								for (let vid of res.items)
									tempIds.push(vid.snippet.resourceId.videoId)

								apiRequest('GET', '/videos', false, {id: tempIds.join(','), part: 'snippet,contentDetails'}, (err, result) => {
									if (err) return reject(err)

									for (let vid of result.items)
										tempTracks.push(convertTrack(vid))

									if (res.nextPageToken) moreTracks(res.nextPageToken)
									else over()

								})

							})
						}

						moreTracks();

						function over() {
							Data.addPlaylist({
								service: 'youtube',
								title: pl.snippet.title,
								id: pl.id,
								editable: true,
								artwork: '',
								tracks: tempTracks
							})
						}
					
					}(pl)
				}

			})

		})
	}

	/**
	 * Gets a track's streamable URL from it's youtube URL/id
	 *
	 * @param url {String} The YouTube url (or id) of the track
	 * @param callback {Function} The callback function
	 */
	static getStreamUrlFromVideo(url, callback) {

		ytdl.getInfo(url, [], (err, info) => {

			if (err) {
				console.error(err)
				return callback(err, null)
			}

			let formats = []

			for (let i of info.formats)
				if (!i.resolution) formats.push(i) // Keep only audio streams
			
			formats.sort((a, b) => { // We sort them by bitrate (pretty close to quality)
				return a.audioBitrate - b.audioBitrate
			})

			if (!settings.youtubeQuality || settings.youtubeQuality === 'normal') {

				for (let format of formats)
					if (format.audioBitrate > 100)
						return callback(null, format.url)

			} else if (settings.youtubeQuality == 'lowest') {

				return callback(null, formats[0].url)

			} else if (settings.youtubeQuality == 'best') {

				return callback(null, formats[formats.length - 1].url)

			} 

			callback("no stream for this url", null)
		})

	}

	/**
	 * Gets a track's streamable URL, the track doesn't need to be from YouTube
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl(track, callback) {

		if (track.service === 'youtube') {
			this.getStreamUrlFromVideo(track.id, (err, url) => {
				callback(err, url, track.id)
			})
		} else { // Track isn't from youtube, let's try to find the closest match
	
			const duration = track.duration / 1000 // we want it in seconds
			const fullTitle = track.artist.name+' '+track.title

			apiRequest('GET', '/search', false, {q: encodeURIComponent(fullTitle), maxResults: 5, part: 'snippet', type: 'video', safeSearch: 'none'}, (err, res) => {

				if (err) return callback(err, null, track.id)

				let videoIds = []

				for (let i of res.items) {

					let videoTitle = i.snippet.title
					let comparisonTitle = fullTitle

					if (videoTitle.includes(' - ')) { // We can parse the real track name
						videoTitle = videoTitle.split(' - ')[1]
						comparisonTitle = track.title
					}

					if (similarity(videoTitle, comparisonTitle) > 0.4)
						videoIds.push(i.id.videoId)
				}

				videoIds.slice(0, 3) // Keep only first 3 results
				videoIds = videoIds.join() // Transforms to string

				let durations = []

				apiRequest('GET', '/videos', false, {id: videoIds, part: 'contentDetails'}, (err, res) => {
					if (err) return callback(err, null, track.id)

					for (let t of res.items)
						durations.push({id: t.id, duration_diff: Math.abs(ISO8601ToSeconds(t.contentDetails.duration) - duration)})

					durations.sort((a, b) => { // We sort potential tracks by duration difference with original track
						return a.duration_diff - b.duration_diff
					})

					if (!durations[0]) return callback('No corresponding track found', null, track.id)

					this.getStreamUrlFromVideo(durations[0].id, (err, url) => {
						callback(err, url, track.id)
					})

				})
			})
		}
	}


	static resolveTrack (url, callback) {
		let id = extractIdFromUrl(url)
		if (!id) return callback('invalid youtube URL')

		refreshToken(error => {
			apiRequest('GET', '/videos', false, {id: id, part: 'snippet,contentDetails'}, (err, res) => {
				if (err || error) callback(err || error)
				let track = convertTrack(res.items[0])

				callback(null, track)
			})
		})
	}


	/**
	* Called when user wants to activate the service
	*
	* @param callback {Function} Callback function
	*/
	static login (callback) {

		const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${settings.client_ids.youtube.oauth_id}&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/youtube`;
		oauthLogin(oauthUrl, (code) => {

			if (!code) return callback('stopped')

			auth( code, (err, data) => {

				if (err) return callback(err)

				settings.youtube.access_token = data.access_token
				settings.youtube.refresh_token = data.refresh_token

				callback()
			})

		})

	}

	/**
	* Search
	* @param query {String}: the query of the search
	* @param callback
	*/
	static searchTracks (query, callback) {

		refreshToken(error => {

			apiRequest('GET', '/search', false, {q: encodeURIComponent(query), maxResults: 10, part: 'snippet', type: 'video', videoCategoryId: '10', safeSearch: 'none'}, (err, res) => {

				if (err) return console.error(err)
				let tracks = []

				for (let tr of res.items)
					if (tr) tracks.push(convertTrack(tr))

				callback(tracks, query)

			})
		})
	}



	/**
	* Add a track to a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static addToPlaylist (tracks, playlistId, callback) {

		refreshToken(error => {
			if (error) callback(error)

			let i = 0;
			function differedLoop(video_id) { // So we make 1 request/2 secs as YouTube doesn't allow to send multiple ids :(
				add(video_id);

				setTimeout(_ => {
					i++;
					if (i < tracks.length) differedLoop(tracks[i].id);
				}, 2000);
			}

			function add(id) {
				apiRequest('POST', '/playlistItems', true, {
					part: 'snippet',
					snippet: {
						playlistId: playlistId,
						resourceId: {
							kind: "youtube#video",
							videoId: id
						}
					}
				}, (err, res) => {
					if (err) callback(err)
				})
			}

			differedLoop(tracks[0].id)

		})
	}



	/**
	* Remove a track from a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	/*static removeFromPlaylist (tracks, playlistId, callback) {

	}
	*/


	/**
	* Like a song
	*
	* @param track {Object} The track object
	*/

	static like (track, callback) {
		refreshToken(error => {
			apiRequest('POST', '/videos/rate', true, {id: track.id, rating: 'like'}, (err, res) => {
				callback(error || err)
			})
		})
	}

	/**
	* Unlike a song
	*
	* @param track {Object} The track object
	*/

	static unlike (track, callback) {
		refreshToken(error => {
			apiRequest('POST', '/videos/rate', true, {id: track.id, rating: 'none'}, (err, res) => {
				callback(error || err)
			})
		})
	}


}

Youtube.fullName = "YouTube"
Youtube.favsLocation = "youtube,favs"
Youtube.color = "red"
Youtube.scrobbling = true
Youtube.settings = {
	active: false,
	quality: 'normal',
	onlyMusicCategory: true
}

Youtube.settingsItems = [
	{
		description: 'Only fetch videos with music category',
		type: 'checkbox',
		id: 'onlyMusicCategory'
	},
	{
		description: 'Playback quality',
		type: 'select',
		id: 'quality',
		options: [{
			value: 'lowest', title: 'Lowest'
		},{
			value: 'normal', title: 'Normal'
		},{
			value: 'best', title: 'Best'
		}]
	}
]

Youtube.loginBtnHtml = `

	<div id='Btn_youtube' class='button login youtube hide' onclick="login('youtube')">Listen with <b>YouTube</b></div>
	<div id='LoggedBtn_youtube' class='button login youtube hide' onclick="logout('youtube')">Disconnect</div>
	<span id='error_youtube' class='error hide'>Error, please try to login again</span>

`

Youtube.loginBtnCss = `
	.youtube {
	  background-color: red;
	  background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4QgZDxE75SO8WgAABGBJREFUeNrtnV1IW2cYx//viaXaxaU0WONXjoGlBrRpMeu3q6tsuxh2DgruqjeTjQnrRfGmvRkbbFA6EMpUGGMdG3YXmg2m0AvthGxlKfUiVZQS2xrrnFHbMtxk69c57+7cpKZ+DHPec/r/3cZozvN7/+/z5HDOESCEEEIIIYQQQgghhBBCiArIDBi1tZuMvXu3m/Pzv8h7965KB2N2dh4zq6q2G0ePbsr0M+uprVitAACQZWUecfPmKDZvLuWyXAXpdBSa1ovCwq+laf6ouVyv/C8h67VMnoJpfiFcrnczvaxllPHo0QCrtwFo2jvy8ePUmhLCZGQHIYRYUQhlWCtF4zZl8cTa3+9bNiFMhhop0VgOBVJy7lz5koQwHeqkhAlRbSoGANnRUc5SWIsRDG4FACF9PoFU6lfk5pawLNZvW4L9Qy0h7CEq9hBCISSTEKOxMY9lUGTSCoUKNM3rDbEUiqTj+vU5TlnsIWukru4DClGJgYEONDV5UFb2OYWowNhYjjh//g8xNfUeDh6sRk/PbxSiyjfZeDwhGhpKEQodpxCVxCSTnWhu3obS0k+cJkT9KWtszCcqKmYzvSz37w8jHh9iQlRZUVeuDAshBHbseJNCVBJz48YPaGnZiqKi9ylEFSmtrfNiZqYde/aEcPZsty0PQvmrmpPJwnUfWyDwkhwdnbTTRdyOPtsrUqmfcfFiCMXFb2BoaJZTVhamrFWn5dChEoyP12F6+hsKUUDIohi/vwIPH76OdLqVTV2FFTg5mURDQzv8/gh8vjYmxOKELElLTY0bt2/vxOBgPwoLn2NCrF6Nly8vwOv1qSLjmRYijxwJyt7eCSQS37OHWCni5Mk8qeufYmBgDPX1OnuIhT1E7tp1HNeuKT325jg+EYDA4cMReDxfoaenSvXP61ghMhBwobKyCInEh4jFmuzyuR0nRDY3a7h0yQ3DaEJvb6vdPr+jhEhdz0df38u4cOFb7NvntuMxOEKIPHBgC2Znw4hEPkJX12t2PhZbC5Hd3S6cOlWBBw/exq1bLU5YXLYVIiMRP06cqEc63e6kbdd2QmRjowczM8cQi33pxOlQfSH/edCB1PVX0db2HQoK8p06rqt/6iQY/Evu3r1TdnbGMDHR52QZ9khIOHwaw8On8Ywg5N27g/B6XwRRZMuqrm5kGRRhZOQzYVZW5oqRkb9ZDQUmyHC4gHdQKTVQ8j51jr2EQuwlRBrGWyyDQkK0nJwuqevPsxTWYtbU5AN8opxSExZ7iKpNfbkH+pIsblfB4OKVk/8+JtYwxqFpAZbHuu1qiRD2EutlPNFDhBAC9+//xDJlB1lSsm3FL4YiL6+WpcqCjLm5j7Xp6d+fqP9T7LkxNfUnS7cBMkKhLVoyuewZ9hWnK/aVje0ZK25Zy/0CIYTAmTMvsJzrTERxsXexjhv6h3TdnbV/whWN3jHj8YU1vy8eXzCj0TtZu9G8vNzNJUgIIYQQQgghhBBCCCGEKMU/i6fDul8giz4AAAAASUVORK5CYII=');
	}
`

module.exports = Youtube
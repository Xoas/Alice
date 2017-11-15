const api_url = 'https://www.reddit.com'
const auth_url = 'https://www.reddit.com/api/v1/access_token'

const apiRequest = (method, url, auth, params, callback) => {

	if (!auth) params.client_id = settings.client_ids.reddit.client_id
	params.format = 'json'

	let urlParameters = Object.keys(params).map((i) => typeof params[i] !== 'object' ? i+'='+params[i]+'&' : '' ).join('') // transforms to url format everything except objects

	if (!url.includes('https://')) url = api_url+url

	let requestOptions = { url: url+'?'+urlParameters, method: method, json: true, headers: { 'User-Agent': 'Harmony Player'}}
	
	if (auth)  {
		requestOptions.url = requestOptions.url.replace('www.', 'oauth.')
		requestOptions.headers.Authorization= 'bearer '+settings.reddit.access_token
	} else {
		requestOptions.auth = {user: settings.client_ids.reddit.client_id, pass: ''}
	}

	if (method !== 'GET') requestOptions.json = params

	request(requestOptions, (err, result, body) => {
		//console.log(err, body)
		if (body && body.error) callback(body.error, body)
		else callback(err, body)
	})
	
}

const auth = (code, callback) => {

	apiRequest('POST', auth_url, false, {

		grant_type: 'authorization_code',
		redirect_uri: 'http://localhost',
		code: code

	}, (err, res) => {
		callback(err, res)
	})

}

const refreshToken = (callback) => {
	apiRequest('POST', auth_url, false, {
		grant_type: 'refresh_token',
		redirect_uri: 'http://localhost',
		refresh_token: settings.reddit.refresh_token
	}, (err, res) => {
		if (err) return callback(err)
		settings.reddit.access_token = res.access_token
		callback(err)
	})
}

const convertTrack = rawTrack => {

	let title = rawTrack.title.split(" - ")[1].replace(/(\[.*?\])/g, '') // Remove things like [fresh] or [new]
	let artist = rawTrack.title.split(" - ")[0].replace(/(\[.*?\])/g, '')

	return {
		'service': 'reddit',
		'title': title,
		'artist': {
			'id': artist,
			'name': artist 
		},
		'album': {
			'id': '',
			'name': ''
		},
		'share_url': rawTrack.url,
		'id': rawTrack.name,		
		'artwork': rawTrack.thumbnail != '' ? rawTrack.thumbnail : rawTrack.media.oembed.thumbnail_url,
		'url': rawTrack.url
	}
}


/**
* Reddit API Abstraction
*/
class Reddit {

	/**
	* Fetch data
	*
	* @returns {Promise}
	*/
	static fetchData () {

		return new Promise((resolve, reject) => {

			if (!settings.reddit.access_token) {
				settings.reddit.error = true
				return reject([null, true])
			}

			refreshToken(err => {

				if (err) {
					settings.reddit.error = true
					return reject([err, true])
				}

				apiRequest('GET', `/user/vincelwt/upvoted`, true, {}, (err, result) => {
					if (err) return reject([err])

					let tempTracks = []

					for (let submission of result.data.children) {
						if (submission.data.media && submission.data.title.includes(' - ') && (submission.data.media.type.includes('soundcloud') || submission.data.media.type.includes('youtube') )) {
							tempTracks.push(convertTrack(submission.data))
						}
					}

					Data.addPlaylist({
						service: 'reddit',
						title: 'Upvoted',
						icon: 'up-open',
						id: 'upvotes',
						tracks: tempTracks
					})

					for (let subreddit of settings.reddit.subreddits.split(',')) {
						//console.log(subreddit)

						apiRequest('GET', `https://www.reddit.com/r/${subreddit}/.json`, false, {limit: 100}, (err, result) => {

							if (err) return reject([err])

							let tempTracks = []

							for (let submission of result.data.children) {
								if (submission.data.media && submission.data.title.includes(' - ') && (submission.data.media.type.includes('soundcloud') || submission.data.media.type.includes('youtube') )) {
									tempTracks.push(convertTrack(submission.data))
								}
							}

							Data.addPlaylist({
								service: 'reddit',
								title: '/r/'+subreddit,
								id: subreddit,
								artwork: '',
								tracks: tempTracks
							})

						})

					}

					resolve()

				})

			})

		})


	}


	/**
	 * Called when user wants to activate the service
	 *
	 * @param callback {Function} Callback function
	 */
	static login (callback) {

		const oauthUrl = `https://www.reddit.com/api/v1/authorize.compact?client_id=${settings.client_ids.reddit.client_id}&response_type=code&state=RANDOM_STRING&redirect_uri=http://localhost&duration=permanent&scope=identity save read mysubreddits vote history`
		oauthLogin(oauthUrl, (code) => {
			if (!code) return callback('stopped')

			auth( code, (err, data) => {
				if (err) return callback(err)

				settings.reddit.access_token = data.access_token
				settings.reddit.refresh_token = data.refresh_token

				callback()
			})

		})

	}

	/**
	 * Gets a track's streamable URL
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl (track, callback) {
		if (track.url.includes('youtu')) {
			window['youtube'].getStreamUrlFromVideo(track.url, (err, url) => {
				callback(err, url, track.id)
			})
		} else if (track.url.includes('soundcloud')) {
			window['soundcloud'].resolveTrack(track.url, (err, scTrack) => {
				callback(err, scTrack.stream_url+ "?client_id=" + settings.client_ids.soundcloud.client_id, track.id)
			})
		}
	}


	/**
	 * Like a song 
	 *
	 * @param track {Object} The track object
	 */
	static like (track, callback) {
		refreshToken(error => {
			apiRequest('POST', ` /api/vote`, true, {id: track.id, dir: 1}, (err, result) => {
				callback(error || err)
			})
		})

		if (!settings.reddit.mirrorLikes) return

		if (settings.soundcloud.active && track.url.includes('soundcloud')) {
			window['soundcloud'].resolveTrack(track.url, (err, track) => {
				if (err) callback(err)
				window['soundcloud'].like(track, callback)
			})
		} else if (settings.youtube.active && track.url.includes('youtu')) {
			window['youtube'].resolveTrack(track.url, (err, track) => {
				if (err) callback(err)
				window['youtube'].like(track, callback)
			})
		}
	}

	/**
	 * Unlike a song
	 *
	 * @param track {Object} The track object
	 */
	static unlike (track, callback) {
		refreshToken(error => {
			apiRequest('POST', `/api/vote`, true, {id: track.id, dir: 0}, (err, result) => {
				callback(error || err)
			})
		})

		if (!settings.reddit.mirrorLikes) return

		if (settings.soundcloud.active && track.url.includes('soundcloud')) {
			window['soundcloud'].resolveTrack(track.url, (err, track) => {
				if (err) callback(err)
				window['soundcloud'].unlike(track, callback)
			})
		} else if (settings.youtube.active && track.url.includes('youtu')) {
			window['youtube'].resolveTrack(track.url, (err, track) => {
				if (err) callback(err)
				window['youtube'].unlike(track, callback)
			})
		}
	}

}


/** Static Properties **/
Reddit.fullName = "Reddit"
Reddit.favsLocation = "reddit,upvotes"
Reddit.scrobbling = true
Reddit.color = "#EF4500"
Reddit.settings = {
	active: false,
	subreddits: 'listentothis,futurebeats',
	mirrorLikes: true
}

Reddit.settingsItems = [
	{
		description: 'Subreddits to show',
		type: 'text',
		id: 'subreddits',
		placeholder: 'Separate by a coma, without /r/'
	},
	{
		description: 'If possible, also like on SoundCloud & YouTube',
		type: 'checkbox',
		id: 'mirrorLikes'
	}
]

Reddit.loginBtnHtml = `

	<div id='Btn_reddit' class='button login reddit hide' onclick="login('reddit')">Listen with <b>Reddit</b></div>
	<div id='LoggedBtn_reddit' class='button login reddit hide' onclick="logout('reddit')">Disconnect </div>
	<span id='error_reddit' class='error hide'>Error, please try to login again</span>

`

Reddit.loginBtnCss = `
	.reddit {
		color: black !important;
		background-color: #d9f3fd;
		background-image: url('data:image/png;base64,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')
	}
`

module.exports = Reddit
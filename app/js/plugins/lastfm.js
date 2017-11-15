const api_url = 'https://ws.audioscrobbler.com/2.0'

const apiRequest = (method, url, auth, params, callback) => {

	params.api_key = settings.client_ids.lastfm.client_id
	params.method = url
	
	if (auth) params.sk = settings.lastfm.session_key

	params.api_sig = createSig(params)

	params.format = 'json'

	let requestOptions = { url: api_url, method: method, json: true}

	switch (method) {
		case 'GET':
			let urlParameters = Object.keys(params).map((i) => typeof params[i] !== 'object' ? i+'='+params[i]+'&' : '' ).join('') // transforms to url format everything except objects
			requestOptions.url += '?'+urlParameters
			break
		case 'POST':
			requestOptions.form = params
			break
		case 'PUT':
		case 'DELETE':
			requestOptions.json = params
			break
	}

	request(requestOptions, (err, result, body) => {
		if (body && body.error) callback(body.error, body)
		else callback(err, body)
	})
	
}

const createSig = (params) => {
	let sig = ""
	Object.keys(params).sort().forEach(function(key) {
		if (key != "format") {
			let value = typeof params[key] !== "undefined" && params[key] !== null ? params[key] : ""
			sig += key + value
		}
	})
	sig += settings.client_ids.lastfm.client_secret
	return md5(sig)
}

const convertTrack = rawTrack => {
	console.log(rawTrack)
	return {
		'service': 'lastfm',
		'title': rawTrack.name,
		'artist': {
			'id': rawTrack.artist.mbid,
			'name': rawTrack.artist.name
		},
		'album': {
			'id': '',
			'name': ''
		},
		'share_url': rawTrack.url,
		'id': rawTrack.url,
		'artwork': rawTrack.image[0]['text']
	};
};

class Lastfm {

	/**
	* Called when user wants to activate the service
	*
	* @param callback {function}
	*/

	static login (callback) {
		const oauthUrl =`http://www.last.fm/api/auth?api_key=${settings.client_ids.lastfm.client_id}`
		oauthLogin(oauthUrl, (code) => {

			if (!code) return callback('stopped')

			apiRequest('GET', 'auth.getsession', false, {token: code} , (err, res) => {
				
				if (err) {
					settings.lastfm.error = true
					return callback(err)
				}
				
				settings.lastfm.session_key = res.session.key

				callback()

			})
		})
	}

	/**
	* Called every time a track is played
	*
	* @param callback {Object}
	*/
	static onTrackPlay (track) {
		if (settings.lastfm.tempDisable) return

		const duration = track.duration / 1000

		apiRequest('POST', 'track.updateNowPlaying', true, { track: track.title, artist: track.artist.name, duration: duration }, err => {
			if (err) console.error(err) 
		})
	}

	/**
	* Called every time a track ended
	*
	* @param callback {Object}
	*/
	static onTrackEnded (track) {
		if (settings.lastfm.tempDisable) return
		
		const timestamp = Math.floor(Date.now() / 1000) - Math.floor(track.duration / 1000)

		apiRequest('POST', 'track.scrobble', true, { track: track.title, artist: track.artist.name, timestamp: timestamp }, err => {
			if (err) console.error(err)
		})
	}


	/**
	* Show similar tracks based on seed
	*
	* @param track {Object}
	*/
	static showSimilar (tracks) {
		let track = tracks[0];

		specialView('lastfm', 'loading', 'similar tracks', track.title, track.artwork);

		apiRequest('GET', 'track.getsimilar', false, { track: track.title, artist: track.artist.name, limit: 50 }, (err, res) => {
			let tracks = [];

			if (err) console.error(err)
			else {
				for (let tr of res.similartracks.track)
					tracks.push(convertTrack(tr))
			}

			specialView('lastfm', tracks, 'similar tracks', track.title, track.artwork);
		})
	}

}


/** Static Properties **/
Lastfm.fullName = "Last.fm"
Lastfm.isGeneralPlugin = true

Lastfm.settings = {
	active: false,
	tempDisable: false
}

Lastfm.settingsItems = [
	{
		description: 'Disable scrobbling',
		type: 'checkbox',
		id: 'tempDisable'
	}
]

Lastfm.loginBtnHtml = `

	<div id="Btn_lastfm" class="button login lastfm hide" onclick="login('lastfm')">Scrobble with <b>Last.fm</b></div>
	<div id="LoggedBtn_lastfm" class="button login lastfm hide" onclick="logout('lastfm')">Disconnect</div>
	<span id="error_lastfm" class="error hide">Error, please try to login again</span>

`

Lastfm.loginBtnCss = `

	.lastfm {
		background-color: #DF2703;
		background-image: url(data:image/png;base64,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);
	}
`

Lastfm.contextmenuItems = [
	{
		title: 'Show similar tracks',
		fn: () => Lastfm.showSimilar(tracks)
	},
]

module.exports = Lastfm
///// API STUFF /////

const api_url = 'https://api.hypem.com/v2'

const deviceID = () => {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8)
		return v.toString(16)
	})
}

const apiRequest = (method, url, params, callback) => {

	if (settings.hypemachine.token) params.hm_token = settings.hypemachine.token

	let urlParameters = Object.keys(params).map((i) => typeof params[i] !== 'object' ? i+'='+params[i]+'&' : '' ).join('') // transforms to url format everything except objects

	let requestOptions = { url: api_url+url+'?'+urlParameters, method: method, json: true}

	if (method === 'POST') requestOptions.form = params

	request(requestOptions, (err, result, body) => {
		if (body && body.error) callback(body.error, body)
		else callback(err, body)
	})
}

const convertTrack = (rawTrack) => {

	return {
		'service': 'hypemachine',
		'title': rawTrack.title,
		'share_url': 'http://hypem.com/track/'+rawTrack.itemid,
		'artist': {
			'name': rawTrack.artist,
			'id': rawTrack.artist
		},
		'album': {
			'name': '',
			'id': ''
		},
		'id': rawTrack.itemid,
		'duration': rawTrack.time * 1000,
		'artwork': rawTrack.thumb_url
	}

}

////////////////////////////////
////////////////////////////////

class Hypemachine {
	/**
	* Fetch data
	*
	* @returns {Promise}
	*/
	static fetchData () {

		return new Promise((resolve, reject) => {

			if (!settings.hypemachine.token) return reject(['No access token', true])

			data.hypemachine = []

			apiRequest('GET', '/me/favorites', {count: 400}, (err, result) => {
				if (err) return reject([err])
				
				let tempFavTracks = []

				for (let i of result)
					tempFavTracks.push(convertTrack(i))

				Data.addPlaylist({
					service: 'hypemachine',
					id: 'favs',
					title: 'Liked tracks',
					icon: 'heart',
					artwork: '',
					tracks: tempFavTracks
				})

			})

			apiRequest('GET', '/popular', {count: 100}, (err, result) => {
				if (err) return reject([err])
				
				let tempPopularTracks = []

				for (let i of result)
					tempPopularTracks.push(convertTrack(i))

				Data.addPlaylist({
					service: 'hypemachine',
					id: 'chart3days',
					title: 'Popular now',
					icon: 'trophy',
					artwork: '',
					tracks: tempPopularTracks
				})

			
				apiRequest('GET', '/popular', {count: 100, mode: 'lastweek'}, (err, result) => {
					if (err) return reject([err])
					
					let tempLastweekTracks = []

					for (let i of result)
						tempLastweekTracks.push(convertTrack(i))

					Data.addPlaylist({
						service: 'hypemachine',
						id: 'chartweek',
						title: 'Popular last week',
						icon: 'trophy',
						artwork: '',
						tracks: tempLastweekTracks
					})

					resolve()
				})

			})

		})
	}

	/**
	 * Get the streamable URL
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} Callback function
	 */
	static getStreamUrl (track, callback) {
		callback(null, 'https://hypem.com/serve/public/'+track.id, track.id)
	}

	static login (callback) {
		settings.hypemachine.user = getById("hypemachineUser").value
		let pswrd = getById("hypemachinePasswd").value

		if (!settings.hypemachine.user || !pswrd) return

		apiRequest('POST', '/get_token', {username: settings.hypemachine.user, password: pswrd, device_id: deviceID()}, (err, result) => {

			if (err) return callback(err)
			if (result.status == "error") return callback(result)
			
			settings.hypemachine.token = result.hm_token

			callback()

		})

	}

	/**
	* Search
	* @param query {String}: the query of the search
	* @param callback
	*/
	static searchTracks (query, callback) {
		apiRequest('GET', '/tracks', {q: query}, (err, result) => {

			if (err) return console.error(err)
			let tracks = []

			for (let tr of result)
				if (tr) tracks.push(convertTrack(tr))

			callback(tracks, query)

		})
	}

	/**
	 * Like a song
	 *
	 * @param track {Object} The track object
	 */ 
	static like (track, callback) {

		apiRequest('POST', '/me/favorites', {type: 'item', val: track.id}, (err, res) => {
			callback(err)
		})

	}

	/**
	 * UnLike a song
	 *
	 * @param track {Object} The track object
	 */ 
	static unlike (track, callback) {
		this.like(track, callback) // This is the same method to like/unlike
	}

}

Hypemachine.fullName = "Hype Machine"
Hypemachine.favsLocation = "hypemachine,favs"
Hypemachine.scrobbling = true
Hypemachine.color = "#75C044"
Hypemachine.settings = {
	active: false
}

Hypemachine.loginBtnHtml = `

	<div id='LoggedBtn_hypemachine' class='button login hypemachine hide' onclick="logout('hypemachine')">Disconnect</div>
	<div id='Btn_hypemachine' class='button login hypemachine hide' onclick="removeClass('hm_form', 'hide')"><span>Listen with <b>Hype Machine</b></span>
	  <br>
	  <div id='hm_form' class='hide form'>
		<input id='hypemachineUser' type='text' placeholder='Username'>
		<br/>
		<input id='hypemachinePasswd' type='password' placeholder='Password'>
		<br/>
		<input type='button' onclick="login('hypemachine')" value='Login' />
	  </div>
	</div>
	<span id='error_hypemachine' class='error hide'>Error, please check your credentials</span>

`

Hypemachine.loginBtnCss = `
	.hypemachine {
	  background-color: #83c441;
	  background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AoPEQQV3BZRfQAAAiNJREFUeNrtm0tOAzEMhmur3ILuQUI8Nqzb+99hKpULdI2EwgqpLdM2Lz/G+f8ddErsL7bHCclqBUEQBEEQBEFQsUhzsJRSEneIiMIB1ABnBZMigtMESR6g1TqoOZYowBJHpNNK2xaSNli7qGvbRxKGWUPTtLlr7fEKTtJ+GgmchD80KrxeflHtIEsH18tHArw2Xwnw2nym3D8UHVyt/wR4bRAZ8NrSm4GlbZlHiL62VOalrWe9RSLn7lpA8xHJlqmbUko/x2P60xKjkKwA1m4tWTb3c5zYG7xbn5f+XiMK2bJ+aECX9mW9pKY15zva3QNrpm+EN/0lo3ArEe1JwlIOAAEQAHvubixhDNMIjLZJESqFLSaHozhqFdk8UrSES+FeEC0ngzxs49euHjzY6uIlUnUqykkJcPMWLjoR5ah+mu1I16Szt9OuRETu+sCr/3tw+tamW3StjbPYIC2JvrMa6HGGl9Arcu/WIqKyTyZczjgg3s8KvvfA6BDv3jOpCVukbgbAa/RHAdl0QjUnhCODLMk+aqkDuOow+E2lHuVqyLtyPX0hq4E9tycid+UitDoSd4fXqwEkeematKPv9HtSEZu7euoxPksaePr83DnolKlp2qdp2p/9fEs54MzKzZzB2+0u5TxnLfNa8vb68dnLkSiwisL4cPj63mweH3ptBbWWBg8dAEnWvhHWzVwK4un55b3keVwZgyAIgiAIgiDon34B3f0k5sxQPEQAAAAASUVORK5CYII=');
	}
`

Hypemachine.contextmenuItems = []

module.exports = Hypemachine
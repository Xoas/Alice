//--------------------------------------------
const YouTube = require('youtube-node'),
	ytdl = require('ytdl-core'),
	api = exports;

//**** For Spotify stream url parsing *****///

var youTube = new YouTube();
var running;

api.getStreamUrlFromName = function(duration, name, callback) {
	youTube.setKey(data.client_ids.youtube.client_id);

	duration = duration / 1000; // we want it in seconds

	youTube.search(name, 5, function(error, result) {
		if (error) return callback(error);

		var videoIds = result.items[0].id.videoId+","+result.items[1].id.videoId+","+result.items[2].id.videoId+","+result.items[3].id.videoId+","+result.items[4].id.videoId;
		var durations = [];

		youTube.getById(videoIds, function(error, result) {
			if (error) return console.error(error);

			for (t of result.items)
				durations.push({id: t.id, duration_diff: Math.abs(ISO8601ToSeconds(t.contentDetails.duration) - duration)})

			durations.sort(function(a, b){ // We sort potential tracks by duration difference with original track
					var keyA = a.duration_diff,
							keyB = b.duration_diff;
					
					if(keyA < keyB) return -1;
					if(keyA > keyB) return 1;
					return 0;
			});

			ytdl.getInfo('https://www.youtube.com/watch?v='+durations[0].id, [], function(err, info){
				if (err) {
					console.error(err);
					return callback("no stream for this url");
				}
				
				for (i of info.formats)
					if (i.audioBitrate == 128 && i.audioEncoding == "vorbis")
						return callback(null, i.url);
					
				callback("no stream for this url");
			});

		});

	});
}
/**
* Login to a given API
*
* @param service {Object} The services's API Object
*/
function login(service) {
	removeClass('loading', 'hide')

	function continueLogin() {
		window[service].login(err => {

			addClass('loading', 'hide')

			if (err == "stopped") return

			if (err) {
				console.error(err)

				settings[service].active = false

				addClass("LoggedBtn_" + service, "hide")
				removeClass(["Btn_" + service, "error_" + service], "hide")

			} else {
				settings[service].active = true
				settings[service].error = false

				addClass(["Btn_" + service, "error_" + service], "hide")
				removeClass("LoggedBtn_" + service, "hide")
			}

			asyncSaveSettings()

		})
	}

	if (!settings.client_ids && service !== 'local')
		testInternet(false, false, up => {
			if (up) return continueLogin()
			
			addClass('loading', 'hide')
			return alert("Error connecting to internet !")
		})
	
	else continueLogin()
}

/**
 * Logout of a given service
 *
 * @param service {Object} The services's API Object
 */
function logout(service) {
	settings[service].active = false

	addClass("LoggedBtn_" + service, "hide")
	removeClass("Btn_" + service, "hide")

	asyncSaveSettings()
}

function updateBtns() {
	for (let s of services) {
		if (window[s].loginBtnHtml) getById("tempServices").innerHTML += window[s].loginBtnHtml
		if (window[s].loginBtnCss) getById("tempStyles").innerHTML += window[s].loginBtnCss
	}

	for (let s of services) { // Again to process html

		if (!settings[s]) settings[s] = window[s].settings

		if (settings[s].active && !settings[s].error) {

			removeClass("LoggedBtn_" + s, "hide")
			addClass("Btn_" + s, "hide")
			if (s = "local") getById("LoggedBtn_" + s).innerHTML = settings[s].paths

		} else if (settings[s].error) {
			removeClass(["error_" + s, "Btn_" + s], "hide")
			addClass("LoggedBtn_" + s, "hide")
		} else {
			removeClass("Btn_" + s, "hide")
			addClass("LoggedBtn_" + s, "hide")
		}
	}
}

//////////////////////////////
//     When we start      ///
////////////////////////////

settings = conf.get("settings")

updateBtns()
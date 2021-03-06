///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          MusicBrainz Import helper functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * How to use this module?
 *
 * - First build a release object (see expected format below) that you'll fill in from source of data
 * - Call as follows, e.g.:
 *     var parameters = MBReleaseImportHelper.buildFormParameters(parsedRelease, optionalEditNote);
 * - Then build the HTML that you'll inject into source site page:
 *     var formHtml = MBReleaseImportHelper.buildFormHTML(parameters);
 * - Addinionally, you can inject a search link to verify that the release is not already known by MusicBrainz:
 *     var linkHtml = MBReleaseImportHelper.buildSearchLink(parsedRelease);
 *
 * Expected format of release object:
 *
 *     release = {
 *         title,
 *         artist_credit,
 *         type,
 *         status,
 *         language,
 *         script,
 *         packaging,
 *         country,
 *         year,
 *         month,
 *         day,
 *         labels = [ { name, mbid, catno }, ... ],
 *         barcode,
 *         urls = [ {url, link_type }, ... ],
 *         discs = [
 *             {
 *                 title,
 *                 format,
 *                 tracks = [
 *                     { number, title, duration, artist_credit },
 *                     ...
 *                 ]
 *             },
 *             ...
 *         ],
 *     }
 *
 *     where 'artist_credit' has the following format:
 *
 *     artist_credit = [
 *         {
 *             credited_name,
 *             artist_name,
 *             artist_mbid,
 *             joinphrase
 *         },
 *         ...
 *     ]
 *
 */

var MBReleaseImportHelper = (function() {

    // --------------------------------------- publics ----------------------------------------- //

    var url_types = {
       purchase_for_download: 74,
       download_for_free: 75,
       discogs: 76,
       purchase_for_mail_order: 79,
       other_databases: 82,
       stream_for_free: 85,
       license: 301
    }

    // compute HTML of search link
    function fnBuildSearchLink(release) {

        var totaltracks = 0;
        for (var i=0; i < release.discs.length; i++) {
            totaltracks += release.discs[i].tracks.length;
        }
        var release_artist = "";
        for (var i=0; i < release.artist_credit.length; i++) {
            var ac = release.artist_credit[i];
            release_artist += ac.artist_name;
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != "") {
                release_artist += ac.joinphrase;
            } else {
                if (i != release.artist_credit.length-1) release_artist += ", ";
            }
        }

        var innerHTML = '<a href="http://musicbrainz.org/search?query=artist%3A(' + luceneEscape(release_artist) + ')%20release%3A(' + luceneEscape(release.title) + ')%20tracks%3A(' + totaltracks + ')';
        if(release.country) innerHTML += '%20country:'+release.country;
        innerHTML += '&type=release&advanced=1">Search in MusicBrainz</a>';

        return innerHTML;
    }

    // compute HTML of import form
    function fnBuildFormHTML(parameters) {

        // Build form
        var innerHTML = '<form action="//musicbrainz.org/release/add" method="post" target="_blank" accept-charset="UTF-8" charset="' + document.characterSet + '">';
        parameters.forEach(function(parameter) {
            var value = parameter.value + "";
            innerHTML += "<input type='hidden' value='" + value.replace(/'/g,"&apos;") + "' name='" + parameter.name + "'/>";
        });

        innerHTML += '<input type="submit" value="Import into MB">';
        innerHTML += '</form>';

        return innerHTML;
    }

    // build form POST parameters that MB is waiting
    function fnBuildFormParameters(release, edit_note) {
        // Form parameters
        var parameters = new Array();
        appendParameter(parameters, 'name', release.title);

        // Release Artist credits
        buildArtistCreditsFormParameters(parameters, "", release.artist_credit);

        if (release["secondary_types"]) {
            for (var i=0; i < release.secondary_types.length; i++) {
                appendParameter(parameters, 'type', release.secondary_types[i]);
            }
        }
        appendParameter(parameters, 'status', release.status);
        appendParameter(parameters, 'language', release.language);
        appendParameter(parameters, 'script', release.script);
        appendParameter(parameters, 'packaging', release.packaging);

        // ReleaseGroup
        appendParameter(parameters, 'release_group', release.release_group_mbid);

        // Date + country
        appendParameter(parameters, 'country', release.country);
        if (!isNaN(release.year) && release.year != 0) { appendParameter(parameters, 'date.year', release.year); };
        if (!isNaN(release.month) && release.month != 0) { appendParameter(parameters, 'date.month', release.month); };
        if (!isNaN(release.day) && release.day != 0) { appendParameter(parameters, 'date.day', release.day); };

        // Barcode
        appendParameter(parameters, 'barcode', release.barcode);

        // Label + catnos
        for (var i=0; i < release.labels.length; i++) {
            var label = release.labels[i];
            appendParameter(parameters, 'labels.'+i+'.name', label.name);
            appendParameter(parameters, 'labels.'+i+'.mbid', label.mbid);
            if (label.catno != "none") {
                appendParameter(parameters, 'labels.'+i+'.catalog_number', label.catno);
            }
        }

        // URLs
        for (var i=0; i < release.urls.length; i++) {
            var url = release.urls[i];
            appendParameter(parameters, 'urls.'+i+'.url', url.url);
            appendParameter(parameters, 'urls.'+i+'.link_type', url.link_type);
        }

        // Mediums
        var total_tracks = 0;
        var total_tracks_with_duration = 0;
        var total_duration = 0;
        for (var i=0; i < release.discs.length; i++) {
            var disc = release.discs[i];
            appendParameter(parameters, 'mediums.'+i+'.format', disc.format);
            appendParameter(parameters, 'mediums.'+i+'.name', disc.title);

            // Tracks
            for (var j=0; j < disc.tracks.length; j++) {
                var track = disc.tracks[j];
                total_tracks++;
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.number', track.number);
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.name', track.title);
                var tracklength = "?:??";
                var duration_ms = hmsToMilliSeconds(track.duration);
                if (!isNaN(duration_ms)) {
                  tracklength = duration_ms;
                  total_tracks_with_duration++;
                  total_duration += duration_ms;
                }
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.length', tracklength);

                buildArtistCreditsFormParameters(parameters, 'mediums.'+i+'.track.'+j+'.', track.artist_credit);
            }
        }

        // Guess release type if not given
        if (!release.type && release.title && total_tracks == total_tracks_with_duration) {
          release.type = fnGuessReleaseType(release.title, total_tracks, total_duration);
        }
        appendParameter(parameters, 'type', release.type);

        // Add Edit note parameter
        appendParameter(parameters, 'edit_note', edit_note);

        return parameters;
    }

    // Convert a list of artists to a list of artist credits with joinphrases
    function fnArtistCredits(artists_list) {
      var artists = artists_list.map(function(item) { return {artist_name: item}; });
      if (artists.length > 2) {
        var last = artists.pop();
        last.joinphrase = '';
        var prev = artists.pop();
        prev.joinphrase = ' & ';
        for (var i = 0; i < artists.length; i++) {
          artists[i].joinphrase = ', ';
        }
        artists.push(prev);
        artists.push(last);
      } else if (artists.length == 2) {
        artists[0].joinphrase = ' & ';
      }
      return artists;
    }

    // Try to guess release type using number of tracks, title and total duration (in millisecs)
    function fnGuessReleaseType(title, num_tracks, duration_ms) {
      if (num_tracks < 1) return '';
      var has_single = !!title.match(/\bsingle\b/i);
      var has_EP = !!title.match(/\bEP\b/i);
      if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
      }
      var perhaps_single = ((has_single && num_tracks <= 4) || num_tracks <= 2);
      var perhaps_EP = has_EP || (num_tracks > 2 && num_tracks <= 6);
      var perhaps_album = (num_tracks > 8);
      if (isNaN(duration_ms)) {
        // no duration, try to guess with title and number of tracks
        if (perhaps_single && !perhaps_EP && !perhaps_album) return 'single';
        if (!perhaps_single && perhaps_EP && !perhaps_album) return 'EP';
        if (!perhaps_single && !perhaps_EP && perhaps_album) return 'album';
        return '';
      }
      var duration_mn = duration_ms / (60*1000);
      if (perhaps_single && duration_mn >= 1 && duration_mn < 7) return 'single';
      if (perhaps_EP && duration_mn > 7 && duration_mn <= 30) return 'EP';
      if (perhaps_album && duration_mn > 30) return 'album';
      return '';
    }

    // convert HH:MM:SS or MM:SS to milliseconds
    function hmsToMilliSeconds(str) {
        if (typeof str == 'number') return str;
        var t = str.split(':');
        var s = 0;
        var m = 1;
        while (t.length > 0) {
            s += m * parseInt(t.pop(), 10);
            m *= 60;
        }
        return s*1000;
    }

    // --------------------------------------- privates ----------------------------------------- //

    function appendParameter(parameters, paramName, paramValue) {
        if(!paramValue) return;
        parameters.push( { name: paramName, value: paramValue } );
    }

    function luceneEscape(text) {
        var newtext = text.replace(/[-[\]{}()*+?~:\\^!"]/g, "\\$&");
        return newtext.replace("&&", "\&&").replace("||", "\||");
    }

    function buildArtistCreditsFormParameters(parameters, paramPrefix, artist_credit) {
        if(!artist_credit) return;
        for (var i=0; i < artist_credit.length; i++) {
            var ac = artist_credit[i];
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.name', ac.credited_name);
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.artist.name', ac.artist_name);
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.mbid', ac.mbid);
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != "") {
                appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.join_phrase', ac.joinphrase);
            }
        }
    }

    // ---------------------------------- expose publics here ------------------------------------ //

    return {
       buildSearchLink: fnBuildSearchLink,
       buildFormHTML: fnBuildFormHTML,
       buildFormParameters: fnBuildFormParameters,
       makeArtistCredits: fnArtistCredits,
       guessReleaseType: fnGuessReleaseType,
       hmsToMilliSeconds: hmsToMilliSeconds,
       URL_TYPES: url_types
    };
})();

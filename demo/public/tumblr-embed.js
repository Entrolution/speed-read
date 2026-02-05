/**
 * Speed-Read Tumblr Embed
 *
 * Automatically replaces links pointing to the speed-read embed page
 * with inline <speed-reader> components.
 *
 * Theme setup — add both script tags before </body> in your Tumblr theme:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@latest"></script>
 *   <script src="https://entrolution.github.io/speed-read/tumblr-embed.js"></script>
 *
 * Post usage — in the post HTML, add a plain link:
 *
 *   <a href="https://entrolution.github.io/speed-read/embed.html?tumblr=TUMBLR_URL">Read</a>
 *
 * Supported query parameters:
 *   src            - URL to an EPUB, PDF, or CBZ file
 *   tumblr         - Tumblr post URL
 *   tumblr-proxy   - Custom CORS proxy URL
 *   tumblr-playlist - Google Docs playlist URL
 *   manifest       - chapters.json manifest URL
 *   height         - Reader height (default: 600px)
 */
(function () {
  var EMBED_PATH = '/speed-read/embed.html';
  var ATTRS = ['src', 'tumblr', 'tumblr-proxy', 'tumblr-playlist', 'manifest'];

  function init() {
    var links = document.querySelectorAll('a[href*="' + EMBED_PATH + '"]');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      try {
        var url = new URL(link.href);
        var params = url.searchParams;

        var hasContent = ATTRS.some(function (attr) {
          return params.has(attr);
        });
        if (!hasContent) continue;

        var container = document.createElement('div');
        container.style.height = params.get('height') || '600px';
        container.style.width = '100%';
        container.style.margin = '1em 0';

        var reader = document.createElement('speed-reader');
        reader.style.width = '100%';
        reader.style.height = '100%';

        for (var j = 0; j < ATTRS.length; j++) {
          var value = params.get(ATTRS[j]);
          if (value) reader.setAttribute(ATTRS[j], value);
        }

        container.appendChild(reader);
        link.parentNode.replaceChild(container, link);
      } catch (e) {
        // leave the link alone if URL parsing fails
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

"use strict";
/**
 * Narrative Scanner — barrel export
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsSource = exports.RedditSource = exports.TwitterSource = exports.DEFAULT_CONFIG = exports.NarrativeScanner = void 0;
var narrative_scanner_js_1 = require("./narrative-scanner.js");
Object.defineProperty(exports, "NarrativeScanner", { enumerable: true, get: function () { return narrative_scanner_js_1.NarrativeScanner; } });
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return types_js_1.DEFAULT_CONFIG; } });
var twitter_js_1 = require("./sources/twitter.js");
Object.defineProperty(exports, "TwitterSource", { enumerable: true, get: function () { return twitter_js_1.TwitterSource; } });
var reddit_js_1 = require("./sources/reddit.js");
Object.defineProperty(exports, "RedditSource", { enumerable: true, get: function () { return reddit_js_1.RedditSource; } });
var news_js_1 = require("./sources/news.js");
Object.defineProperty(exports, "NewsSource", { enumerable: true, get: function () { return news_js_1.NewsSource; } });
//# sourceMappingURL=index.js.map
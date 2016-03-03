var gutil  = require('gulp-util');
var tinylr = require('tiny-lr');
var path   = require('path');

/**
 * Run dist live-reload server
 */
module.exports = function (gulp) {
  var port = process.env.PORT || 8080;

  return function () {
    gulp.isWatchingStuff = true; // prevent exit

    require('../lib/server').listen(port, null, 'index', true);
    gutil.log('Listening on port ' + port);

    var lr = tinylr();
    lr.listen(35729);
    gutil.log('LiveReload server started on port 35729');
    gulp.watch('build/**/*', function (e) {
      var file = path.relative('build', e.path);
    });

    // only care about non-minified tasks here
    gulp.watch('src/index.jade',       ['html']);
    gulp.watch('config/flags.conf.js', ['html']);
    gulp.watch('src/**/*.js',          ['js']);
    gulp.watch('package.json',         ['js']);
    gulp.watch('src/**/*.html.jade',   ['js']);
    gulp.watch('src/**/*.styl',        ['css']);
  };

};

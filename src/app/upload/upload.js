angular.module('prx.upload', ['ui.router', 'angular-dnd', 'angular-evaporate', 'angular-uuid', 'prx.analyze-audio', 'prx.upload.filepicker', 'prx.dsp'])
.config(function (evaporateProvider) {
  evaporateProvider
  .signerUrl(FEAT.UPLOADS_SIGNER_URL)
  .awsKey(FEAT.UPLOADS_AWS_KEY)
  .bucket(FEAT.UPLOADS_AWS_BUCKET)
  .awsUrl(FEAT.UPLOADS_AWS_URL)
  .cloudfront(FEAT.UPLOADS_CLOUDFRONT)
  .options({ logging: FEAT.UPLOADS_LOGGING });
})
.factory('URL', function ($window) {
  return $window.URL;
})
.service('Upload', function UploadService(evaporate, $uuid, MimeType, $q, $rootScope) {

  var uploads = {};

  var safeName = function(name) {
    return name.replace(/[^a-z0-9\.]+/gi,'_');
  };

  var uploadKey = function (guid, name) {
    return [FEAT.APPLICATION_VERSION, guid, name].join('/');
  };

  function Upload(file) {
    var u = this;
    u.file = file;

    u.guid = $uuid.v4();
    u.name = safeName(u.file.name);
    u.path = uploadKey(u.guid, u.name);
    u.type = MimeType.lookup(file).full();

    u.progress = 0;

    var up = evaporate.add({
      file: u.file,
      name: u.path,
      contentType: u.type,
      xAmzHeadersAtInitiate: {
        'x-amz-acl': 'private'
      },
      notSignedHeadersAtInitiate: {
        'Content-Disposition': 'attachment; filename=' + u.name
      }
    });

    u.uploadId = up.uploadId;

    u.promise = up.then(
      function() {
        return {upload: u};
      },
      function(msg) {
        return $q.reject(msg);
      },
      function(p) {
        u.progress = p;
        return p;
      }
    );

    uploads[u.guid] = u;
  }

  Upload.prototype = {
    cancel: function () {
      return evaporate.cancel(this.uploadId);
    },
    then: function () {
      return this.promise.then.apply(this.promise, arguments);
    }
  };

  this.upload = function (file) {
    return new Upload(file);
  };

  this.getUpload = function (uploadId) {
    return uploads[uploadId];
  };
});

/* istanbul ignore next */
if (FEAT.TCF_DEMO) {
  angular.module('prx.upload', ['ui.router', 'angular-dnd', 'angular-evaporate', 'angular-uuid'])
  .config(function ($stateProvider, evaporateProvider) {
    $stateProvider.state('upload', {
      url: '/upload',
      abstract: true
    }).state('upload.new_story', {
        title: 'Create Your Story',
        url: '^/upload',
        params: {uploads: []},
        resolve: {
          files: function ($stateParams, Upload, story) {
            if (story.uploads) {
              return story.uploads;
            } else {
              var uploads = [];
              angular.forEach($stateParams.uploads, function (id, index) {
                uploads.push(Upload.getUpload(id));
                uploads[index].type = (index === 0 ? 'Intro' : index % 2 ? 'Segment' : 'Break');
              });
              story.uploads = uploads;
              return uploads;
            }
          },
          account: function (ngHal) {
            return ngHal.follow('prx:account', {id: 179396});
          },
          story: function (ngHal, account) {
            return ngHal.build('prx:story', {id:''}).then(function (doc) {
              doc.title = "Why Is This Cow So Freaking Angry?";
              doc.shortDescription = "This cow gives a first hand account, telling you what farmers do not want you to know. The story is udderly terrifying.";
              doc.tags = ["farming", "cows", "agriculture", "milking"];
              doc.duration = 65;
              doc.publishedAt = new Date();
              doc.relatedWebsite = "http://www.prx.org";
              return doc;
            });
          }
        },
        views: {
          '@': {
            templateUrl: 'upload/upload.html',
            controller: 'UploadCtrl as upload'
          }
        }
      }
    ).state('upload.new_story.public_radio_t_and_c', {
      params: { uploads: [] },
      views: {
        'modal@': {
          templateUrl: 'upload/public_radio_modal.html'
        }
      }
    });

    evaporateProvider
    .signerUrl(FEAT.UPLOADS_SIGNER_URL)
    .awsKey(FEAT.UPLOADS_AWS_KEY)
    .bucket(FEAT.UPLOADS_AWS_BUCKET)
    .awsUrl(FEAT.UPLOADS_AWS_URL)
    .cloudfront(FEAT.UPLOADS_CLOUDFRONT)
    .options({ logging: FEAT.UPLOADS_LOGGING });
  })
  .service('UploadTarget', function ($rootScope) {
    var targets = [],
        active  = {};

    this.registerTarget = function (targetName) {
      if (targets.indexOf(targetName) == -1) {
        targets.push(targetName);
        active[targetName] = false;
      }
    };

    this.targetActive = function (targetName) {
      return !!active[targetName];
    };

    this.showTarget = function (targetName) {
      if (targets.indexOf(targetName) !== -1) {
        active[targetName] = true;
      }
    };

    this.dismissTarget = function (targetName) {
      if (targets.indexOf(targetName) !== -1) {
        active[targetName] = false;
      }
    };

    this.deregisterTarget = function (targetName) {
      if (targets.indexOf(targetName) !== -1) {
        targets.splice(targets.indexOf(targetName), 1);
        active[targetName] = undefined;
      }
    };

    $rootScope.$on('$stateChangeStart', function () {
      angular.forEach(active, function (val, key) {
        active[key] = false;
      });
    });
  })
  .directive('prxFileTarget', function () {
    return {
      restrict: 'E',
      priority: 1000,
      templateUrl: "upload/file_target.html",
      replace: true,
      scope: {
        targetName: '@name'
      },
      controller: 'prxFileTargetCtrl',
      controllerAs: 'target',
      bindToController: true
    };
  })
  .directive('prxFileSelect', function () {
    return {
      restrict: 'A',
      require: '^prxFileTarget',
      link: function (scope, elem, attrs, ctrl) {
        ctrl.selectFiles = function () {
          elem[0].click();
        };
      }
    };
  })
  .service('Validate', function ValidateService($timeout, $q) {
    var invalidatedOnce = true;

    function validationResult (file) {
      return function () {
        if (invalidatedOnce) {
          return file;
        } else {
          invalidatedOnce = true;
          return $q.reject({error: "MP3 bitrate too low!", file: file});
        }
      };
    }

    this.validate = function (file) {
      window.validateFile = file;
      return $timeout(angular.noop, Math.random() * 1500 + 500).then(validationResult(file));
    };
  })
  .service('MimeType', function MimeTypeService() {

    var expectedMimeTypes = {
      "aif": "audio\/x-aiff",
      "aifc": "audio\/x-aiff",
      "aiff": "audio\/x-aiff",
      "caf": "audio\/x-caf",
      "flac": "audio\/x-flac",
      "m2a": "audio\/mpeg",
      "m3a": "audio\/mpeg",
      "m4a": "audio\/mp4",
      "mp2": "audio\/mpeg",
      "mp2a": "audio\/mpeg",
      "mp3": "audio\/mpeg",
      "mp4": "video\/mp4",
      "mp4a": "audio\/mp4",
      "mpga": "audio\/mpeg",
      "oga": "audio\/ogg",
      "ogg": "audio\/ogg",
      "spx": "audio\/ogg",
      "wav": "audio\/x-wav",
      "weba": "audio\/webm",
      "gif": "image\/gif",
      "jpe": "image\/jpeg",
      "jpeg": "image\/jpeg",
      "jpg": "image\/jpeg",
      "png": "image\/png",
      "svg": "image\/svg+xml",
      "svgz": "image\/svg+xml",
      "webp": "image\/webp"
    };

    this.lookup = function(file, defaultType) {
      defaultType = defaultType || "application\/octet-stream";

      var type = file.type;
      if (typeof type === 'undefined' || type === null || type === '') {
        var ext = file.name.split('.').pop();
        type = expectedMimeTypes[ext];
      }
      return type || defaultType;
    };

  })
  .service('Upload', function UploadService(evaporate, $uuid, MimeType, $q) {

    var uploads = {};

    var safeName = function(name) {
      return name.replace(/[^a-z0-9\.]+/gi,'_');
    };

    var uploadKey = function (guid, name) {
      var av = FEAT.APPLICATION_VERSION || 'development';
      return [av, guid, name].join('/');
    };

    function Upload(file) {
      var u = this;
      u.file = file;

      u.guid = $uuid.v4();
      u.name = safeName(u.file.name);
      u.path = uploadKey(u.guid, u.name);
      u.type = MimeType.lookup(file);

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
          // console.log("complete!");
          return {upload: u};
        },
        function(msg) {
          // console.log("error!", msg);
          return $q.reject(msg);
        },
        function(p) {
          u.progress = p;
          return p;
        }
      );

      uploads[u.uploadId] = u;
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
  })
  .controller('prxFileTargetCtrl', function (UploadTarget, $scope, Upload, Validate, $state, $q, $timeout) {
    var ctrl = this, errorClearer;

    var MESSAGES = {
      NO_DRAG: "Drag Files Here",
      DRAG: "Drop Files Here to Upload",
      DROPPED: "Analyzing..."
    };

    UploadTarget.registerTarget(this.targetName);

    this.visible = function () {
      return UploadTarget.targetActive(this.targetName);
    };

    this.message = MESSAGES.NO_DRAG;

    this.updateMessage = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (this.message != MESSAGES.DRAG) {
        this.message = MESSAGES.DRAG;
      }
    };

    this.filesDropped = function (event) {
      event.preventDefault();
      event.stopPropagation();
      this.message = MESSAGES.DROPPED;
      var validations = [];
      if (errorClearer) {
        $timeout.cancel(errorClearer);
        clearError();
      }
      angular.forEach(event.dataTransfer.files, function (file) {
        validations.push(Validate.validate(file));
      });
      $q.all(validations).then(function (validFiles) {
        angular.forEach(validFiles, function (file, index) {
          validFiles[index] = Upload.upload(file).uploadId;
        });
        return validFiles;
      }, function (validationError) {
        ctrl.message = MESSAGES.NO_DRAG;
        ctrl.errorMessage = validationError.error;
        errorClearer = $timeout(clearError, 5000);
        return errorClearer.then(function () {
          return $q.reject(validationError.error);
        });
      }).then(function (uploads) {
        $state.go('upload.new_story', {uploads: uploads});
      });
    };

    this.showFileSelect = function () {
      return this.message == MESSAGES.NO_DRAG;
    };

    this.dragLeave = function () {
      this.message = MESSAGES.NO_DRAG;
    };

    this.busy = function () {
      return this.message == MESSAGES.DROPPED;
    };

    $scope.$on("$destroy", function () {
      UploadTarget.deregisterTarget(targetName);
    });

    function clearError () {
      ctrl.errorMessage = null;
      errorClearer = null;
    }
  })
  .controller('UploadCtrl', function (files, $window, story, $scope, $controller, account) {
    var audio = new $window.Audio();
    var nowPlaying;
    this.files = files;
    this.lastSaved = new Date();

    this.prsEnabled = true;
    this.prxRemixEnabled = true;
    this.listener = false;
    this.story = story;

    this.save = function () {
      this.lastSaved = new Date();
    };

    this.dragControlListeners = {
      accept: function (sourceItemHandleScope, destSortableScope) {
        return true;
      },
      itemMoved: function (event) {

      },
      orderChanged: function (event) {

      }
    };

    this.coverClick = function() {
      picker = angular.element(document.querySelector('#coverFile'))[0];
      picker.click();
    };

    this.coverChange = function (event, files) {
      file = files[0];
      src = URL.createObjectURL(file);
      display = angular.element(document.querySelector('#coverDisplay'))[0];
      display.style.backgroundPosition = 'center center';
      display.style.backgroundSize = 'cover';
      display.style.backgroundImage = "url(" + src + ")";
      this.story.coverUrl = src;
    };

    this.thumbClick = function() {
      picker = angular.element(document.querySelector('#thumbFile'))[0];
      picker.click();
    };

    this.thumbChange = function (event, files) {
      file = files[0];
      src = URL.createObjectURL(file);
      display = angular.element(document.querySelector('#thumbDisplay'))[0];
      display.style.backgroundPosition = 'initial';
      display.style.backgroundSize = 'cover';
      display.style.backgroundImage = "url(" + src + ")";
      this.story.imageUrl = src;
    };

    this.categories = {
      'Current Event': ['1','2'],
      'Arts & Entertainment': ['3','4'],
    };

    this.preview = function (file) {
      if (nowPlaying != file) {
        nowPlaying = file;
        audio.pause();
        audio.src = $window.URL.createObjectURL(file.file);
        audio.play();
      } else {
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }
      }
    };

    this.previewing = function (file) {
      return nowPlaying == file && !audio.paused;
    };

    this.inPreview = false;

    $scope.story = $controller('StoryCtrl', {story: story, account: account, audioUrls: [], series: undefined, $scope: $scope});
  })
  .directive('onPageScroll', function ($window) {
    return {
      restrict: 'A',
      controller: function () {
        this.root = null;

        this.statusBar = undefined;
        this.statusBarPlaceholder = undefined;

        this.inspectors = [];
        this.inspectorPlaceholders = [];


        this.registerStatusBar = function (elem) {
          this.statusBar = elem;
        };
        this.registerStatusBarPlaceholder = function (elem) {
          this.statusBarPlaceholder = elem;
        };
        this.registerInspector = function (elem) {
          this.inspectors.push(elem);
        };
        this.registerInspectorPlaceholder = function (elem) {
          this.inspectorPlaceholders.push(elem);
        };

        this.findPosX = function (obj) {
          var curleft = 0;

          if(obj.offsetParent) {
            while(1) {
              curleft += obj.offsetLeft;

              if(!obj.offsetParent) {
                break;
              }

              obj = obj.offsetParent;
            }
          } else if (obj.x) {
            curleft += obj.x;
          }

          return curleft;
        };

        this.findPosY = function (obj) {
          var curtop = 0;

          if (obj.offsetParent) {
            while(1) {
              curtop += obj.offsetTop;

              if(!obj.offsetParent) {
                break;
              }

              obj = obj.offsetParent;
            }
          } else if (obj.y) {
            curtop += obj.y;
          }

          return curtop;
        };

        this.positionInspectors = function () {
          for (i = 0; i < this.inspectors.length; i++) {

            _placeholder = this.inspectorPlaceholders[i][0];
            _inspector = this.inspectors[i][0];

            _nextInspector = undefined;
            if (this.inspectors[i + 1]) {
              _nextInspector = this.inspectors[i + 1][0];
            }

            pageY = $window.pageYOffset;

            verticalOffset = 110;
            topMargin = 30;

            y = this.findPosY(_placeholder);

            if (pageY + verticalOffset > y) {
              // Has scrolled past the static location of the inspector,
              // so we need to figure out where to display it

              // Figure out if there's collision between the display location of
              // this inspector and the static location of the next inspector

              if ((typeof _nextInspector != 'undefined')) {
                nextY = this.findPosY(_nextInspector);

                collisionY = nextY - (verticalOffset + topMargin + _inspector.offsetHeight);
                adjCollisionY = (collisionY - 208);

                if (pageY > adjCollisionY) {
                  // Push the inspector off screen as necessary

                  distPastCollisionY = (pageY - adjCollisionY);
                  _y = (verticalOffset + topMargin) - distPastCollisionY;

                  _inspector.style.position = "fixed";
                  _inspector.style.top = _y + "px";
                  _inspector.style.left = 'initial';
                  _inspector.style.marginLeft = "-275px";
                } else {
                  // Pin the current header to the top of the view
                  _inspector.style.position = "fixed";
                  _inspector.style.top = (verticalOffset + topMargin) + "px";
                  _inspector.style.left = 'initial';
                  _inspector.style.marginLeft = "-275px";
                }

                // pushY = ();


              } else {
                // Pin the current header to the top of the view
                _inspector.style.position = "fixed";
                _inspector.style.top = (verticalOffset + topMargin) + "px";
                _inspector.style.left = 'initial';
                _inspector.style.marginLeft = "-275px";
              }
            } else {
              // Reset the inspector's styles
              _inspector.style.removeProperty('marginLeft');
              _inspector.style.removeProperty('margin');
              _inspector.style.removeProperty('position');
              _inspector.style.removeProperty('top');
              _inspector.style.removeProperty('left');
            }
          }
        };

        this.positionStatusBar = function () {
          bar = this.statusBar[0];
          placeholder = this.statusBarPlaceholder[0];

          if ($window.pageYOffset + 73 > this.findPosY(placeholder)) {
            placeholder.style.height = bar.offsetHeight + 'px';
            bar.style.position = "fixed";
            bar.style.top = "73px";
            this.statusBar.addClass('stuck');
          } else {
            placeholder.style.height = '0px';
            bar.style.position = 'static';
            bar.style.removeProperty('top');
            this.statusBar.removeClass('stuck');
          }
        };

        this.displayDiscoverTip = function () {
          tooltip = angular.element(document.querySelector('#discoverabilityTipText'))[0];

          details = angular.element(document.querySelector('#discDetails'))[0];
          music = angular.element(document.querySelector('#discMusic'))[0];
          producers = angular.element(document.querySelector('#discProducers'))[0];
          images = angular.element(document.querySelector('#discImages'))[0];

          if ($window.pageYOffset + 240 > this.findPosY(details)) {
            tooltip.innerHTML = 'Clear and consise story details improve searchability and improve the listening experience.';
          } else if ($window.pageYOffset + 240 > this.findPosY(producers)) {
            tooltip.innerHTML = "Listing story producers can create a connection with listeners, much like people having favorite musicians or directors.";
          } else if ($window.pageYOffset + 240 > this.findPosY(music)) {
            tooltip.innerHTML = "Listing the music used in your story can help listeners and buyers find your work.";
          } else {
            tooltip.innerHTML = "Good images dramatically increase the visual impact of your story's webpage, and help to engage the listener.";
          }
        };
      },
      link: function (scope, elem, attrs, ctrl) {
        ctrl.root = elem[0];

        angular.element($window).on('scroll', function (event) {
          ctrl.positionStatusBar();
          ctrl.positionInspectors();
          ctrl.displayDiscoverTip();
        });
      }
    };
  })
  .directive('statusBar', function () {
    return {
      restrict: 'A',
      require: '^onPageScroll',
      link: function (scope, elem, attrs, ctrl) {
        ctrl.registerStatusBar(elem);
      }
    };
  })
  .directive('statusBarPlaceholder', function () {
    return {
      restrict: 'A',
      require: '^onPageScroll',
      link: function (scope, elem, attrs, ctrl) {
        ctrl.registerStatusBarPlaceholder(elem);
      }
    };
  })
  .directive('inspector', function () {
    return {
      restrict: 'A',
      require: '^onPageScroll',
      link: function (scope, elem, attrs, ctrl) {
        ctrl.registerInspector(elem);
      }
    };
  })
  .directive('inspectorPlaceholder', function () {
    return {
      restrict: 'A',
      require: '^onPageScroll',
      link: function (scope, elem, attrs, ctrl) {
        ctrl.registerInspectorPlaceholder(elem);
      }
    };
  })
  .directive('prxUploadDecorateProgress', function () {
    return {
      restrict: 'E',
      templateUrl: 'upload/decorate_progress.html'
    };
  })
  .directive('fileChange', ['$parse', function($parse) {
    return {
      restrict: 'A',
      link: function ($scope, element, attrs) {

        // Get the function provided in the file-change attribute.
        // Note the attribute has become an angular expression,
        // which is what we are parsing. The provided handler is
        // wrapped up in an outer function (attrHandler) - we'll
        // call the provided event handler inside the handler()
        // function below.
        var attrHandler = $parse(attrs['fileChange']);

        // This is a wrapper handler which will be attached to the
        // HTML change event.
        var handler = function (e) {

          $scope.$apply(function () {

            // Execute the provided handler in the directive's scope.
            // The files variable will be available for consumption
            // by the event handler.
            attrHandler($scope, { $event: e, files: e.target.files });
          });
        };

        // Attach the handler to the HTML change event
        element[0].addEventListener('change', handler, false);
      }
    };
  }]);
}

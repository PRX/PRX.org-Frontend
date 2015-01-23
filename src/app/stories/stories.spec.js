describe('prx.stories', function () {
  beforeEach(module('prx.stories', 'angular-hal-mock'));

  describe ('Story mixin', function () {
    var  ngHal, mock;
    beforeEach(inject(function (_ngHal_) {
      ngHal = _ngHal_;
      mock = ngHal.mock('http://meta.prx.org/model/story');
    }));

    it('gets the image', function () {
      mock.stubFollow('prx:image', ngHal.mockEnclosure('http://meta.prx.org/model/image', 'foo.png'));
      mock.transform();
      expect(mock.imageUrl).toEqual('foo.png');
    });

    it ('gets null if the image fails', function () {
      mock.transform();
      expect(mock.imageUrl).toEqual(null);
    });

    it ('returns title for toString()', function () {
      mock.title = 'asdf';
      expect(mock.toString()).toEqual('asdf');
    });
  });

  describe ('StoryCtrl', function () {
    var ngHal, $controller;
    beforeEach(inject(function (_ngHal_, _$controller_) {
      ngHal = _ngHal_;
      $controller = _$controller_;
    }));

    it ('attaches the story and accounts injected to $scope', function () {
      var sigil = ngHal.mock();
      var scope = {};
      var controller = $controller('StoryCtrl', {story: sigil, account: sigil, image: sigil, series: sigil, audioUrls: [sigil], audioVersions: [sigil], $scope: scope});
      expect(controller.current).toBe(sigil);
      expect(controller.account).toBe(sigil);
      expect(controller.image).toBe(sigil);
    });

    it ('starts playback of the story if requested', function () {
      var player = jasmine.createSpyObj('player', ['play']);
      var story  = ngHal.mock();
      $controller('StoryCtrl', {story: story, prxPlayer: player, account: {}, image: {}, series: {}, $stateParams: {play: true, s:null}, $scope: {}, audioUrls: [], audioVersions: []});
      expect(player.play).toHaveBeenCalled();
      expect(player.play.calls.mostRecent().args[0].story).toEqual(story);
      $controller('StoryCtrl', {story: story, prxPlayer: player, account: {}, image: {}, series: {}, $stateParams: {play: true, s:undefined}, $scope: {}, audioUrls: [], audioVersions: []});
      expect(player.play).toHaveBeenCalled();
      expect(player.play.calls.mostRecent().args[0].story).toEqual(story);
    });
  });

  describe ('StoryDetailCtrl', function () {
    it ('attaches the story injected to $scope', inject(function ($controller) {
      var foo = 'asd', scope = {};
      var ctrl = $controller('StoryDetailCtrl', {story: foo, $scope: scope});
      expect(ctrl.current).toBe(foo);
    }));
  });

  describe ('story state', function () {
    var state, $injector, ngHal;
    beforeEach(inject(function ($state, _$injector_, _ngHal_) {
      state = $state.get('story.show');
      $injector = _$injector_;
      ngHal = _ngHal_;
    }));

    it ('gets the story based on the storyId', function () {
      var spy = ngHal.stubFollowOne('prx:story', ngHal.mock());
      $injector.invoke(state.resolve.story, null, {$stateParams: {storyId: 123}});
      expect(spy.calls.mostRecent().args[0]).toEqual({id: 123});
    });

    it ('gets the account based on the story', inject(function (ngHal, $rootScope) {
      var story = ngHal.mock(), account;
      story.stubFollow('prx:account', {a:1});
      expect($injector.
          invoke(state.resolve.account, null, {story: story}).
          get('a')).toResolveTo(1);
    }));

    it ('gets the image based on the story', inject(function (ngHal, $rootScope) {
      var story = ngHal.mock(), image;
      story.stubFollow('prx:image', {a:1});
      expect($injector.
          invoke(state.resolve.image, null, {story: story}).
          get('a')).toResolveTo(1);
    }));

    it('gets the series based on the story', inject(function (ngHal, $rootScope) {
      var story = ngHal.mock(), series;
      spyOn(story.links, 'all').and.returnValue(true);
      story.stubFollow('prx:series', {s:1});
      expect($injector.
        invoke(state.resolve.series, null, {story: story}).
        get('s')).toResolveTo(1);
    }));

    it('gets the versions based on the story', function () {
      var story = ngHal.mock();
      story.stubFollow('prx:audio-versions', [{url:'url'}]);

      expect($injector.invoke(state.resolve.audioVersions, null, {
        story: story
      }).then(function(s) { return s[0].url; })).toResolveTo('url');
    });

    xit ('gets the audioUrls based on the story', function () {
      var story = ngHal.mock('http://meta.prx.org/model/story', {account:true}),
        file1 = ngHal.mockEnclosure('file1.mp3'),
        file2 = ngHal.mockEnclosure('file2.mp3');
      story.stubFollow('prx:audio', [file1, file2]);
      expect($injector.invoke(state.resolve.audioUrls, null, {
        story: story
      }).then(function(d) { return d[1].url; })).toResolveTo('file2.mp3');
    });

    it ('sets the title appropriately', function () {
      expect($injector.invoke(state.title, null, {story: "story", account: "account"})).toEqual("story by account");
    });
  });

  describe('prxSocialActions directive', function () {
    var elem;
    beforeEach(module('templates'));

    beforeEach(inject(function ($compile, $rootScope) {
      elem = $compile('<prx-social-actions text="sigil"></prx-social-actions>')($rootScope);
      $rootScope.$digest();
    }));

    it('compiles', function () {
      expect(elem).toBeDefined();
    });

    it('sets $location on scope', function() {
      expect(elem.isolateScope().$location).toBeDefined();
    });
  });

  describe ('simpleFormat filter', function () {
    var filter;
    beforeEach(inject(function ($filter) {
      filter = $filter('simpleFormat');
    }));

    it ('wraps things in paragraphs', function () {
      expect(filter("This is a test\nof the simple format system.\n\nThis is only a test")).toEqual("<p>This is a test<br>of the simple format system.</p><p>This is only a test</p>");
    });
  });

  describe ('highlightTimecodes filter', function () {
    var filter;
    beforeEach(inject(function ($filter) {
      filter = $filter('highlightTimecodes');
    }));

    it ('wraps timecode-looking things in <strong>', function () {
      expect(filter('testing (0:00) testing (1:00 - 19:00) 1, 2, 3')).toEqual(
        'testing (<strong>0:00</strong>) testing (<strong>1:00</strong> - <strong>19:00</strong>) 1, 2, 3'
      );
    });
  });

  describe('sentence filter', function () {
    var filter;
    beforeEach(inject(function ($filter) {
      filter = $filter('sentence');
    }));

    it ('returns the same value with a single element', function () {
      expect(filter(['foo'])).toEqual('foo');
    });

    it ('joins two elements with "and"', function () {
      expect(filter(['foo', 'bar'])).toEqual('foo and bar');
    });

    it ('joins more than two elements with commas and and', function () {
      expect(filter(['foo', 'bar', 'baz'])).toEqual('foo, bar, and baz');
    });
  });

  describe ('absUrl filter', function () {
    var filter;

    beforeEach(inject(function ($filter) {
      filter = $filter('absUrl');
    }));

    it ('adds http:// when protocol is missing', function () {
      expect(filter('prx.org')).toEqual('http://prx.org');
    });

    it ('does nothing when protocol is present', function () {
      expect(filter('http://prx.org')).toEqual('http://prx.org');
    });
  });

  describe ('prettyUrl filter', function () {
    var filter;

    beforeEach(inject(function ($filter) {
      filter = $filter('prettyUrl');
    }));

    it ('strips off protocols', function () {
      expect(filter('http://prx.org')).toEqual('prx.org');
    });

    it ('strips off www', function () {
      expect(filter('www.prx.org')).toEqual('prx.org');
    });

    it ('strips off http://www.', function () {
      expect(filter('http://www.prx.org')).toEqual('prx.org');
    });

    it ('strips off trailing slash', function () {
      expect(filter('prx.org/')).toEqual('prx.org');
    });
  });

});

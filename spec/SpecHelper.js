beforeEach(function() {
  this.addMatchers({
    toSubclass: function(func) { return this.actual instanceof func; }
  });
});

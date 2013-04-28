var scope = this;

if(typeof require == "function"){
  Hydrate = require("../src/hydrate-bootstrap.js");
}

describe("Hydrate", function() {
  var hydrate;
  beforeEach(function() {
    hydrate = new Hydrate(new Hydrate.ContextResolver(scope));
  });
  function extend(subclass, superclass){
    if(Hydrate.Util.supportsProto){
      subclass.prototype.__proto__ = superclass.prototype
    } else {
      subclass.prototype = new superclass()
      subclass.prototype.constructor = subclass
    }
  }

  function BasicClass(){
    this.foo = "bar";
  }
  BasicClass.prototype.candy = function(){ return "sweet"; };

  function BasicSubclass(){
    this.foo = "baz";
  }
  extend(BasicSubclass, BasicClass);

  it("should cleanup hydrate properties", function() {
    var input = {}
    var basic = {f:[{a:{}}]}
    input.objArray = [{}, basic, {}];
    input.basic = basic;
    input.objHash = {a: {}, b: basic, c: {}};
    expect(hydrate.parse(hydrate.stringify(input))).toEqual(input);
  });

  it("should serialize primitives", function() {
    var inputs = [undefined, null, 3, "foo", ["a", 3, "bar"], true, false]
    for(var i = 0; i < inputs.length; i++){
      var input = inputs[i];
      expect(hydrate.parse(hydrate.stringify(input))).toEqual(input);
    }
    expect(hydrate.parse(hydrate.stringify(inputs))).toEqual(inputs);
  });

  it("should not serialize functions (when called directly)", function(){
    expect(function(){
      hydrate.stringify(function(){});
    }).toThrow({message: "can't serialize functions"});
  });

  it("should serialize basic hashes", function(){
    var input = {a: "f", b: 3, 1: 4, c: [1, 2, 3], d: {e: "f", g: 9}};
    var string = hydrate.stringify(input);
    var output = hydrate.parse(string);
    expect(output).toEqual(input);
  });

  it("should serialize objects with prototypes exported to the scope", function(){
    scope.BasicClass = BasicClass;
    this.after(function(){
      scope.BasicClass = null;
    });
    var instance = new BasicClass;
    instance.baz = 2;
    var string = hydrate.stringify(instance);
    var output = hydrate.parse(string);
    expect(output.foo).toEqual("bar");
    expect(output.baz).toEqual(2);
    expect(output).toSubclass(BasicClass);
  });

  it("should serialize objects with prototype chains", function(){
    scope.BasicClass = BasicClass;
    scope.BasicSubclass = BasicSubclass;
    this.after(function(){
      scope.BasicClass = null;
      scope.BasicSubclass = null;
    });

    var instance = new BasicSubclass;
    instance.a = 2;

    // this doesn't work!  can't add methods onto non-prototypes
    instance.newMethod = function(){ };

    // normally it'd throw an exception, but we're eating it here
    hydrate.setErrorHandler(function(){});
    var string = hydrate.stringify(instance);
    var output = hydrate.parse(string);
    expect(output.foo).toEqual("baz");
    expect(output.a).toEqual(2);
    expect(output.candy()).toEqual("sweet");
    expect(function(){ output.newMethod(); }).toThrow();
    expect(output).toSubclass(BasicSubclass);
    expect(output).toSubclass(BasicClass);
  });

  it("should serialize hashes containing nulls", function(){
    var input = {a: null};
    var string = hydrate.stringify(input);
    var output = hydrate.parse(string);
    expect(output).toEqual(input);
    expect(output.a).toBeNull();
  });

  it("should serialize hashes containing undefs", function(){
    var undefined;
    var input = {a: undefined};
    var string = hydrate.stringify(input);
    var output = hydrate.parse(string);
    expect(output).toEqual(input);
    expect(typeof output["a"]).toEqual("undefined");
    expect("a" in output).toBeTruthy();
  });

  it("should serialize objects with object references", function(){
    function ObjRefClass(){
      this.k = new BasicClass();
    }
    scope.ObjRefClass = ObjRefClass;
    scope.BasicClass = BasicClass;
    this.after(function(){
      delete scope.ObjRefClass;
      delete scope.BasicClass;
    });

    var instance = new ObjRefClass;

    var string = hydrate.stringify(instance);
    var output = hydrate.parse(string);

    expect(output).toSubclass(ObjRefClass);
    expect(output.k).toSubclass(BasicClass);
    expect(output.k.foo).toEqual("bar");
  });


  it("should have consistent properties, before and after serialization", function(){
    function Foo() {}
    scope.Foo = Foo;
    this.after(function(){
      delete scope.Foo;
    });
    Foo.prototype.toString = function() { return "Foo"; };

    foo = new Foo();
    expect(foo.hasOwnProperty('toString')).toBeFalsy();

    var hydrate = new Hydrate(new Hydrate.ContextResolver(scope));
    foo = hydrate.parse(hydrate.stringify(foo));

    expect(foo.hasOwnProperty('toString')).toBeFalsy();
  })

  describe("Multiple references to same object", function(){
    beforeEach(function(){
      scope.BasicClass = BasicClass;
    });
    afterEach(function(){
      scope.BasicClass = null;
    });

    it("should handle multiple references to the same object correctly, in an array", function(){
      var a = new BasicClass();
      var input = [a, a];

      var string = hydrate.stringify(input);
      var output = hydrate.parse(string);

      expect(output[0]).toBe(output[1]);
      expect(output[0]).toSubclass(BasicClass);
    });

    it("should handle multiple references to the same object correctly, in a hash", function(){
      var a = new BasicClass();
      var input = {one: a, two: a};

      var string = hydrate.stringify(input);
      var output = hydrate.parse(string);

      expect(output.one).toBe(output.two);
    });
  })

  it("should handle circular references", function(){
    function FirstClass(){
      this.k = new SecondClass();
    }
    function SecondClass(){
      this.foo = "bar";
    }
    scope.FirstClass = FirstClass;
    scope.SecondClass = SecondClass;
    this.after(function(){
      scope.FirstClass = null;
      scope.SecondClass = null;
    });

    var instance = new FirstClass();
    instance.k.j = instance; // here the second class instance is referring to the first class

    var string = hydrate.stringify(instance);
    var output = hydrate.parse(string);

    expect(output).toSubclass(FirstClass);
    expect(output.k).toSubclass(SecondClass);
    expect(output.k.j).toSubclass(FirstClass);
    expect(output.k.j).toBe(output);
    expect(output.k.foo).toEqual("bar");
  });

  function generateSampleSet(){
    var arr = [];
    var size = 1000;
    for(var i = 0; i < size; i++){
      var obj = new BasicClass();
      arr.push(obj);
    }
    for(var i = 0; i < size; i++){
      var obj = arr[i];
      for(var j = 0; j < 2; j++){
        switch(Math.floor(Math.random()*5)){
        case 0:
          obj.number = Math.random() * 100;
          if(Math.random() < 0.5) obj.number = Math.floor(obj.number);
          break;
        case 1:
          obj.str = "Foo!";
          break;
        case 2:
          obj.other_1 = new BasicClass();
          break;
        case 3:
          var idx = Math.floor(Math.random()*size);
          obj.other_2 = arr[idx];
          break;
        }
      }
    }
    return arr;
  }
  function stringifySampleSet(runs){
    var testSet = generateSampleSet();
    var time = new Date();
    var primer = hydrate.stringify(testSet);
    var str = primer;
    for(var i = 1; i < runs; i++){
      str = hydrate.stringify(testSet);
    }
    var total_time = new Date() - time;
    return {
      time: total_time,
      primer: primer,
      string: str
    };
  }
  function parseSampleSet(runs, str){
    var time = new Date();
    var primer = hydrate.parse(str);
    var obj = primer;
    for(var i = 1; i < runs; i++){
      obj = hydrate.parse(str);
    }
    var total_time = new Date() - time;
    return {
      time: total_time,
      primer: primer,
      object: obj
    };
  }
  xdescribe("performance", function(){
    it("should not be terrible when stringifying", function(){
      var runs = 500;
      var results = stringifySampleSet(runs);
      var run_time = results.time / runs;

      var msg = "took " + results.time + "ms total, " + run_time + "ms per run (and " + runs + " runs)";
      if(scope.console) console.log(msg);
      else alert(msg);
      scope.result = results;
    });

    it("should not be terrible when parsing", function(){
      var runs = 500;
      scope.BasicClass = BasicClass;
      this.after(function(){
        scope.BasicClass = null;
      });
      var pre_results = stringifySampleSet(1);
      var results = parseSampleSet(runs, pre_results.string);
      var run_time = results.time / runs;

      var msg = "took " + results.time + "ms total, " + run_time + "ms per run (and " + runs + " runs)";
      if(scope.console) console.log(msg);
      else alert(msg);
    });
  });

  describe("backwards-compatibility", function(){
    it("should allow the user to migrate between versions of a class", function(){
      migrated = false
      hydrate.migration(BasicClass, 2, function(){
        migrated = true
        var name_parts = this.name.split(" ");
        this.firstName = name_parts[0];
        this.lastName = name_parts[1];
        delete this.name;
      });

      // Note here how we're not adding the version to the object, but rather, to the constructor.
      // This is critical.  Version numbers will be *deleted* from the instance!
      function BasicClass(name){ this.name = name; }
      BasicClass.prototype.getName = function(){ return this.name; };
      BasicClass.prototype.version = 1;

      function BasicClassV2(fName, lName){ this.firstName = fName; this.lastName = lName; }
      BasicClassV2.prototype.getName = function(){ return this.firstName + " " + this.lastName; };
      BasicClassV2.prototype.version = 2;

      var obj = new BasicClass("Foo Bar");
      expect(obj.getName()).toEqual("Foo Bar");
      var string = hydrate.stringify(obj);
      scope.BasicClass = BasicClassV2;

      var output = hydrate.parse(string);
      expect(output.getName()).toEqual("Foo Bar");
      expect(migrated).toBeTruthy();
      expect(output.version).toEqual(2);
      expect(output.hasOwnProperty("version")).toBeFalsy();
    });
    it("shouldn't permit versioning directly on instances (only prototypes)", function(){
      function BasicClass(name){
        this.name = name;
        this.version = 1;
      }
      var obj = new BasicClass("foo");
      expect(function(){ hydrate.stringify(obj) }).toThrow(new Hydrate.VersionInstancePropertyError());
    });
  });
  it("should let you create contexts", function(){
    var Namespace = {
      A: function(){}
    };
    for(var f in Namespace) Namespace[f].prototype.constructor_name = f;
    var ctx = new Hydrate.ContextResolver(Namespace);
    hydrate = new Hydrate(ctx);
    var a = new Namespace.A();
    var a_string = hydrate.stringify(a);
    var new_a = hydrate.parse(a_string);
  });
});

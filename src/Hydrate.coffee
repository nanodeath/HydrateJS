`
/*
From http://www.tutorialspoint.com/javascript/array_indexof.htm
*/
if (!Array.prototype.indexOf)
{
  Array.prototype.indexOf = function(elt /*, from*/)
  {
    var len = this.length;

    var from = Number(arguments[1]) || 0;
    from = (from < 0)
         ? Math.ceil(from)
         : Math.floor(from);
    if (from < 0)
      from += len;

    for (; from < len; from++)
    {
      if (from in this &&
          this[from] === elt)
        return from;
    }
    return -1;
  };
}
if(typeof JSON === "undefined"){
  var dir = "../lib";
  if(typeof JSON2JSDirectory !== "undefined") dir = JSON2JSDirectory;
  document.write('\x3Cscript type="text/javascript" src="' + dir + '/json2.js">\x3C/script>');
}
`

class Hydrate  
  class Util
    @d2h = (d) ->
      d.toString 16
    @h2d = (h) ->
      parseInt h, 16
    
    # Checks to see if the __proto__ property is accessible
    @supportsProto = ({}).__proto__?
    # Checks to see if the name property of functions is supportedcomment
    @supportsFunctionNames = typeof (->).name == "string"
    
    # Extract the function name from the given function.
    # This doesn't work with anonymous functions, for obvious reasons.
    @functionName = (func) ->
      if Util.supportsFunctionNames
        # func.name isn't writable, so this is reliable
        func.name
      else
        # for IE
        func.toString().match(/function ([^(]*)/)?[1]
  @Util = Util
  
  # If you try to serialize an object you've attached a method to,
  # the serialization won't be complete and may throw this error.
  class NonPrototypeFunctionError extends Error
    constructor: (@object, @name) ->
    toString: ->
      "Couldn't serialize object; had non-prototype function '#{@name}'"
  # If you try to deserialize an object, but its constructor can't be found,
  # this error may be thrown.
  class PrototypeNotFoundError extends Error
    constructor: (@object, @cons_id) ->
    toString: ->
      "Prototype not found for object; looked for #{@cons_id}"
  
  # Pass in a list of Resolvers that work with deserialization.
  # See Resolvers below for more information.
  # Public.
  constructor: (@resolvers=[]) ->
    if @resolvers.length == 0 && typeof window != "undefined"
      @resolvers.push new ContextResolver(window)      
    @errorHandler = (e) ->
      throw e
    @serialize_key = "_freeze"
    @unserialize_key = "_thaw"
    @migrations = {}
  
  # Serialize an input into a string.  Functions can't be serialized, nor can special objects (like window).
  # Public.
  stringify: (input) ->
    @processed_inputs = []
    @counter = 0
    result = switch typeof input
      when "number", "string" then JSON.stringify(input)
      when "function" then throw new Error("can't serialize functions")
      else
        if input instanceof Array
          arr = []
          arr.push @analyze i for i in input
          
          JSON.stringify(arr)
        else
          # is an object...
          JSON.stringify @analyze input
    @cleanAfterStringify()
    result
  
  # Stringifying an object modifies it.  This is called afterwards in order to remove those modifications.
  # Private.
  cleanAfterStringify: ->
    for input in @processed_inputs
      delete input.__hydrate_id
      delete input.version
    true
  
  # Do a deeper analysis of a value to convert it to a string (and return a better candidate for serialization).  Recurses.
  # Private.
  analyze: (input, name) ->
    switch typeof input
      when "number", "string" then input
      when "function"
        # skip, should probably check to see if the function is attached to the prototype
        @errorHandler new NonPrototypeFunctionError(input, name)
      else
        if input instanceof Array
          output = []
          for v, i in input
            output[i] = @analyze v, i
          output
        else
          if(input.__hydrate_id)
            "__hydrate_ref_#{input.__hydrate_id}"
          else
            input.__hydrate_id = Util.d2h(@counter++)
            @processed_inputs.push input
            # is an object...
            output = new Object
            for k, v of input
              if input.hasOwnProperty k
                output[k] = @analyze v, k
            cons = Util.functionName(input.constructor)
            unless cons == "Object"
              output.__hydrate_cons = cons
              
            # copy version property to the instance
            if input.hasOwnProperty("version")
              @errorHandler new Error("objects can't have versions on the instances; can only be on the prototype")
            if input.version?
              output.version = input.version
              
            output
  
  # Set an error handler function for when errors do arise.  It receives one argument: an exception.
  # Public.
  setErrorHandler: (@errorHandler) ->
  
  # How Hydrate tracks references to other objects (this is a key).
  @_refMatcher = /__hydrate_ref_(.*)/
  
  # Convert a string previously serialized with Hydrate back into a proper object.
  # Uses the list of resolvers passed in at construction time to map the declared prototype back
  # to a real function.
  # Also, invokes migrations as appropriate.
  # Public.
  parse: (input) ->
    @identified_objects = []
    @references_to_resolve = []
    o = JSON.parse(input)
    l = o.length
    o = @fixTree o
    for reference in @references_to_resolve
      [obj, obj_key, ref_id] = reference
      obj[obj_key] = @identified_objects[ref_id]
    @clean o
    o
  
  # Fixes the object "tree" resulting from basic object deserialization.  This includes like
  # fixing prototypes and resolving references.  Recurses.
  # Public.
  fixTree: (obj) ->
    obj[@unserialize_key]() if typeof obj[@unserialize_key] == "function"
    
    # TODO reduce duplication between following two branches
    
    if obj instanceof Array
      for v, k in obj
        v = @fixTree v
        if typeof v == "string" && m = v.match Hydrate._refMatcher
          k2 = Util.h2d(m[1])
          @references_to_resolve.push([obj, k, k2])
        else
          obj[k] = v
    else if typeof obj == "object"
      if obj.__hydrate_cons?
        proto = @resolvePrototype obj.__hydrate_cons
        if proto?
          if Util.supportsProto
            obj.__proto__ = proto
          else
            tmp = (->)
            tmp.prototype = proto
            t = new tmp
            for k, v of obj
              t[k] = v
            obj = t
        else
          @errorHandler new PrototypeNotFoundError(obj, obj.__hydrate_cons)
      
      for k, v of obj
        v = @fixTree v
        if k == "__hydrate_id"
          v2 = Util.h2d(v)
          @identified_objects[v2] = obj
        else if typeof v == "string" && m = v.match Hydrate._refMatcher
          k2 = Util.h2d(m[1])
          @references_to_resolve.push([obj, k, k2])
        else
          obj[k] = v
    obj
  # Converts a string representing a constructor to an actual function.  Traverses all
  # resolvers in order looking for one that can accomplish this.
  # Private.
  resolvePrototype: (cons_id) ->
    if @resolvers.length == 0
      throw new Error("No Hydrate resolvers found -- you should add one!")
    for res in @resolvers
      cons = res.resolve(cons_id)
      return cons if cons?
    null
  
  # Clean up the object tree after it's been mostly deserialized.  This is necessary
  # because some properties get added during the serialization process to permit deserialization.
  # Also, runs migrations.
  # Private.
  clean: (o, cleaned=[]) ->
    # migrate
    migrations = @migrations[o.__hydrate_cons]
    if(o.version? && 
       migrations? && 
       o.version < migrations.length)
      for num in [o.version..migrations.length - 1]
        migrations[num].call(o)
      delete o.version
    
    cleaned.push o
    if typeof o == "object" && !(o instanceof Array)
      for k, v of o
        if k == "__hydrate_id" || k == "__hydrate_cons"
          delete o[k]
        else if typeof v == "object" && !(o instanceof Array) && cleaned.indexOf(v) < 0
          @clean(v, cleaned)
    true
  
  # Declare a migration for an object -- this will automatically run callbacks
  # on old objects to get them in sync with current Javascript classes.
  # Three arguments:
  #  klass: function or function name for which migration applies, i.e. Person or "Person"
  #  index: version number of the model, i.e. 2 will cause the provided callback to be execute on deserializing Person instances with a version of 1.
  #  callback: the function to be called on the object being deserialized.  The "this" of the function will be the object.  There are no arguments.
  # 
  # NOTE: The version of the object is NOT (and should NOT) be set by this framework or by you in the callback.  Ther version number should be on the prototype, not the instance.  This ensures you don't get into weird situations where the instance thinks it's version 1 when the prototype it's currently associated with thinks it's version 2.
  migration: (klass, index, callback) ->
    switch typeof klass
      when "function"
        klass = klass.name
        if klass == ""
          throw new Error("Could not resolve class name; was empty")
      when "string"
        null
      else
        throw new Error("invalid class passed in; pass a function or a string")
    all_versions = @migrations[klass]
    if !all_versions?
      all_versions = @migrations[klass] = []
    all_versions[index-1] = callback
    #if !@highest_migration[klass]? || @highest_migration[klass] < index
    #  @highest_migration[klass] = index
    true

# A Resolver is simple: it maps from a string representing a constructor to a prototype that's used by that constructor.
# Public.
class Resolver
  resolve: (cons_id) ->
    throw new Error("abstract")

# The context resolver is also fairly simple: it takes a list of objects as "contexts", then when a constructor string is provided, it iterates through them in order, looking for the first context that contains that constructor string as a property, and returns the prototype for it.
# If you want another way to map from constructor names to prototypes, make something similar to ContextResolver and pass it into the main Hydrate constructor.
# Public.
class ContextResolver extends Resolver
  constructor: (@contexts=[]) ->
    if typeof @contexts != Array
      @contexts = [@contexts]
  addContext: (ctx) ->
    @contexts.push ctx
  resolve: (cons_id) ->
    for ctx in @contexts
      v = ctx[cons_id]
      return v.prototype if v?
    null
        
this.Hydrate = Hydrate;

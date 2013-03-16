fs = require 'fs'
util = require 'util'
{exec} = require 'child_process'
exit = process.exit
Q = require 'q'

option '-o', '--output [DIR]', 'directory for compiled code'

get_browser = ->
  d = Q.defer()
  browsers = ["sensible-browser", "xdg-open", "x-www-browser"]
  browsers_q = browsers.map (browser) -> Q.nfcall(exec, "which #{browser}")
  Q.allResolved(browsers_q).then (promises) ->
    for promise in promises
      if promise.isFulfilled()
        browser = promise.valueOf()[0].replace(/\n$/, '')
        d.resolve(browser)
        return
    d.reject()
  d.promise

compile_library = (options) ->
  dir = options.output or 'gen'
  d = Q.nfcall(exec, "coffee -o #{dir}/ -c src/")
  d.then (stdout, stderr) ->
    util.log "Compiled HydrateJS into #{dir}/"
  .fail (error) ->
    util.error error
  d

task 'build', 'build the main asset', (options) ->
  compile_library(options).fail -> exit 1

task 'build:legacy-browser', 'build the main asset with legacy browser support', ->
  util.error("This task isn't implemented yet.  For now, define Array.prototype.indexOf and JSON.* methods manually")
  exit 1

task 'test', 'execute tests', (options) ->
  util.error("Use `npm test` to run unit tests")
  exit 1

task 'test:prepare', 'prepare the main `npm test` task', (options) ->
  compile_library(options).fail -> exit 1

task 'test:browser', 'execute tests in the browser', (options) ->
  compile_library(options).then ->
    get_browser().then (browser) ->
      util.log "Executing `#{browser} spec/SpecRunner.html`"
      Q.nfcall(exec, "#{browser} spec/SpecRunner.html").then (stdout, stderr) ->
        util.log stdout
        util.error stderr
      .fail (err) ->
        util.err err
    .fail ->
      util.err "Couldn't open browser; navigate to spec/SpecRunner.html"
      exit 1
  .fail ->
    exit 1
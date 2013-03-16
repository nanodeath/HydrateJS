fs = require 'fs'
util = require 'util'
{exec} = require 'child_process'

option '-o', '--output [DIR]', 'directory for compiled code'

task 'build', 'build the main asset', (options) ->
  dir  = options.output or 'gen'
  exec "coffee -o #{dir}/ -c src/", (err, stdout, stderr) ->
    util.log err if err
    message = "Compiled HydrateJS into #{dir}/"
    util.log message

task 'test', 'execute tests', (options) ->
  exec "node_modules/jasmine-node/bin/jasmine-node spec --requireJsSetup gen/Hydrate.js", (err, stdout, stderr) ->
    util.log err if err
    util.log stdout
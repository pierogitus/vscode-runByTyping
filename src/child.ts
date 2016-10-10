import vm = require('vm');
import * as loader from './loader'

var env = {}
for (let k in process.env) {
    env[k] = process.env[k]
}

process.on('message', m => {
    if (m.type == 'run') {
        if (m.clear) {
            loader.contentCache = {}
        }
        for (var k in m.content) {
            loader.contentCache[k] = m.content[k]
        }
        run(m.mainPath)
    }
    else if (m.type == 'init') {
        for (var k in m.content) {
            loader.contentCache[k] = m.content[k]
        }
    }
})

function run(mainPath: string) {
    loader.moduleCache = {}
    Object.keys(process.env).forEach(x => {
        if (process.env[x] !== env[x]) {
            process.env[x] = env[x]
        }
    })
    try {
        var sandbox = { requireMain: loader.requireMain }
        vm.runInNewContext('var m = requireMain("' + mainPath.replace(/\\/g, '/') + '")', sandbox)
    }
    catch (e) {
        console.log(e.stack)
        process.send({ type: 'done', param: { html: '<pre>' + e.stack + '</pre>' } })
    }
}
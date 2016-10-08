import vm = require('vm');
import * as loader from './loader'
import fs = require('fs');
import path = require('path');

var runOutput = ''
var runOutputHtml = ''
//process.argv
console.log('child')
fs.writeFileSync(path.join(__dirname,'./what.txt'), 'hello')
process.on('message', m => {
    console.log(m)
    if (m.type == 'run') {
        if (m.clear) {
            loader.contentCache = {}
        }
        for (var k in m.content) {
            loader.contentCache[k] = m.content[k]
        }
        run(m.mainPath)
    }
})
function run(mainPath: string) {
    loader.moduleCache = {}
    runOutput = ''
    runOutputHtml = ''
    try {
        var sandbox = { requireMain: loader.requireMain }
        vm.runInNewContext('var m = requireMain("' + mainPath.replace(/\\/g, '/') + '")', sandbox)
        var m = sandbox['m']
        runOutputHtml = m.html || ''
        runOutput = stringifyCircular(m) || ''
    }
    catch (e) {
        runOutput = e.stack
    }
    process.send({ runOutput, runOutputHtml, type: 'done' })
    //contentProvider.update()
}
function stringifyCircular(o): string {
    var cache = [];
    return JSON.stringify(o, function (key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return;
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    }, 2);
}
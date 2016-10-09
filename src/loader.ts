var mod = require('module');
import path = require('path');
import fs = require('fs');
import * as trans from './transpile'

export var moduleCache = {}
export var contentCache = {}

var modExtensions = { '.node': mod._extensions['.node'] }
modExtensions['.js'] = (m, filename) => {
    var content = contentCache[filename] !== undefined ? contentCache[filename] : readFileTranspile(filename)
    contentCache[filename] = content
    m._compile(stripBOM(content), filename);
}
modExtensions['.json'] = (m, filename) => {
    var content = contentCache[filename] !== undefined ? contentCache[filename] : fs.readFileSync(filename, 'utf8');
    contentCache[filename] = content
    try {
        m.exports = JSON.parse(stripBOM(content));
    } catch (err) {
        err.message = filename + ': ' + err.message;
        throw err;
    }
}

function readFileTranspile(fn: string): string {
    var ts = fn.replace('.js', '.ts')
    if (fs.existsSync(ts)) {
        return trans.transpileModule(fs.readFileSync(ts, 'utf8'))
    }
    return fs.readFileSync(fn, 'utf8')
}

function _load(request, parent, isMain) {
    var filename = mod._resolveFilename(request, parent, isMain);
    if (filename.indexOf('/') == -1 && filename.indexOf('\\') == -1 && filename.indexOf('.') == -1) {
        return require(filename)
    }
    var cachedModule = moduleCache[filename];
    if (cachedModule) {
        return cachedModule.exports;
    }
    var module = new mod.Module(filename, parent);
    module.require = function (path) {
        return _load(path, this, false);
    }
    module['runByTypingDone'] = function (ob?: Object) {
        process.send({ type: 'done', param: ob })
    }
    if (isMain) {
        //process.mainModule = module;
        module.id = '.';
    }
    moduleCache[filename] = module;
    tryModuleLoad(module, filename);
    return module.exports;
};

function tryModuleLoad(module, filename) {
    var threw = true;
    try {
        load(module, filename);
        threw = false;
    } finally {
        if (threw) {
            delete moduleCache[filename];
        }
    }
}
function load(module, filename) {
    module.filename = filename;
    module.paths = mod._nodeModulePaths(path.dirname(filename));

    var extension = path.extname(filename) || '.js';
    if (!modExtensions[extension]) extension = '.js';
    modExtensions[extension](module, filename);
    module.loaded = true;
};

export function requireMain(id: string) {
    return _load(id, null, false);
}

function stripBOM(content) {
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    return content;
}
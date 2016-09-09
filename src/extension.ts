import * as vscode from 'vscode';
import vm = require('vm');
import * as loader from './loader'
import path = require('path');
import fs = require('fs');
import * as trans from './transpile'

var runOutput = ''
var runOutputHtml = ''
var scheme = 'runWhileTyping'
var defaultCode = "exports.hello = 'hello world'"
var outputUri = vscode.Uri.parse(scheme + '://a/runWhileTyping_exports')
var outputUriHtml = vscode.Uri.parse(scheme + '://a/runWhileTyping_html')
class ContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }
    public update() {
        this._onDidChange.fire(outputUri);
        this._onDidChange.fire(outputUriHtml);
    }
    dispose() {
        this._onDidChange.dispose();
    }
    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
        return uri.toString() == outputUri.toString() ? runOutput : runOutputHtml;
    }
}
var contentProvider = new ContentProvider()
var tsconfig
export function activate(context: vscode.ExtensionContext) {
    var cp = vscode.workspace.registerTextDocumentContentProvider(scheme, contentProvider)
    var changeText = vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() != outputUri.toString() && e.document.uri.toString() != outputUriHtml.toString()) {
            if (vscode.workspace.rootPath) {
                loader.contentCache[e.document.uri.fsPath.replace('.ts', '.js')] = trans.getFinalCode(e.document)
            }
            else {
                loader.contentCache = {}
                loader.contentCache[getMainPath()] = trans.getFinalCode(e.document)
            }
            run()
        }
    })
    var closeText = vscode.workspace.onDidCloseTextDocument(e => {
        delete loader.contentCache[e.uri.fsPath]
    })
    let mainCommand = vscode.commands.registerCommand('extension.runWhileTyping', () => {
        loader.contentCache = {}
        if (vscode.workspace.rootPath) {
            if (fs.existsSync(path.join(vscode.workspace.rootPath, 'tsconfig.json'))) {
                tsconfig = require(path.join(vscode.workspace.rootPath, 'tsconfig.json').replace(/\\/g, '/'))
                trans.setOptions(tsconfig.compilerOptions)
            }
            var mainPath = getMainPath()
            if (tsconfig) {
                if (!fs.existsSync(mainPath)) {
                    fs.writeFileSync(mainPath, defaultCode)
                }
                mainPath = mainPath.replace('.js', '.ts')
            }
            if (!fs.existsSync(mainPath)) {
                fs.writeFileSync(mainPath, defaultCode)
            }
            var mainUri = vscode.Uri.file(mainPath)
            vscode.window.visibleTextEditors.filter(x => x.document.isDirty).forEach(x => {
                loader.contentCache[x.document.uri.fsPath] = trans.getFinalCode(x.document)
            })
        }
        else {
            mainUri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : vscode.Uri.parse('untitled:' + path.join(__dirname, 'Untitled'))
        }
        vscode.workspace.openTextDocument(mainUri)
            .then(doc => {
                loader.contentCache[getMainPath()] = trans.getFinalCode(doc)
                vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
            })
            .then(te => { return vscode.workspace.openTextDocument(outputUri) })
            .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true))
        vscode.commands.executeCommand('vscode.previewHtml', outputUriHtml, vscode.ViewColumn.Two)
        run()
    });
    vscode.commands.executeCommand
    context.subscriptions.push(mainCommand, cp, contentProvider, changeText, closeText);
}

export function deactivate() {
}
function run() {
    loader.moduleCache = {}
    runOutput = ''
    var timer = setTimeout(() => {
        contentProvider.update()
    }, 100)
    try {
        var sandbox = { requireMain: loader.requireMain }
        vm.runInNewContext('var m = requireMain("' + getMainPath().replace(/\\/g, '/') + '")', sandbox)
        var m = sandbox['m']
        runOutputHtml = m.html
        runOutput = stringifyCircular(m) || ''
    }
    catch (e) {
        runOutput = e.stack
    }
    clearTimeout(timer)
    contentProvider.update()
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
function getMainPath(): string {
    return vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'runWhileTyping.js') : __filename
}
import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import child = require('child_process')
import * as trans from './transpile'

var runOutput = ''
var runOutputHtml = ''
var scheme = 'runByTyping'
var defaultCode = "console.log('hello world')\n\n\nrequire.runByTypingDone()"
var outputUri = vscode.Uri.parse(scheme + '://a/runByTyping_log')
var outputUriHtml = vscode.Uri.parse(scheme + '://a/runByTyping_html')
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
var childProcess: child.ChildProcess
var clearScreenTimer
var waitTimer
var isRunning = false
var isWaiting: runParams = null
var isRunningLong = false
interface runParams {
    clearContentCache: boolean, content: Object
}
export function activate(context: vscode.ExtensionContext) {
    console.log('activate')
    createChild()
    var cp = vscode.workspace.registerTextDocumentContentProvider(scheme, contentProvider)
    var changeText = vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() != outputUri.toString() && e.document.uri.toString() != outputUriHtml.toString()) {
            var content = {}
            if (vscode.workspace.rootPath) {
                content[e.document.uri.fsPath.replace('.ts', '.js')] = trans.getFinalCode(e.document)
                run({ clearContentCache: false, content: content })
            }
            else {
                content[getMainPath()] = trans.getFinalCode(e.document)
                run({ clearContentCache: true, content: content })
            }
        }
    })
    var closeText = vscode.workspace.onDidCloseTextDocument(e => {
        console.log(e.uri.fsPath)
    })
    let mainCommand = vscode.commands.registerCommand('extension.runByTyping', () => {
        var content = {}
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
        }
        else {
            mainUri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : vscode.Uri.parse('untitled:' + path.join(__dirname, 'Untitled'))
        }
        vscode.workspace.openTextDocument(mainUri)
            .then(doc => {
                content[getMainPath()] = trans.getFinalCode(doc)
                run({ clearContentCache: true, content: content })
                vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
            })
            .then(te => { return vscode.workspace.openTextDocument(outputUri) })
            .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true))
    });
    context.subscriptions.push(mainCommand, cp, changeText, closeText);
}

export function deactivate() {
    console.log('deactivate')
    childProcess.kill()
}

function getMainPath(): string {
    return vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'runByTyping.js') : __filename
}

function createChild() {
    childProcess = child.spawn('node', [path.join(__dirname, './child.js')], { stdio: [0, 'pipe', 'pipe', 'ipc'] })
    childProcess.stdout.on('data', d => {
        runOutput += d
        contentProvider.update()
    })
    childProcess.stderr.on('data', d => {
        runOutput += d
        contentProvider.update()
    })
    childProcess.on('message', m => {
        if (m.type == 'done') {
            clearTimeout(clearScreenTimer)
            clearTimeout(waitTimer)
            if (m.param && m.param.html) {
                runOutputHtml = m.param.html
                vscode.commands.executeCommand('vscode.previewHtml', outputUriHtml, vscode.ViewColumn.Two)
            }
            else {
                if (!vscode.window.visibleTextEditors.some(x => x.document.uri.toString() == outputUri.toString())) {
                    vscode.workspace.openTextDocument(outputUri).then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true))
                }
            }
            isRunning = false
            isRunningLong = false
            runOutput += 'runByTypingDone'
            if (isWaiting) {
                run(isWaiting)
            }
            contentProvider.update()
        }
    })
    var content = {}
    vscode.window.visibleTextEditors.filter(x => x.document.isDirty).forEach(x => {
        content[x.document.uri.fsPath] = trans.getFinalCode(x.document)
    })
    childProcess.send({ type: 'init', content })
}

function run(arg: runParams) {
    if (isRunning) {
        mergeRunParam(arg)
        if (isRunningLong) {
            recycle()
        }
    }
    else {
        execRun(arg)
    }
}

function mergeRunParam(arg: runParams) {
    if (isWaiting) {
        isWaiting.clearContentCache = isWaiting.clearContentCache || arg.clearContentCache
        for (var k in arg.content) {
            isWaiting.content[k] = arg.content[k]
        }
    }
    else {
        isWaiting = arg
    }
}

function recycle() {
    childProcess.kill()
    isRunning = false
    createChild()
    run(isWaiting)
}

function execRun(arg: runParams) {
    runOutput = ''
    runOutputHtml = ''
    isRunning = true
    isRunningLong = false
    childProcess.send({ type: 'run', mainPath: getMainPath(), clear: arg.clearContentCache, content: arg.content })
    isWaiting = null
    clearScreenTimer = setTimeout(() => {
        contentProvider.update()
    }, 200)
    waitTimer = setTimeout(function () {
        if (isRunning) {
            if (isWaiting) {
                recycle()
            }
            else {
                isRunningLong = true
            }
        }
    }, 500);
}
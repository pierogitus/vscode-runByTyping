import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import child = require('child_process')
import * as trans from './transpile'

var runOutput = ''
var runOutputHtml = ''
var scheme = 'runByTyping'
var doneMarker = 'runByTypingDone'
var defaultCode = "console.log('hello world')\n\n\nmodule.runByTypingDone()"
var defaultCodeTS = "console.log('hello world')\n\n\nmodule['runByTypingDone']()"
var outputUri = vscode.Uri.parse(scheme + '://a/runByTyping_log')
var outputUriHtml = vscode.Uri.parse(scheme + '://a/runByTyping_html')
class ContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }
    public update() {
        if (isEnabled) {
            this._onDidChange.fire(outputUri);
        }
    }
    public updateHTML() {
        if (isEnabledHTML) {
            this._onDidChange.fire(outputUriHtml);
        }
    }
    dispose() {
        this._onDidChange.dispose();
    }
    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
        return uri.toString() == outputUri.toString() ? runOutput : (runOutputHtml || "No HTML value passed. Example usage:<br/><pre>module.runByTypingDone({ html: '&lt;div&gt;hello&lt;/div&gt;'})</pre>");
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
var isEnabled = false
var isEnabledHTML = false
var isDelayVisual = false
interface runParams {
    clearContentCache: boolean, content: Object
}
export function activate(context: vscode.ExtensionContext) {
    var cp = vscode.workspace.registerTextDocumentContentProvider(scheme, contentProvider)

    let mainCommand = vscode.commands.registerCommand('extension.enableRunByTyping', () => {
        isEnabled = true
        setup().then(te => { return vscode.workspace.openTextDocument(outputUri) })
            .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true))
    });
    let htmlCommand = vscode.commands.registerCommand('extension.enableRunByTypingHtml', () => {
        isEnabledHTML = true
        setup().then(te => vscode.commands.executeCommand('vscode.previewHtml', outputUriHtml, vscode.ViewColumn.Two))
    });
    let disableCommand = vscode.commands.registerCommand('extension.disableRunByTyping', () => {
        isEnabled = false
        isEnabledHTML = false
        if (childProcess) {
            childProcess.kill()
        }
    })
    var changeText = vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() != outputUri.toString() && e.document.uri.toString() != outputUriHtml.toString() && (isEnabled || isEnabledHTML)) {
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
    context.subscriptions.push(mainCommand, htmlCommand, disableCommand, cp, changeText);
}

export function deactivate() {
    isEnabled = false
    isEnabledHTML = false
    childProcess.kill()
}

function setup(): PromiseLike<void> {
    if (childProcess) {
        childProcess.kill()
    }
    createChild()
    if (vscode.workspace.rootPath) {
        if (fs.existsSync(path.join(vscode.workspace.rootPath, 'tsconfig.json'))) {
            tsconfig = require(path.join(vscode.workspace.rootPath, 'tsconfig.json').replace(/\\/g, '/'))
            trans.setOptions(tsconfig.compilerOptions)
        }
        var mainPath = getMainPath()
        var code = defaultCode
        if (tsconfig) {
            code = defaultCodeTS
            if (!fs.existsSync(mainPath)) {
                fs.writeFileSync(mainPath, code)
            }
            mainPath = mainPath.replace('.js', '.ts')
        }
        if (!fs.existsSync(mainPath)) {
            fs.writeFileSync(mainPath, code)
        }
        var mainUri = vscode.Uri.file(mainPath)
    }
    else {
        mainUri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : vscode.Uri.parse('untitled:' + path.join(__dirname, 'Untitled'))
    }
    return vscode.workspace.openTextDocument(mainUri)
        .then(doc => {
            var content = {}
            content[getMainPath()] = trans.getFinalCode(doc)
            run({ clearContentCache: true, content: content })
            vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
        })
}

function getMainPath(): string {
    return vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'runByTyping.js') : __filename
}
function appendOutput(s: string) {
    if (runOutput.indexOf(doneMarker) == runOutput.length - doneMarker.length) {
        runOutput = runOutput.substring(0, runOutput.indexOf(doneMarker)) + s + doneMarker
    }
    else {
        runOutput += s
    }
    if (!isDelayVisual) {
        contentProvider.update()
    }
}
function createChild() {
    childProcess = child.spawn('node', [path.join(__dirname, './child.js')], { stdio: [0, 'pipe', 'pipe', 'ipc'] })
    childProcess.stdout.on('data', d => {
        appendOutput(d)
    })
    childProcess.stderr.on('data', d => {
        appendOutput(d)
    })
    childProcess.on('message', m => {
        if (m.type == 'done') {
            clearTimeout(clearScreenTimer)
            clearTimeout(waitTimer)
            if (m.param && m.param.html) {
                runOutputHtml = m.param.html
            }
            isRunning = false
            isRunningLong = false
            isDelayVisual = false
            runOutput += doneMarker
            contentProvider.update()
            contentProvider.updateHTML()
            if (isWaiting) {
                run(isWaiting)
            }
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
    if (Object.keys(arg.content).some(x => x == getMainPath())) {
        var m: string = arg.content[getMainPath()]
        if (!m.includes("module.runByTypingDone(") && !m.includes("module['runByTypingDone'](")) {
            runOutput = '******* Warning: use module.runByTypingDone() to signal execution has finished.\n******* This increases performance by reusing the worker process.\n'
        }
    }
    childProcess.send({ type: 'run', mainPath: getMainPath(), clear: arg.clearContentCache, content: arg.content })
    isWaiting = null
    isDelayVisual = true
    clearScreenTimer = setTimeout(() => {
        isDelayVisual = false
        contentProvider.update()
        contentProvider.updateHTML()
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
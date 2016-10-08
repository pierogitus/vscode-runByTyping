import * as vscode from 'vscode';
import vm = require('vm');
//import * as loader from './loader'
import path = require('path');
import fs = require('fs');
import child = require('child_process')
import * as trans from './transpile'

var runOutput = ''
var runOutputHtml = ''
var scheme = 'runByTyping'
var defaultCode = "exports.hello = 'hello world'"
var outputUri = vscode.Uri.parse(scheme + '://a/runByTyping_exports')
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
export function activate(context: vscode.ExtensionContext) {
    console.log('activate')
    var op = { stdio: [0, 'pipe', 2, 'ipc'] }
    childProcess = child.spawn('node', [path.join(__dirname, './child.js')], op)
    console.log(childProcess.stdio)
    childProcess.on('message', m => {
        console.log(m)
        if (m.type == 'done') {
            runOutput = m.runOutput
            runOutputHtml = m.runOutputHtml
            contentProvider.update()
        }
    })
    var cp = vscode.workspace.registerTextDocumentContentProvider(scheme, contentProvider)
    var changeText = vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() != outputUri.toString() && e.document.uri.toString() != outputUriHtml.toString()) {
            var content = {}
            if (vscode.workspace.rootPath) {
                content[e.document.uri.fsPath.replace('.ts', '.js')] = trans.getFinalCode(e.document)
                run(false, content)
            }
            else {
                content[getMainPath()] = trans.getFinalCode(e.document)
                run(true, content)
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
            vscode.window.visibleTextEditors.filter(x => x.document.isDirty).forEach(x => {
                content[x.document.uri.fsPath] = trans.getFinalCode(x.document)
            })
        }
        else {
            mainUri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : vscode.Uri.parse('untitled:' + path.join(__dirname, 'Untitled'))
        }
        vscode.commands.executeCommand('vscode.previewHtml', outputUriHtml, vscode.ViewColumn.Two).then(() => {
            vscode.workspace.openTextDocument(mainUri)
                .then(doc => {
                    content[getMainPath()] = trans.getFinalCode(doc)
                    run(true, content)
                    vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
                })
                .then(te => { return vscode.workspace.openTextDocument(outputUri) })
                .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true))
        })
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

function run(clearContentCache: boolean, content: Object) {
    var timer = setTimeout(() => {
        //contentProvider.update()
    }, 100)
    childProcess.send({ type: 'run', mainPath: getMainPath(), clear: clearContentCache, content })

    //clearTimeout(timer)
}
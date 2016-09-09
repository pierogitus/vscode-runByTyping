import * as vscode from 'vscode'
import * as ts from 'typescript'
import path = require('path');

var options: ts.TranspileOptions

export function transpileModule(code: string): string {
    var out = ts.transpileModule(code, options || { compilerOptions: { target: ts.ScriptTarget.ES2015, module: ts.ModuleKind.UMD } });
    return out.outputText
}

export function setOptions(config) {
    var compilerOptions = ts.convertCompilerOptionsFromJson(config, '');
    options = { compilerOptions: { module: compilerOptions.options.module, target: compilerOptions.options.target } }
}

export function getFinalCode(d: vscode.TextDocument): string {
    if (path.extname(d.uri.path) == '.ts') {
        return transpileModule(d.getText())
    }
    return d.getText()
}
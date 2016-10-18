# Run By Typing

An extension for Visual Studio Code that executes NodeJS/TypeScript and shows real-time results while editing files.

## Features

### **Command: Enable Run By Typing**

Creates or opens runByTyping.js in the current workspace and executes it when any open file is edited. Console results are displayed in a separate log window. 

### **Command: Enable Run By Typing HTML Preview**

Creates or opens runByTyping.js in the current workspace and executes it when any open file is edited. Raw HTML passed to module.runByTypingDone() is displayed in the HTML preview window.

### **Command: Disable Run By Typing**

Disables executing runByTyping.js on edits.

## How it works

The code is executed in a separte process so the editor remains responive. Calling module.runByTypingDone() signals that the process can be reused for the next run so a new process doesn't have to be created on every keystroke. If the code doesn't call module.runByTypingDone() within 500ms and there are new changes pending the process will be recycled to begin the next run. This way every run has a clean global scope and even infinite loops are handled gracefully.

## Source

[GitHub](https://github.com/pierogitus/vscode-runByTyping)

## License

[MIT](https://raw.githubusercontent.com/pierogitus/vscode-runByTyping/master/LICENSE)

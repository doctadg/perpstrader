"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
// Polyfill WebSocket for Node.js environment
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = ws_1.WebSocket;
}
// Polyfill ArrayBuffer.transfer if missing (needed for some SDK dependencies)
if (!ArrayBuffer.prototype.transfer) {
    ArrayBuffer.prototype.transfer = function (newByteLength) {
        if (newByteLength === undefined)
            newByteLength = this.byteLength;
        const newBuffer = new ArrayBuffer(newByteLength);
        const newView = new Uint8Array(newBuffer);
        const oldView = new Uint8Array(this);
        const size = Math.min(oldView.length, newView.length);
        newView.set(oldView.subarray(0, size));
        return newBuffer;
    };
}
//# sourceMappingURL=polyfills.js.map
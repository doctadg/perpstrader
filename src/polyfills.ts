import { WebSocket } from 'ws';

// Polyfill WebSocket for Node.js environment
if (typeof (global as any).WebSocket === 'undefined') {
    (global as any).WebSocket = WebSocket;
}

// Polyfill ArrayBuffer.transfer if missing (needed for some SDK dependencies)
if (!(ArrayBuffer.prototype as any).transfer) {
    (ArrayBuffer.prototype as any).transfer = function (newByteLength?: number): ArrayBuffer {
        if (newByteLength === undefined) newByteLength = this.byteLength;
        const newBuffer = new ArrayBuffer(newByteLength!);
        const newView = new Uint8Array(newBuffer);
        const oldView = new Uint8Array(this);
        const size = Math.min(oldView.length, newView.length);
        newView.set(oldView.subarray(0, size));
        return newBuffer;
    };
}

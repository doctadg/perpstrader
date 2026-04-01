"use strict";
/**
 * Position Manager Types
 * Tracks open token positions and manages exit strategies for pump.fun launcher
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitStrategy = void 0;
var ExitStrategy;
(function (ExitStrategy) {
    /** Default: sell at target mcap */
    ExitStrategy["FAST_DUMP"] = "FAST_DUMP";
    /** Price still climbing fast — extend target */
    ExitStrategy["MOMENTUM_HOLD"] = "MOMENTUM_HOLD";
    /** Time exceeded — force sell */
    ExitStrategy["TIME_STOP"] = "TIME_STOP";
    /** Mcap dropped 50% from peak — emergency sell */
    ExitStrategy["STOP_LOSS"] = "STOP_LOSS";
})(ExitStrategy || (exports.ExitStrategy = ExitStrategy = {}));
//# sourceMappingURL=types.js.map
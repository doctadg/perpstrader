import React from 'react';
export type ActionType = 'close-position' | 'cancel-order' | 'emergency-stop' | 'trigger-cycle' | null;
export interface ActionPrompt {
    type: ActionType;
    data?: any;
    message: string;
}
export interface ActionResult {
    type: ActionType;
    success: boolean;
    message: string;
    timestamp: Date;
}
interface ConfirmDialogProps {
    prompt: ActionPrompt;
    onConfirm: () => void;
    onCancel: () => void;
    requireDouble?: boolean;
}
export declare function ConfirmDialog({ prompt, onConfirm, onCancel, requireDouble }: ConfirmDialogProps): React.JSX.Element;
interface ActionToastProps {
    result: ActionResult;
    onDismiss: () => void;
}
export declare function ActionToast({ result, onDismiss }: ActionToastProps): React.JSX.Element;
export declare function useActions(onResult: (result: ActionResult) => void): {
    executeAction: (prompt: ActionPrompt) => Promise<void>;
};
export {};
//# sourceMappingURL=actions.d.ts.map
import React from 'react';
export interface PanelProps {
    title: string;
    icon?: string;
    width?: string | number;
    flex?: number;
    children: React.ReactNode;
    borderColor?: string;
    dim?: boolean;
    compact?: boolean;
}
export declare function Panel({ title, icon, width, flex, children, borderColor, dim, compact, }: PanelProps): React.JSX.Element;
export interface HeaderBarProps {
    connected: boolean;
    portfolio: any;
    refreshInterval: number;
    uptime: number;
    version?: string;
}
export declare function HeaderBar({ connected, portfolio, refreshInterval, uptime, version }: HeaderBarProps): React.JSX.Element;
export interface FooterBarProps {
    activeView: number;
    refreshInterval: number;
    loading: boolean;
}
export declare function FooterBar({ activeView, refreshInterval, loading }: FooterBarProps): React.JSX.Element;
export declare function Spinner({ text, color }: {
    text?: string;
    color?: string;
}): React.JSX.Element;
export declare function EmptyState({ message, icon }: {
    message: string;
    icon?: string;
}): React.JSX.Element;
export declare function ProgressBar({ percent, width, color, }: {
    percent: number;
    width?: number;
    color?: string;
}): React.JSX.Element;
export declare function Label({ children, color }: {
    children: React.ReactNode;
    color?: string;
}): React.JSX.Element;
export declare function DataRow({ label, value, valueColor, indent, }: {
    label: string;
    value: string | React.ReactNode;
    valueColor?: string;
    indent?: number;
}): React.JSX.Element;
export declare function Separator({ width }: {
    width?: number;
}): React.JSX.Element;
export interface ViewProps {
    data: any;
    loading: boolean;
    scrollOffset: number;
}
export declare function ViewWrapper({ title, icon, loading, children, }: {
    title: string;
    icon?: string;
    loading: boolean;
    children: React.ReactNode;
}): React.JSX.Element;
//# sourceMappingURL=components.d.ts.map
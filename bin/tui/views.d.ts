import React from 'react';
export interface ViewProps {
    data: any;
    loading: boolean;
    scrollOffset: number;
    selectedIndex?: number;
    onAction?: (type: string, data: any) => void;
}
export declare function DashboardView({ data, loading }: ViewProps): React.JSX.Element;
export declare function PositionsView({ data, loading, scrollOffset, selectedIndex, onAction }: ViewProps): React.JSX.Element;
export declare function NewsView({ data, loading, scrollOffset }: ViewProps): React.JSX.Element;
export declare function RiskView({ data, loading }: ViewProps): React.JSX.Element;
export declare function StrategiesView({ data, loading, scrollOffset, selectedIndex }: ViewProps): React.JSX.Element;
export declare function PredictionsView({ data, loading }: ViewProps): React.JSX.Element;
export declare function OrdersView({ data, loading, scrollOffset, selectedIndex, onAction }: ViewProps): React.JSX.Element;
export declare function BacktestView({ data, loading, scrollOffset, selectedIndex }: ViewProps): React.JSX.Element;
//# sourceMappingURL=views.d.ts.map
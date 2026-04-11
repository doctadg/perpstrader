import React from 'react';
export interface ViewProps {
    data: any;
    loading: boolean;
    scrollOffset: number;
}
export declare function DashboardView({ data, loading }: ViewProps): React.JSX.Element;
export declare function PositionsView({ data, loading }: ViewProps): React.JSX.Element;
export declare function NewsView({ data, loading, scrollOffset }: ViewProps): React.JSX.Element;
export declare function RiskView({ data, loading }: ViewProps): React.JSX.Element;
export declare function StrategiesView({ data, loading }: ViewProps): React.JSX.Element;
export declare function PredictionsView({ data, loading }: ViewProps): React.JSX.Element;

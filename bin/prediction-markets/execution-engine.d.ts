import { PredictionRiskAssessment, PredictionSignal, PredictionTrade, PredictionPosition, PredictionPortfolio } from '../shared/types';
declare class PredictionExecutionEngine {
    private initialBalance;
    private cashBalance;
    private realizedPnL;
    private positions;
    private currentPrices;
    constructor();
    updateMarketPrice(marketId: string, yesPrice?: number, noPrice?: number): void;
    executeSignal(signal: PredictionSignal, risk: PredictionRiskAssessment, marketTitle: string): Promise<PredictionTrade>;
    getPortfolio(): PredictionPortfolio;
    getPositions(): PredictionPosition[];
}
declare const predictionExecutionEngine: PredictionExecutionEngine;
export default predictionExecutionEngine;
//# sourceMappingURL=execution-engine.d.ts.map
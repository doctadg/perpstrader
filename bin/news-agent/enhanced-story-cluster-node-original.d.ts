import { HeatAnomaly } from './anomaly-detector';
import { HeatPrediction } from './heat-predictor';
import { NewsItem } from '../../shared/types';
import { EntityHeat } from '../../shared/types-enhanced';
export interface EnhancedClusteringState {
    categorizedNews: NewsItem[];
    clusters: any[];
    stats: {
        totalProcessed: number;
        newClusters: number;
        existingClusters: number;
        mergedClusters: number;
        entitiesExtracted: number;
        anomaliesDetected: number;
        predictionsGenerated: number;
    };
    thoughts: string[];
    errors: string[];
}
export interface ClusteringResult {
    clusters: any[];
    stats: EnhancedClusteringState['stats'];
    anomalies: HeatAnomaly[];
    predictions: HeatPrediction[];
    trendingEntities: EntityHeat[];
}
/**
 * Enhanced story clustering with all 10 improvements
 */
export declare function enhancedStoryClusterNode(state: any): Promise<Partial<EnhancedClusteringState>>;
export default enhancedStoryClusterNode;
//# sourceMappingURL=enhanced-story-cluster-node-original.d.ts.map
export interface HeatDecayConfig {
    category: string;
    decayConstant: number;
    activityBoostHours: number;
    spikeMultiplier: number;
    baseHalfLifeHours: number;
    description?: string;
    updatedAt: Date;
}
export interface ClusterHeatHistory {
    id: number;
    clusterId: string;
    heatScore: number;
    articleCount: number;
    uniqueTitleCount: number;
    velocity: number;
    timestamp: Date;
}
export interface NamedEntity {
    id: number;
    entityName: string;
    entityType: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY';
    normalizedName: string;
    firstSeen: Date;
    lastSeen: Date;
    occurrenceCount: number;
    isVerified: boolean;
}
export interface EntityClusterLink {
    entityId: number;
    clusterId: string;
    articleCount: number;
    heatContribution: number;
    firstLinked: Date;
    lastLinked: Date;
}
export interface ClusterCrossRef {
    id: number;
    sourceClusterId: string;
    targetClusterId: string;
    referenceType: 'SOFT_REF' | 'RELATED' | 'PART_OF' | 'CAUSES';
    confidence: number;
    createdAt: Date;
}
export interface ClusterHierarchy {
    parentClusterId: string;
    childClusterId: string;
    relationshipType: 'PARENT' | 'CHILD' | 'MERGED_INTO' | 'SPLIT_FROM';
    createdAt: Date;
}
export interface UserEngagement {
    id: number;
    userId: string;
    clusterId: string;
    engagementType: 'VIEW' | 'CLICK' | 'SHARE' | 'SAVE' | 'DISMISS';
    durationMs?: number;
    timestamp: Date;
}
export interface UserCategoryPreferences {
    userId: string;
    category: string;
    weight: number;
    lastUpdated: Date;
}
export interface ClusteringMetric {
    id: number;
    metricType: 'PRECISION' | 'RECALL' | 'COHESION' | 'SEPARATION' | 'F1_SCORE';
    category?: string;
    value: number;
    sampleSize?: number;
    calculatedAt: Date;
    notes?: string;
}
export interface LabelQualityTracking {
    id: number;
    articleId: string;
    labelType: 'TOPIC' | 'CATEGORY' | 'SENTIMENT' | 'URGENCY';
    originalLabel: string;
    correctedLabel?: string;
    accuracyScore?: number;
    feedbackSource?: 'USER' | 'SYSTEM' | 'CROSS_CHECK';
    createdAt: Date;
}
export interface CircuitBreakerMetrics {
    id: number;
    breakerName: string;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    openCount: number;
    lastOpenedAt?: Date;
    lastClosedAt?: Date;
    totalFailures: number;
    totalSuccesses: number;
    avgResponseTimeMs?: number;
    recordedAt: Date;
}
export interface CompositeRanking {
    clusterId: string;
    heatScore: number;
    articleCount: number;
    sentimentVelocity: number;
    sourceAuthorityScore: number;
    marketCorrelationScore?: number;
    entityHeatScore: number;
    compositeScore: number;
    category: string;
}
export interface AnomalyDetection {
    clusterId: string;
    isAnomaly: boolean;
    anomalyType?: 'SUDDEN_SPIKE' | 'UNUSUAL_PATTERN' | 'CROSS_SYNDICATION' | 'VELOCITY_ANOMALY';
    anomalyScore: number;
    detectedAt: Date;
    description?: string;
}
export interface ClusterLifecycle {
    clusterId: string;
    stage: 'EMERGING' | 'SUSTAINED' | 'DECAYING' | 'DEAD';
    peakHeat: number;
    peakTime: Date;
    currentHeat: number;
    predictedNextStage?: string;
    predictedTime?: Date;
}
export interface HeatPrediction {
    clusterId: string;
    currentHeat: number;
    predictedHeat1h: number;
    predictedHeat6h: number;
    predictedHeat24h: number;
    confidence: number;
    predictedAt: Date;
}
export interface EntityHeat {
    entityId: number;
    entityName: string;
    entityType: string;
    totalHeat: number;
    clusterCount: number;
    trendingDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    lastUpdated: Date;
}
export interface ClusterHeatAnalysis {
    clusterId: string;
    currentHeat: number;
    velocity: number;
    acceleration: number;
    trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
    predictedTrajectory: 'SPIKE' | 'SUSTAINED' | 'DECAY';
    confidence: number;
    lifecycleStage: 'EMERGING' | 'SUSTAINED' | 'DECAYING' | 'DEAD';
    timeToPeak?: number;
    timeToDecay?: number;
}
export interface ClusterSimilarityResult {
    cluster1Id: string;
    cluster2Id: string;
    similarity: number;
    topicSimilarity: number;
    keywordSimilarity: number;
    entitySimilarity: number;
    category: string;
    shouldMerge: boolean;
    mergeReason: string;
}
//# sourceMappingURL=types-enhanced.d.ts.map
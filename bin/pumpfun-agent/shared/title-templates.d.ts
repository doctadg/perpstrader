import type { SubEventType, NumericalEntity } from './types';
export interface TitleTemplate {
    full: string;
    medium: string;
    short: string;
    ticker: string;
}
export interface TemplateVariables {
    asset: string;
    assetSymbol?: string;
    percentage?: string;
    price?: string;
    amount?: string;
    reason?: string;
    protocol?: string;
    authority?: string;
    subject?: string;
    company?: string;
    product?: string;
}
/**
 * Apply a template with given variables
 * Replaces {placeholders} with actual values
 */
export declare function applyTemplate(template: string, variables: TemplateVariables): string;
/**
 * Get template for a specific event type
 */
export declare function getTemplate(eventType: SubEventType): TitleTemplate;
/**
 * Generate title formats based on event type and variables
 */
export declare function generateTitleFromTemplate(eventType: SubEventType, variables: TemplateVariables): TitleTemplate;
/**
 * Extract variables from numerical entities for template use
 */
export declare function extractTemplateVariables(asset: string, assetSymbol: string, entities: NumericalEntity[], reason?: string, authority?: string, protocol?: string, company?: string): TemplateVariables;
/**
 * Get a generic positive movement template (when no specific event type)
 */
export declare function getPositiveMovementTemplate(): TitleTemplate;
/**
 * Get a generic negative movement template (when no specific event type)
 */
export declare function getNegativeMovementTemplate(): TitleTemplate;
/**
 * Get a generic news template (fallback)
 */
export declare function getGenericNewsTemplate(): TitleTemplate;
//# sourceMappingURL=title-templates.d.ts.map
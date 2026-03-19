"use strict";
// Title Templates
// Predefined title templates for consistent formatting by event type
// Each template produces high-quality, informative titles
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTemplate = applyTemplate;
exports.getTemplate = getTemplate;
exports.generateTitleFromTemplate = generateTitleFromTemplate;
exports.extractTemplateVariables = extractTemplateVariables;
exports.getPositiveMovementTemplate = getPositiveMovementTemplate;
exports.getNegativeMovementTemplate = getNegativeMovementTemplate;
exports.getGenericNewsTemplate = getGenericNewsTemplate;
// ============================================================================
// TEMPLATES BY EVENT TYPE
// ============================================================================
const TEMPLATES = {
    // Price Movement Events
    price_surge: {
        full: '{asset} surges {percentage}% to {price}',
        medium: '{asset} surges {percentage}%',
        short: '{asset} +{percentage}%',
        ticker: '{assetSymbol} +{percentage}%',
    },
    price_drop: {
        full: '{asset} plunges {percentage}% to {price}',
        medium: '{asset} drops {percentage}%',
        short: '{asset} -{percentage}%',
        ticker: '{assetSymbol} -{percentage}%',
    },
    breakout: {
        full: '{asset} breaks out at {price}',
        medium: '{asset} breaks {price}',
        short: '{asset} breaks out',
        ticker: '{assetSymbol} breakout',
    },
    // Regulatory/Legal Events
    seizure: {
        full: '{asset} hit with ${amount} seizure by authorities',
        medium: '{asset} faces ${amount} seizure',
        short: '{asset} seized',
        ticker: '{assetSymbol} seizure',
    },
    approval: {
        full: '{authority} approves {subject} for {asset}',
        medium: '{asset} gets {subject} approval',
        short: '{asset} approved',
        ticker: '{assetSymbol} approved',
    },
    sanction: {
        full: '{authority} imposes sanctions on {asset}',
        medium: '{asset} sanctioned by {authority}',
        short: '{asset} sanctioned',
        ticker: '{assetSymbol} sanctioned',
    },
    ruling: {
        full: 'Court rules in favor of {asset} on {subject}',
        medium: '{asset} wins court ruling',
        short: '{asset} ruling',
        ticker: '{assetSymbol} ruling',
    },
    // Security Events
    hack: {
        full: '{asset} loses ${amount} in {protocol} hack/exploit',
        medium: '{asset} loses ${amount} in hack',
        short: '{asset} hacked',
        ticker: '{assetSymbol} hacked',
    },
    oracle_exploit: {
        full: '{protocol} oracle exploit affects {asset}',
        medium: '{asset} hit by oracle exploit',
        short: '{asset} oracle exploit',
        ticker: '{assetSymbol} exploit',
    },
    bridge_exploit: {
        full: '{asset} bridge loses ${amount} in exploit',
        medium: '{asset} bridge exploited for ${amount}',
        short: '{asset} bridge hack',
        ticker: '{assetSymbol} bridge hack',
    },
    smart_contract: {
        full: '{asset} smart contract vulnerability discovered',
        medium: '{asset} contract bug found',
        short: '{asset} contract issue',
        ticker: '{assetSymbol} contract bug',
    },
    // Market Structure Events
    listing: {
        full: '{asset} lists on {subject}',
        medium: '{asset} now available on {subject}',
        short: '{asset} listed',
        ticker: '{assetSymbol} listed',
    },
    delisting: {
        full: '{asset} delisted from {subject}',
        medium: '{asset} removed from {subject}',
        short: '{asset} delisted',
        ticker: '{assetSymbol} delisted',
    },
    // Corporate Events
    launch: {
        full: '{company} launches {product} for {asset}',
        medium: '{asset} gets new {product}',
        short: '{asset} {product} launch',
        ticker: '{assetSymbol} {product}',
    },
    partnership: {
        full: '{company} partners with {asset} on {product}',
        medium: '{company} partners with {asset}',
        short: '{asset} partnership',
        ticker: '{assetSymbol} partnership',
    },
    merger: {
        full: '{company} to merge with {asset}',
        medium: '{company}-{asset} merger announced',
        short: '{asset} merger',
        ticker: '{assetSymbol} merger',
    },
    acquisition: {
        full: '{company} acquires {asset}',
        medium: '{company} buys {asset}',
        short: '{asset} acquired',
        ticker: '{assetSymbol} bought',
    },
    earnings: {
        full: '{asset} earnings: {reason}',
        medium: '{asset} reports earnings',
        short: '{asset} earnings',
        ticker: '{assetSymbol} earnings',
    },
    // Governance Events
    governance: {
        full: '{asset} governance proposal: {subject}',
        medium: '{asset} proposal on {subject}',
        short: '{asset} governance',
        ticker: '{assetSymbol} governance',
    },
    proposal: {
        full: '{subject} proposed for {asset}',
        medium: '{asset} faces {subject} proposal',
        short: '{asset} proposal',
        ticker: '{assetSymbol} proposal',
    },
    // DeFi Specific Events
    stablecoin_peg: {
        full: '{asset} stablecoin loses peg, trading at {price}',
        medium: '{asset} depegs to {price}',
        short: '{asset} depeg',
        ticker: '{assetSymbol} depeg',
    },
    liquidation_cascade: {
        full: '{asset} liquidation cascade wipes ${amount}',
        medium: '{asset} sees ${amount} in liquidations',
        short: '{asset} liquidations',
        ticker: '{assetSymbol} liquidated',
    },
    whale_alert: {
        full: '${amount} {asset} moved to {subject}',
        medium: '${amount} {asset} transferred',
        short: '{asset} whale move',
        ticker: '{assetSymbol} whale',
    },
    etf_flow: {
        full: '{asset} ETF sees {amount} in flows',
        medium: '{asset} ETF {amount} flows',
        short: '{asset} ETF flows',
        ticker: '{assetSymbol} ETF',
    },
    // Regulatory
    regulation: {
        full: '{authority} proposes {subject} regulations for {asset}',
        medium: '{asset} faces new {subject} rules',
        short: '{asset} regulation',
        ticker: '{assetSymbol} regulation',
    },
    // Conflict/Geopolitics
    protest: {
        full: 'Protests against {asset} in {subject}',
        medium: '{asset} faces protests',
        short: '{asset} protests',
        ticker: '{assetSymbol} protest',
    },
    conflict: {
        full: 'Conflict impacts {asset} market',
        medium: '{asset} affected by conflict',
        short: '{asset} conflict',
        ticker: '{assetSymbol} conflict',
    },
    // Fallback
    other: {
        full: '{asset}: {reason}',
        medium: '{asset} update',
        short: '{asset} news',
        ticker: '{assetSymbol}',
    },
};
// ============================================================================
// TEMPLATE APPLICATION
// ============================================================================
/**
 * Apply a template with given variables
 * Replaces {placeholders} with actual values
 */
function applyTemplate(template, variables) {
    let result = template;
    // Replace each variable
    for (const [key, value] of Object.entries(variables)) {
        if (value === undefined || value === null)
            continue;
        const placeholder = `{${key}}`;
        result = result.replaceAll(placeholder, value);
    }
    // Remove any remaining placeholders with missing values
    result = result.replace(/\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
    return result;
}
/**
 * Get template for a specific event type
 */
function getTemplate(eventType) {
    return TEMPLATES[eventType] || TEMPLATES.other;
}
/**
 * Generate title formats based on event type and variables
 */
function generateTitleFromTemplate(eventType, variables) {
    const template = getTemplate(eventType);
    return {
        full: applyTemplate(template.full, variables),
        medium: applyTemplate(template.medium, variables),
        short: applyTemplate(template.short, variables),
        ticker: applyTemplate(template.ticker, variables),
    };
}
/**
 * Extract variables from numerical entities for template use
 */
function extractTemplateVariables(asset, assetSymbol, entities, reason, authority, protocol, company) {
    const priceEntity = entities.find(e => e.type === 'price');
    const percentageEntity = entities.find(e => e.type === 'percentage');
    const amountEntity = entities.find(e => e.type === 'amount' || e.type === 'volume');
    return {
        asset,
        assetSymbol: assetSymbol || asset,
        price: priceEntity ? formatPriceValue(priceEntity) : undefined,
        percentage: percentageEntity ? `${percentageEntity.value}%` : undefined,
        amount: amountEntity ? formatAmountValue(amountEntity) : undefined,
        reason: reason || undefined,
        authority: authority || undefined,
        protocol: protocol || undefined,
        company: company || undefined,
    };
}
/**
 * Format a price entity for template use
 */
function formatPriceValue(entity) {
    const { value, currency } = entity;
    if (currency === 'USD' || currency === 'EUR') {
        if (value >= 1000) {
            return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        }
        return value.toFixed(2);
    }
    if (currency === 'BTC' || currency === 'ETH') {
        return value.toFixed(4);
    }
    return value.toLocaleString();
}
/**
 * Format an amount entity for template use
 */
function formatAmountValue(entity) {
    const { value, unit, currency } = entity;
    if (currency) {
        return `${formatMagnitude(value)} ${currency}`;
    }
    if (unit) {
        return `$${entity.value}${unit}`;
    }
    return `$${formatMagnitude(value)}`;
}
/**
 * Format large numbers with magnitude suffix
 */
function formatMagnitude(value) {
    if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    else if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    else if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toString();
}
// ============================================================================
// DEFAULT TEMPLATES FOR COMMON PATTERNS
// ============================================================================
/**
 * Get a generic positive movement template (when no specific event type)
 */
function getPositiveMovementTemplate() {
    return {
        full: '{asset} gains {percentage}%',
        medium: '{asset} +{percentage}%',
        short: '{asset} +{percentage}%',
        ticker: '{assetSymbol} +{percentage}%',
    };
}
/**
 * Get a generic negative movement template (when no specific event type)
 */
function getNegativeMovementTemplate() {
    return {
        full: '{asset} falls {percentage}%',
        medium: '{asset} -{percentage}%',
        short: '{asset} -{percentage}%',
        ticker: '{assetSymbol} -{percentage}%',
    };
}
/**
 * Get a generic news template (fallback)
 */
function getGenericNewsTemplate() {
    return {
        full: '{asset}: {reason}',
        medium: '{asset} update',
        short: '{asset} news',
        ticker: '{assetSymbol}',
    };
}
//# sourceMappingURL=title-templates.js.map
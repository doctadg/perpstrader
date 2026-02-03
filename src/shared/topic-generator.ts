const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'it',
  'as', 'if', 'than', 'so', 'because', 'while', 'when', 'where', 'what', 'which', 'who', 'whom',
  'about', 'after', 'before', 'above', 'below', 'into', 'through', 'during', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'just', 'news', 'today',
  'latest', 'update', 'report', 'reports', 'says', 'said', 'according', 'vs', 'versus',
])

const ACTION_PATTERNS: [RegExp, string][] = [
  [/approve[sd]?/i, 'approves'],
  [/launch[es|ed]?/i, 'launches'],
  [/hack[ed|s]?/i, 'hacks'],
  [/seiz(?:es|ed|ing)/i, 'seizes'],
  [/announce[sd]?/i, 'announces'],
  [/plunge[sd]?/i, 'plunges'],
  [/break[sz]/i, 'breaks'],
  [/rall[y|ies]?[d]?/i, 'rallies'],
  [/surge[sd]?/i, 'surges'],
  [/partners?[ed]?/i, 'partners'],
  [/merge[sd]?/i, 'merges'],
  [/delist[ed]?/i, 'delists'],
  [/list[sd]?/i, 'lists'],
  [/report[ed]?/i, 'reports'],
  [/predict[ed]?/i, 'predicts'],
  [/trade[sd]?/i, 'trades'],
  [/sign[ed]?/i, 'signs'],
  [/ban[ned]?/i, 'bans'],
  [/sanction[ed]?/i, 'sanctions'],
  [/reject[ed]?/i, 'rejects'],
  [/reveal[ed]?/i, 'reveals'],
  [/unveil[ed]?/i, 'unveils'],
  [/star[ts]?/i, 'starts'],
  [/end[ed]?/i, 'ends'],
  [/win[s]?/i, 'wins'],
  [/lose[s]?/i, 'loses'],
  [/beat[s]?/i, 'beats'],
  [/miss[ed]?/i, 'misses'],
  [/upgrade[sd]?/i, 'upgrades'],
  [/downgrade[sd]?/i, 'downgrades'],
  [/acquire[ds]?/i, 'acquires'],
  [/sell[ing]?/i, 'sells'],
  [/buy[ing]?/i, 'buys'],
  [/invest[ed]?/i, 'invests'],
  [/exit[ed]?/i, 'exits'],
  [/propose[sd]?/i, 'proposes'],
  [/warn[s]?/i, 'warns'],
  [/alert[s]?/i, 'alerts'],
  [/target[ed]?/i, 'targets'],
  [/expect[ed]?/i, 'expects'],
  [/see[s]?/i, 'sees'],
  [/face[sd]?/i, 'faces'],
  [/join[ed]?/i, 'joins'],
  [/leave[s]?/i, 'leaves'],
  [/move[sd]?/i, 'moves'],
  [/shift[ed]?/i, 'shifts'],
  [/focus[ed]?/i, 'focuses'],
  [/lead[s]?/i, 'leads'],
  [/follow[ed]?/i, 'follows'],
  [/support[sd]?/i, 'supports'],
  [/oppose[ds]?/i, 'opposes'],
  [/criticize[sd]?/i, 'criticizes'],
  [/praise[sd]?/i, 'praises'],
  [/question[ed]?/i, 'questions'],
  [/examine[ds]?/i, 'examines'],
  [/analyze[sd]?/i, 'analyzes'],
  [/review[ed]?/i, 'reviews'],
  [/updat[e|es]?/i, 'updates'],
  [/confirm[ed]?/i, 'confirms'],
  [/den[ies|y]?/i, 'denies'],
  [/clarif[y|ies|ied]/i, 'clarifies'],
  [/adjust[ed]?/i, 'adjusts'],
  [/chang[e|es|ed|ing]/i, 'changes'],
  [/rais[e|es|ed]/i, 'raises'],
  [/cut[s]?/i, 'cuts'],
  [/halt[ed]?/i, 'halts'],
  [/paus[e|es|ed]/i, 'pauses'],
  [/continu[e|es|ed]/i, 'continues'],
  [/stop[s]?/i, 'stops'],
  [/begin[s]?/i, 'begins'],
  [/complet[e|es|ed]/i, 'completes'],
  [/finish[es]?/i, 'finishes'],
  [/post[ed]?/i, 'posts'],
  [/publish[es|ed]?/i, 'publishes'],
  [/release[sd]?/i, 'releases'],
  [/share[sd]?/i, 'shares'],
  [/present[ed]?/i, 'presents'],
  [/demonstrat[e|es|ed]/i, 'demonstrates'],
  [/show[s]?/i, 'shows'],
  [/indicat[e|es|e]/i, 'indicates'],
  [/suggest[ed]?/i, 'suggests'],
  [/highlight[ed]?/i, 'highlights'],
  [/emphasiz[e|es|ed]/i, 'emphasizes'],
  [/notic[e|es|ed]/i, 'notices'],
  [/observ[e|es|ed]/i, 'observes'],
  [/not[e|es]?/i, 'notes'],
  [/point[ed]?/i, 'points'],
  [/argu[e|es|ed]/i, 'argues'],
  [/debat[e|es|ed]/i, 'debates'],
  [/discuss[ed]?/i, 'discusses'],
  [/explor[e|es|ed]/i, 'explores'],
  [/examin[e|es|ed]/i, 'examines'],
  [/investigat[e|es|ed]/i, 'investigates'],
  [/prosecut[e|es|ed]/i, 'prosecutes'],
  [/convict[ed]?/i, 'convicts'],
  [/acquit[t]?[ed]?/i, 'acquits'],
  [/sentenc[e|es|ed]/i, 'sentences'],
  [/arrest[ed]?/i, 'arrests'],
  [/charg[e|es|ed]/i, 'charges'],
  [/indict[ed]?/i, 'indicts'],
  [/raid[s]?/i, 'raids'],
  [/attack[ed]?/i, 'attacks'],
  [/defeat[ed]?/i, 'defeats'],
  [/triumph[ed]?/i, 'triumphs'],
  [/champion[s]?/i, 'champions'],
  [/defend[ed]?/i, 'defends'],
  [/protect[ed]?/i, 'protects'],
  [/sav[e|es]?/i, 'saves'],
  [/rescu[e|es|ed]/i, 'rescues'],
  // Additional patterns
  [/expand[ed]?/i, 'expands'],
  [/extend[sd]?/i, 'extends'],
  [/reduc[e|es|ed]/i, 'reduces'],
  [/increas[e|es|ed]/i, 'increases'],
  [/decreas[e|es|ed]/i, 'decreases'],
  [/declin[e|es|ed]/i, 'declines'],
  [/improv[e|es|ed]/i, 'improves'],
  [/worsen[s]?/i, 'worsens'],
  [/stabiliz[e|es|ed]/i, 'stabilizes'],
  [/destabiliz[e|es|ed]/i, 'destabilizes'],
  [/recover[s]?/i, 'recovers'],
  [/collaps[e|es|ed]/i, 'collapses'],
  [/crash[es|ed]/i, 'crashes'],
  [/soar[s]?/i, 'soars'],
  [/slump[s]?/i, 'slumps'],
  [/spik[e|es|ed]/i, 'spikes'],
  [/dip[s]?/i, 'dips'],
  [/dropp[s|ped]?/i, 'drops'],
  [/gain[sd]?/i, 'gains'],
  [/fall[s]?/i, 'falls'],
  [/climb[s]?/i, 'climbs'],
  [/slid[es]?/i, 'slides'],
  [/plummet[sd]?/i, 'plummets'],
  [/skyrocket[sd]?/i, 'skyrockets'],
  [/tumbl[es]?/i, 'tumbles'],
  [/rebound[sd]?/i, 'rebounds'],
  [/corre[ct|cts]?/i, 'corrects'],
  [/divid[e|es|ed]/i, 'divides'],
  [/split[s]?/i, 'splits'],
  [/separat[e|es|ed]/i, 'separates'],
  [/isolat[e|es|ed]/i, 'isolates'],
  [/suspend[sd]?/i, 'suspends'],
  [/resum[e|es|ed]/i, 'resumes'],
  [/terminate[sd]?/i, 'terminates'],
  [/expire[sd]?/i, 'expires'],
  [/extend[sd]?/i, 'extends'],
  [/withdraw[s]?/i, 'withdraws'],
  [/deposit[sd]?/i, 'deposits'],
  [/transfer[s]?/i, 'transfers'],
  [/receiv[e|es|ed]/i, 'receives'],
  [/deliver[sd]?/i, 'delivers'],
  [/ship[s]?/i, 'ships'],
  [/manufactur[e|es|ed]/i, 'manufactures'],
  [/produc[e|es|ed]/i, 'produces'],
  [/distribut[e|es|ed]/i, 'distributes'],
  [/regulat[e|es|ed]/i, 'regulates'],
  [/legislat[e|es|ed]/i, 'legislates'],
  [/negotiat[e|es|ed]/i, 'negotiates'],
  [/mediat[e|es|ed]/i, 'mediates'],
  [/arbitrat[e|es|ed]/i, 'arbitrates'],
  [/adjudicat[e|es|ed]/i, 'adjudicates'],
  [/sentenc[e|es|ed]/i, 'sentences'],
  [/execut[e|es|ed]/i, 'executes'],
  [/implement[sd]?/i, 'implements'],
  [/enact[sd]?/i, 'enacts'],
  [/repeal[sd]?/i, 'repeals'],
  [/overturn[sd]?/i, 'overturns'],
  [/uphold[sd]?/i, 'upholds'],
  [/abolish[es]?/i, 'abolishes'],
  [/eliminat[e|es|ed]/i, 'eliminates'],
  [/eradicat[e|es|ed]/i, 'eradicates'],
  [/restor[e|es|ed]/i, 'restores'],
  [/replac[e|es|ed]/i, 'replaces'],
  [/remov[e|es|ed]/i, 'removes'],
  [/add[sd]?/i, 'adds'],
  [/inject[sd]?/i, 'injects'],
  [/withdraw[s]?/i, 'withdraws'],
  [/circulat[e|es|ed]/i, 'circulates'],
  [/distribut[e|es|ed]/i, 'distributes'],
  [/allocat[e|es|ed]/i, 'allocates'],
  [/assign[sd]?/i, 'assigns'],
  [/appoint[sd]?/i, 'appoints'],
  [/nom[inat|nated]?e[sd]?/i, 'nominates'],
  [/elect[sd]?/i, 'elects'],
  [/vote[sd]?/i, 'votes'],
  [/cast[sd]?/i, 'casts'],
  [/approv[es|al]/i, 'approves'],
  [/vet[oes]?/i, 'vetoes'],
  [/endors[e|es|ed]/i, 'endorses'],
  [/back[sd]?/i, 'backs'],
  [/support[sd]?/i, 'supports'],
  [/oppos[es|ed]/i, 'opposes'],
  [/condemn[sd]?/i, 'condemns'],
  [/prais[e|es|ed]/i, 'praises'],
  [/commend[sd]?/i, 'commends'],
  [/criticiz[e|es|ed]/i, 'criticizes'],
  [/condemn[sd]?/i, 'condemns'],
  [/denounc[e|es|ed]/i, 'denounces'],
  [/celebrat[e|es|ed]/i, 'celebrates'],
  [/mourn[sd]?/i, 'mourns'],
  [/protest[sd]?/i, 'protests'],
  [/demonstrat[e|es|ed]/i, 'demonstrates'],
  [/march[es]?/i, 'marches'],
  [/riot[s]?/i, 'riots'],
  [/revolt[s]?/i, 'revolts'],
  [/rebel[s]?/i, 'rebels'],
  [/surrend[ers|ed]?/i, 'surrenders'],
  [/capitulat[e|es|ed]/i, 'capitulates'],
  [/withdraw[s]?/i, 'withdraws'],
  [/retreat[sd]?/i, 'retreats'],
  [/advanc[e|es|ed]/i, 'advances'],
  [/proceed[sd]?/i, 'proceeds'],
  [/progress[es]?/i, 'progresses'],
  [/continu[e|es|ed]/i, 'continues'],
  [/persist[sd]?/i, 'persists'],
  [/insist[sd]?/i, 'insists'],
  [/resist[sd]?/i, 'resists'],
  [/ challeng[e|es|ed]/i, 'challenges'],
  [/disput[e|es|ed]/i, 'disputes'],
  [/appeal[sd]?/i, 'appeals'],
  [/sue[sd]?/i, 'sues'],
  [/sue[sd]?/i, 'sues'],
]

function cleanWord(word: string): string {
  return word.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
}

function extractAction(text: string): string {
  for (const [pattern, action] of ACTION_PATTERNS) {
    if (pattern.test(text)) {
      return action
    }
  }
  return ''
}

function extractKeyTerms(title: string, action: string): string[] {
  const words = title.split(/\s+/).map(cleanWord).filter(w => w.length > 2)
  
  const actionLower = action.toLowerCase()
  const actionVariants = new Set([
    actionLower, 
    actionLower.replace(/s$/, ''),
    actionLower + 'ed',
    actionLower + 'ing'
  ])
  
  const keyTerms = words.filter(w => 
    !STOP_WORDS.has(w) && 
    !actionVariants.has(w) &&
    !/^\d+$/.test(w)
  )
  
  return [...new Set(keyTerms)].slice(0, 4)
}

function determineTrend(action: string, keywords: string[]): 'UP' | 'DOWN' | 'NEUTRAL' {
  const lowerAction = action.toLowerCase()
  
  const upActions = new Set([
    'approves', 'launches', 'announces', 'breaks', 'rallies', 'surges', 'partners',
    'merges', 'lists', 'wins', 'beats', 'upgrades', 'acquires', 'buys', 'invests',
    'signs', 'reveals', 'unveils', 'starts', 'joins', 'completes', 'shows'
  ])
  
  const downActions = new Set([
    'hacks', 'seizes', 'plunges', 'delists', 'bans', 'sanctions', 'rejects',
    'misses', 'downgrades', 'sells', 'exits', 'proposes', 'warns', 'faces',
    'loses', 'arrests', 'raids', 'attacks', 'convicts', 'halts', 'pauses'
  ])
  
  if (upActions.has(lowerAction)) return 'UP'
  if (downActions.has(lowerAction)) return 'DOWN'
  
  const lowerKeywords = keywords.join(' ').toLowerCase()
  if (/surge|rally|gain|up|record|high|boost|growth|profit|beat/i.test(lowerKeywords)) return 'UP'
  if (/crash|plunge|drop|fall|loss|down|low|crash|ban|hack|seiz/i.test(lowerKeywords)) return 'DOWN'
  
  return 'NEUTRAL'
}

export function generateTopic(title: string) {
  const action = extractAction(title)
  const keyTerms = extractKeyTerms(title, action)

  let topic: string
  if (action && keyTerms.length > 0) {
    const capitalizedAction = toTitleCaseWord(action)
    const capitalizedTerms = keyTerms.map(w => toTitleCaseWord(w))
    topic = `${capitalizedAction} ${capitalizedTerms.join(' ')}`
  } else if (action) {
    topic = toTitleCaseWord(action)
  } else if (keyTerms.length > 0) {
    topic = keyTerms.map(w => toTitleCaseWord(w)).join(' ')
  } else {
    const fallback = title.split(/\s+/).slice(0, 6).map(w =>
      w.replace(/[^a-zA-Z0-9-]/g, '')
    ).filter(w => w.length > 2).map(w => toTitleCaseWord(w)).join(' ')
    topic = fallback || 'General News'
  }

  // Limit to 8 words for readability
  const topicWords = topic.split(' ').slice(0, 8)
  topic = topicWords.join(' ')

  // topicKey is for internal database use only (still uses underscores)
  const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const trendDirection = determineTrend(action, keyTerms)

  return {
    topic,
    topicKey,
    keywords: keyTerms.map(w => toTitleCaseWord(w)),
    action,
    trendDirection
  }
}

/**
 * Convert a word to Title Case (capitalizes first letter, lowercases the rest).
 * Handles common words that should stay lowercase appropriately.
 */
function toTitleCaseWord(word: string): string {
  if (!word || word.length === 0) return ''
  if (word.length === 1) return word.toUpperCase()

  // Common acronyms that should stay uppercase
  const acronyms = new Set(['BTC', 'ETH', 'USD', 'US', 'UK', 'EU', 'Fed', 'SEC', 'ETF', 'IPO', 'CEO', 'CFO', 'CTO', 'NFT', 'DAO', 'DeFi', 'TVL', 'APY', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'])
  const upperWord = word.toUpperCase()
  if (acronyms.has(upperWord)) return upperWord

  // Regular title case: first letter upper, rest lower
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

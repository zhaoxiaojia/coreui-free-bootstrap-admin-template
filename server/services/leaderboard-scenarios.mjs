const baseCompositeScoringV1 = {
  version: 'v1',
  notes: [
    'One row per project (aggregated).',
    'Score scale: 0-1000 (1000 = theoretical ceiling after sample factor).',
    'Only golden test reports are used.',
    'Defaults to last 180 days if no date filter is provided.'
  ],
  components: [
    {
      name: 'Throughput composite',
      details: [
        'Per (standard, band, protocol) group: avg(throughput_avg_mbps) and avg(coalesce(throughput_peak_mbps, throughput_avg_mbps)).',
        'Group throughput = 0.85 * avg + 0.15 * peak.'
      ]
    },
    {
      name: 'Weights',
      details: [
        'Protocol: TCP=1.0, UDP=0.9, other=0.9.',
        'Band: 2.4=0.8, 5=1.0, 6=1.05.',
        'Standard: 11n=0.85, 11ac=1.0, 11ax=1.05, 11be=1.1.'
      ]
    },
    {
      name: 'Normalization & sample factor',
      details: [
        'Normalize by theoretical throughput ceiling: PHY rate × efficiency (p95 of throughput/phy by protocol).',
        'Theoretical PHY rate comes from a (standard, bandwidth) lookup (e.g., 11n@40=300, 11ax@80=1201).',
        'If a theoretical PHY rate is not available, fall back to relative normalization (best project in the dataset).',
        'Sample factor = 0.7 + 0.3 * min(1, log10(samples+1)/log10(201)).',
        'Final score = clamp01(composite_raw / theoretical_ceiling_mbps) × sample_factor × 1000.'
      ]
    }
  ]
}

export const leaderboardScenarios = {
  performance: {
    key: 'performance',
    label: 'Performance',
    scoreLabel: 'Composite',
    defaultDays: 180,
    filters: {},
    scoring: {
      ...baseCompositeScoringV1,
      title: 'Composite Performance Score (v1)'
    }
  },
  home: {
    key: 'home',
    label: 'Home Environment',
    scoreLabel: 'Composite',
    defaultDays: 180,
    filters: { pathLossMin: 40, pathLossMax: 70 },
    scoring: {
      ...baseCompositeScoringV1,
      title: 'Home Environment Score (v1)',
      notes: [...baseCompositeScoringV1.notes, 'Filter: path_loss_db between 40 and 70.']
    }
  },
  interference: {
    key: 'interference',
    label: 'Interference',
    scoreLabel: 'Composite',
    defaultDays: 180,
    filters: { rssiMax: -65 },
    scoring: {
      ...baseCompositeScoringV1,
      title: 'Interference Score (v1)',
      notes: [...baseCompositeScoringV1.notes, 'Filter: rssi <= -65.']
    }
  }
}

export const getLeaderboardScenario = scenarioKey => {
  if (!scenarioKey) return null
  return leaderboardScenarios[scenarioKey] ?? null
}

export const compositeThroughputWeightsV1 = {
  protocol: {
    TCP: 1.0,
    UDP: 0.9,
    default: 0.9
  },
  band: {
    '2.4': 0.8,
    '5': 1.0,
    '6': 1.05,
    default: 1.0
  },
  standard: {
    '11n': 0.85,
    '11ac': 1.0,
    '11ax': 1.05,
    '11be': 1.1,
    default: 1.0
  },
  throughput: {
    avg: 0.85,
    peak: 0.15
  },
  sampleFactor: {
    base: 0.7,
    extra: 0.3,
    fullSamples: 200
  },
  scoreScale: 1000,
  theoreticalCeiling: {
    description: 'Normalize by theoretical throughput ceiling derived from PHY rate and efficiency.',
    // If PHY rate is missing, the system falls back to relative normalization (best project in the dataset).
    fallbackToRelative: true,
    // Theoretical PHY rates (Mbps) used as the "full score" baseline.
    // Assumption: max MCS, short GI, 2 spatial streams. Adjust as needed per your DUT/cert targets.
    phyRateMbpsByStandardBandwidth: {
      '11n': {
        20: 144.4,
        40: 300
      },
      '11ac': {
        40: 400,
        80: 866.7
      },
      '11ax': {
        80: 1201
      }
    },
    defaults: {
      TCP: 0.75,
      UDP: 0.85,
      default: 0.75
    },
    percentile: 0.95
  }
}

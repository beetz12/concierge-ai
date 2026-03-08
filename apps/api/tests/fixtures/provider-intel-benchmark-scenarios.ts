export interface ProviderIntelBenchmarkScenario {
  id: string;
  service: string;
  location: string;
  expectedTopProviders: string[];
  expectedFinalists: string[];
  snapshotFile: string;
}

export const providerIntelBenchmarkScenarios: ProviderIntelBenchmarkScenario[] = [
  {
    id: "greenville-landscaper",
    service: "landscaper",
    location: "Greenville, SC",
    expectedTopProviders: [
      "Precision Landscape",
      "Reedy River Landscapes",
      "Southern Stripes Lawn & Landscapes",
    ],
    expectedFinalists: [
      "Precision Landscape",
      "Reedy River Landscapes",
      "Southern Stripes Lawn & Landscapes",
    ],
    snapshotFile: "greenville-landscaper.snapshot.json",
  },
  {
    id: "greenville-plumber",
    service: "plumber",
    location: "Greenville, SC",
    expectedTopProviders: [
      "Dipple Plumbing, Electrical, Heating & Air",
      "Mr. Rooter Plumbing of Greenville",
      "Ken's Plumbing",
    ],
    expectedFinalists: [
      "Chisholm Plumbing, Heating & Air Conditioning",
      "Dipple Plumbing, Electrical, Heating & Air",
      "Superior Plumbing Services",
    ],
    snapshotFile: "greenville-plumber.snapshot.json",
  },
];

export const benchmarkScenarioById = (id: string) =>
  providerIntelBenchmarkScenarios.find((scenario) => scenario.id === id) ?? null;

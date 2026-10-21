import { expect, test } from "bun:test";
import { DISTRIBUTIONS, lnGamma, sample, seeded, weibullShape } from "./distributions";

test("every distribution matches the requested mean and coefficient of variation", () => {
  for (const [name] of DISTRIBUTIONS) {
    for (const [mean, cv] of [[0.1, 0.3], [0.5, 0.6]] as const) {
      // Truncation at zero would bias the symmetric families at high spread.
      if ((name === "normal" || name === "uniform" || name === "exponential") && cv > 0.5) continue;
      const random = seeded(42);
      const values = Array.from({ length: 60_000 }, () => sample(name, mean, cv, random));
      const m = values.reduce((a, v) => a + v, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
      expect(Math.abs(m / mean - 1)).toBeLessThan(0.02);
      expect(Math.abs(sd / (mean * cv) - 1)).toBeLessThan(0.05);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    }
  }
});

test("samplers are seeded and reproducible", () => {
  const draw = () => { const random = seeded(7); return DISTRIBUTIONS.map(([name]) => sample(name, 0.2, 0.7, random)); };
  expect(draw()).toEqual(draw());
  expect(sample("gamma", 0.2, 0, seeded(1))).toBe(0.2);
  expect(sample("weibull", 0, 0.5, seeded(1))).toBe(0);
});

test("gamma and Weibull helpers match known values", () => {
  expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10);
  expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  expect(weibullShape(1)).toBeCloseTo(1, 4); // Exponential.
  expect(weibullShape(0.5227)).toBeCloseTo(2, 2); // Rayleigh.
});

test("Poisson stays discrete: scaled steps of mean / λ", () => {
  const random = seeded(3);
  const values = new Set(Array.from({ length: 2000 }, () => Math.round(sample("poisson", 1, 1, random) * 1e9) / 1e9));
  for (const value of values) expect(Number.isInteger(value)).toBe(true);
});

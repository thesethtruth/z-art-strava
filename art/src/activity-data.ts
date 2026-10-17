import data from "../data/daily-activities.json";
import type { Sport } from "./settings";

export type Daily = { date: string; sport: Sport; hours: number; activities: number };
export const DAILY = data.daily as Daily[];
export const META = data.meta;
export const YEARS = data.meta.years;
export const ARTWORK_NAME = `movement-${YEARS[0]}-${YEARS.at(-1)}-A1`;
export const ROWS = 53;

// UTC is used for arithmetic only. These date strings are already local calendar days.
// ISO week-years would put some January / December dates in the wrong year column.
export function calendarPosition(date: string) {
  const d = new Date(date + "T00:00:00Z");
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.round((+d - +jan1) / 86_400_000);
  const mondayOffset = (jan1.getUTCDay() + 6) % 7;
  return { year, row: Math.floor((dayOfYear + mondayOffset) / 7), weekday: (d.getUTCDay() + 6) % 7 };
}

export type Mark = Daily & { x: number; y: number; r: number; year: number; row: number };
export type Week = { x: number; y: number; year: number; row: number; days: Daily[] };


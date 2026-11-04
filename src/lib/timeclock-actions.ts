import type { TimeclockActivity, TimeEntry } from "@/types";
import { clockOutD1Entries, clockOutD1Entry, createD1TimeEntry, deleteD1Pin, fetchTimeclockPins, lookupD1Pin, setD1Pin } from "@/lib/operations-api";

export async function setTimeclockPin(uid: string, pin: string) {
  if (!/^\d{1,3}$/.test(pin)) throw new Error("PINs must be 1–3 digits.");
  return setD1Pin(uid, pin);
}

export async function assignAvailableTimeclockPin(uid: string) {
  const usedPins = new Set((await fetchTimeclockPins()).map((pin) => pin.pin));
  const randomStart = crypto.getRandomValues(new Uint16Array(1))[0] % 999;

  // Scan the full 1–999 range from a random starting point. Calling
  // setTimeclockPin re-checks uniqueness immediately before the write.
  for (let offset = 0; offset < 999; offset += 1) {
    const pin = String(((randomStart + offset) % 999) + 1);
    if (usedPins.has(pin)) continue;
    try {
      await setTimeclockPin(uid, pin);
      return pin;
    } catch (error) {
      if (error instanceof Error && error.message === "That PIN is already in use.") continue;
      throw error;
    }
  }

  throw new Error("All available 1–3 digit timeclock PINs are already assigned.");
}

export async function removeTimeclockPin(uid: string) {
  return deleteD1Pin(uid);
}

export async function findUidByPin(pin: string) {
  return lookupD1Pin(pin);
}

export async function clockInUser(
  uid: string,
  activity: TimeclockActivity,
  activityName: string,
  coachUid: string
) {
  void coachUid;
  return createD1TimeEntry(uid, activity, activityName);
}

export async function clockOutEntry(entryId: string, coachUid: string) {
  void coachUid;
  return clockOutD1Entry(entryId);
}

export async function clockOutEveryone(entries: TimeEntry[], coachUid: string) {
  void coachUid;
  return clockOutD1Entries(entries.map((entry) => entry.id));
}

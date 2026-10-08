export interface Destination {
  tube: number;
  set: string;
  box: number;
  slot: string;
}

export function destinationFor(
  destSets: readonly string[],
  boxNumber: number,
  slot: string,
  tube: number,
): Destination {
  return {
    tube,
    set: destSets[tube - 1] ?? `Set ${tube}`,
    box: boxNumber,
    slot,
  };
}

export function describeDestination(d: Destination): string {
  return `${d.set} box ${d.box} · ${d.slot}`;
}

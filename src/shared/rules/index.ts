import { getTemplate } from './encounters';
import { applyDelta, deriveTitle } from './stats';
import type { ChoiceDef, ChoiceView, EncounterView, Stats } from './types';

export * from './types';
export * from './stats';
export * from './daily';
export { TEMPLATES, TEMPLATE_COUNT, getTemplate } from './encounters';

function signed(n: number): string {
  return String(n).replace('-', '−');
}

function lockReason(choice: ChoiceDef, s: Stats): string | undefined {
  const r = choice.requires;
  if (!r) return undefined;
  if (r.minSupplies !== undefined && s.supplies < r.minSupplies) {
    return `Needs ${r.minSupplies} supply (you have ${s.supplies})`;
  }
  if (r.minNotoriety !== undefined && s.notoriety < r.minNotoriety) {
    return `Needs notoriety ${r.minNotoriety} (now ${s.notoriety})`;
  }
  if (r.minTrust !== undefined && s.trust < r.minTrust) {
    return `Needs trust ${r.minTrust} (now ${signed(s.trust)})`;
  }
  return undefined;
}

export function checkEligibility(choice: ChoiceDef, s: Stats): { eligible: boolean; lockReason?: string } {
  const why = lockReason(choice, s);
  if (why) return { eligible: false, lockReason: why };
  return { eligible: true };
}

export function buildChoiceView(choice: ChoiceDef, s: Stats): ChoiceView {
  const { eligible, lockReason } = checkEligibility(choice, s);
  return {
    id: choice.id,
    label: choice.label,
    blurb: choice.blurb,
    eligible,
    lockReason,
    delta: { ...choice.delta },
    preview: applyDelta(s, choice.delta),
  };
}

export function buildEncounterView(templateId: number, instanceId: string, s: Stats): EncounterView {
  const t = getTemplate(templateId);
  return {
    instanceId,
    templateId,
    title: t.title,
    text: t.text,
    choices: t.choices.map(c => buildChoiceView(c, s)),
  };
}

export function findChoice(templateId: number, choiceId: string): ChoiceDef {
  const t = getTemplate(templateId);
  const c = t.choices.find(x => x.id === choiceId);
  if (!c) throw new Error(`Unknown choice ${choiceId} on template ${templateId}`);
  return c;
}

export function alwaysAvailableChoiceExists(templateId: number): boolean {
  const t = getTemplate(templateId);
  return t.choices.some(c => !c.requires);
}

export { deriveTitle };

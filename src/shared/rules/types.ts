export interface Stats {
  trust: number;
  notoriety: number;
  supplies: number;
}

export type Title = 'The Feared' | 'The Trusted' | 'The Notorious' | 'The Unwritten';

export interface ChoiceRequirements {
  minSupplies?: number;
  minNotoriety?: number;
  minTrust?: number;
}

export interface ChoiceDef {
  id: string;
  label: string;
  blurb: string;
  outcome: string;
  delta: Stats;
  requires?: ChoiceRequirements;
}

export interface TemplateDef {
  id: number;
  title: string;
  text: string;
  choices: ChoiceDef[];
}

export interface ChoiceView {
  id: string;
  label: string;
  blurb: string;
  eligible: boolean;
  lockReason?: string;
  delta: Stats;
  preview: Stats;
}

export interface EncounterView {
  instanceId: string;
  templateId: number;
  title: string;
  text: string;
  choices: ChoiceView[];
}

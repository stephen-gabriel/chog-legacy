import type { TemplateDef } from './types';

export const TEMPLATES: readonly TemplateDef[] = [
  {
    id: 0,
    title: 'A stranded courier',
    text: 'A courier’s cart lies tipped in the ditch, wheels spinning free. The courier watches you from the roadside, clutching a torn manifest.',
    choices: [
      { id: 'share', label: 'Share supplies', blurb: 'Give what you can spare.', outcome: 'You hand over a portion. The courier bows, and promises the road will remember it.', delta: { trust: 10, notoriety: -3, supplies: -1 }, requires: { minSupplies: 1 } },
      { id: 'reward', label: 'Demand a reward', blurb: 'Help has a price.', outcome: 'You name your price. The courier pays, and tells the story with a sneer.', delta: { trust: -5, notoriety: 7, supplies: 1 } },
      { id: 'pass', label: 'Pass by', blurb: 'Not your road, not your problem.', outcome: 'You walk on. The cart stays in the ditch, and so does your name.', delta: { trust: 0, notoriety: 0, supplies: 0 } },
    ],
  },
  {
    id: 1,
    title: 'A checkpoint',
    text: 'Guards hold the bridge road. They look at you, then at the lantern-lit ledger on the gate.',
    choices: [
      { id: 'fair', label: 'Trade fairly', blurb: 'Pay the toll in kind.', outcome: 'The toll is paid in kind. The ledger marks you as cooperative.', delta: { trust: 6, notoriety: 0, supplies: -1 }, requires: { minSupplies: 1 } },
      { id: 'name', label: 'Use your feared name', blurb: 'Let the legend open the gate.', outcome: 'The gate opens before you finish speaking. Nobody meets your eyes.', delta: { trust: -8, notoriety: 6, supplies: 1 }, requires: { minNotoriety: 60 } },
      { id: 'long', label: 'Take the long route', blurb: 'Slower, quieter.', outcome: 'You take the long road. It costs you time, not trust.', delta: { trust: 2, notoriety: -2, supplies: 0 } },
    ],
  },
  {
    id: 2,
    title: 'An invitation',
    text: 'A sealed invite, wax stamped, slid across a tavern table. The trusted sit on the other side, waiting to see what you do with it.',
    choices: [
      { id: 'join', label: 'Join the trusted table', blurb: 'Accept, and sit among them.', outcome: 'You sit at the trusted table. The conversation warms, and a chair is kept for you next time.', delta: { trust: 5, notoriety: -2, supplies: 1 }, requires: { minTrust: 20 } },
      { id: 'demand', label: 'Demand a seat', blurb: 'Take a chair that was not offered.', outcome: 'You take a chair that was not offered. The room goes quiet, then resumes without you.', delta: { trust: -6, notoriety: 8, supplies: 0 } },
      { id: 'behind', label: 'Work behind the scenes', blurb: 'Earn the invitation quietly.', outcome: 'You work from the edges. By morning, the invitation looks inevitable.', delta: { trust: 8, notoriety: -3, supplies: 0 } },
    ],
  },
  {
    id: 3,
    title: 'A disputed cache',
    text: 'Two families claim the same buried cache. Both are watching to see what you do with the spade.',
    choices: [
      { id: 'return', label: 'Return it', blurb: 'Hand it back to those who lost the most.', outcome: 'The cache goes back to those who lost the most. Word of it travels.', delta: { trust: 12, notoriety: -5, supplies: -1 }, requires: { minSupplies: 1 } },
      { id: 'keep', label: 'Keep it', blurb: 'Finders, keepers.', outcome: 'You keep the cache. The families remember, and so does everyone they tell.', delta: { trust: -10, notoriety: 10, supplies: 2 } },
      { id: 'untouched', label: 'Leave it untouched', blurb: 'Some quarrels are not yours.', outcome: 'You leave the spade in the dirt. The quarrel finds its own end.', delta: { trust: 2, notoriety: 0, supplies: 0 } },
    ],
  },
  {
    id: 4,
    title: 'A rumor about you',
    text: 'The rumor reached the market before you did: that you burned a granary, that you spared no one. Nobody asks if it is true.',
    choices: [
      { id: 'better', label: 'Earn a better story', blurb: 'Do something the storytellers cannot refuse.', outcome: 'You do something the storytellers cannot refuse. The loud rumor starves.', delta: { trust: 10, notoriety: -8, supplies: -1 }, requires: { minSupplies: 1 } },
      { id: 'scarier', label: 'Make it scarier', blurb: 'Let them wonder just how bad it gets.', outcome: 'You let the rumor grow teeth. The market whispers wider.', delta: { trust: -4, notoriety: 10, supplies: 0 } },
      { id: 'fade', label: 'Let it fade', blurb: 'Say nothing. Let the loud parts starve.', outcome: 'You say nothing. The rumor starves for lack of fuel.', delta: { trust: 0, notoriety: -3, supplies: 0 } },
    ],
  },
  {
    id: 5,
    title: 'A hungry traveler',
    text: 'A traveler blocks the path with empty hands and honest hunger, waiting to see which version of you steps forward.',
    choices: [
      { id: 'meal', label: 'Offer a meal', blurb: 'Share a portion without conditions.', outcome: 'You share a meal. The traveler eats, and remembers the kindness.', delta: { trust: 8, notoriety: -2, supplies: -1 }, requires: { minSupplies: 1 } },
      { id: 'info', label: 'Trade information', blurb: 'Food for news of the road ahead.', outcome: 'Food for news. Both of you leave knowing more.', delta: { trust: 2, notoriety: 2, supplies: 1 } },
      { id: 'scare', label: 'Scare them away', blurb: 'Remind them why people cross the street.', outcome: 'You remind them why people cross the street. They go hungry elsewhere.', delta: { trust: -6, notoriety: 6, supplies: 0 } },
    ],
  },
];

export const TEMPLATE_COUNT = TEMPLATES.length;

export function getTemplate(id: number): TemplateDef {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) throw new Error(`Unknown encounter template ${id}`);
  return t;
}

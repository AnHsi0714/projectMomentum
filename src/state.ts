export type ViewId = 'today' | 'week' | 'review';

export const state: { view: ViewId; selDate: Date } = {
  view: 'today',
  selDate: new Date(),
};

export function detectProductType(productName = '', category = '') {
  const name = (productName + ' ' + category).toLowerCase();
  if (
    name.includes('body wash') || name.includes('hand soap') ||
    name.includes('one wash') || name.includes('onewash') ||
    name.includes('bubble bath') || name.includes('lotion') ||
    name.includes('liquid soap') || name.includes('foaming soap') ||
    name.includes('massage oil') ||
    (name.includes('shampoo') && !name.includes('bar')) ||
    (name.includes('conditioner') && !name.includes('bar'))
  ) return 'liquid';
  if (name.includes('glycerine') || name.includes('glycerin')) return 'glycerine';
  if (
    name.includes('shampoo bar') || name.includes('bathing bar') ||
    name.includes('soap bar') || name.includes('bar soap') ||
    name.includes('shower puck') || name.includes('conditioner bar')
  ) return 'bar';
  if (name.includes('bath bomb') || name.includes('bath fizz') || name.includes('fizz')) return 'bomb';
  if (
    name.includes('cleaner') || name.includes('linen water') ||
    name.includes('laundry') || name.includes('dish soap') ||
    name.includes('all purpose') || name.includes('room freshener') ||
    name.includes('air mist') || name.includes('spray')
  ) return 'cleaner';
  return 'other';
}

export const PRODUCT_TYPE_STAGES = {
  liquid:    ['planned', 'batching', 'qc_hold', 'pending_qc', 'filling', 'completed'],
  bar:       ['planned', 'in_production', 'curing', 'completed'],
  bomb:      ['planned', 'in_production', 'completed'],
  glycerine: ['planned', 'in_production', 'curing', 'completed'],
  cleaner:   ['planned', 'in_production', 'completed'],
  other:     ['planned', 'in_production', 'completed'],
};

export const PRODUCT_TYPE_LABELS = {
  liquid: 'Liquid Product', bar: 'Bar Soap', bomb: 'Bath Bomb',
  glycerine: 'Glycerine Soap', cleaner: 'Cleaner / Linen', other: 'Other',
};

export const QC_HOLD_DAYS = { liquid: 3, bar: 0, bomb: 0, glycerine: 0, cleaner: 0, other: 0 };
export const CURING_DAYS  = { liquid: 0, bar: 7, bomb: 0, glycerine: 7, cleaner: 0, other: 0 };

export function getNextStatus(currentStatus, productType) {
  const stages = PRODUCT_TYPE_STAGES[productType] || PRODUCT_TYPE_STAGES.other;
  const idx = stages.indexOf(currentStatus);
  if (idx === -1 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
}

export const BATCH_STATUS_CONFIG = {
  planned:       { label: 'Planned',       color: 'blue',    bg: 'bg-blue-500' },
  in_production: { label: 'In Production', color: 'green',   bg: 'bg-green-500' },
  batching:      { label: 'Batching',      color: 'purple',  bg: 'bg-purple-500' },
  qc_hold:       { label: 'QC Hold',       color: 'amber',   bg: 'bg-amber-500' },
  pending_qc:    { label: 'Pending QC',    color: 'orange',  bg: 'bg-orange-500' },
  filling:       { label: 'Filling',       color: 'cyan',    bg: 'bg-cyan-500' },
  curing:        { label: 'Curing',        color: 'teal',    bg: 'bg-teal-500' },
  completed:     { label: 'Completed',     color: 'green',   bg: 'bg-zinc-500' },
  approved:      { label: 'Approved',      color: 'green',   bg: 'bg-green-700' },
  rejected:      { label: 'Rejected',      color: 'red',     bg: 'bg-red-500' },
  on_hold:       { label: 'On Hold',       color: 'amber',   bg: 'bg-amber-500' },
  draft:         { label: 'Draft',         color: 'default', bg: 'bg-zinc-600' },
  started:       { label: 'Started',       color: 'blue',    bg: 'bg-blue-500' },
};

export const ACTIVE_STATUSES = [
  'planned', 'in_production', 'batching', 'qc_hold',
  'pending_qc', 'filling', 'curing', 'started', 'on_hold', 'draft'
];

export function mapBatchStatusToGantt(status) {
  if (['planned'].includes(status)) return 'scheduled';
  if (['in_production', 'batching', 'filling', 'started'].includes(status)) return 'in_progress';
  if (['qc_hold', 'curing', 'on_hold', 'pending_qc'].includes(status)) return 'on_hold';
  if (['completed', 'approved'].includes(status)) return 'completed';
  return 'scheduled';
}